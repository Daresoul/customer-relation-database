use notify::{Watcher, RecursiveMode, Event, Result as NotifyResult, EventKind};
use std::path::{Path, PathBuf};
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use tauri::Manager;
use serde::{Serialize, Deserialize};
use crate::services::device_events::{
    deliver_result, last_result, raise, AppSink, DeviceErrorKind, DeviceEventKind, DeviceSink, ResultSource,
};
use crate::services::file_storage::FileStorageService;

// Track connection status for file watchers
static FILE_WATCHER_STATUS: OnceLock<Mutex<HashMap<i64, FileWatcherStatus>>> = OnceLock::new();

fn get_file_watcher_status() -> &'static Mutex<HashMap<i64, FileWatcherStatus>> {
    FILE_WATCHER_STATUS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FileWatcherStatus {
    pub integration_id: i64,
    pub name: String,
    pub watch_directory: String,
    pub status: FileWatcherState,
    pub last_error: Option<String>,
    pub error_kind: Option<DeviceErrorKind>,
    pub files_processed: u32,
    pub last_result_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum FileWatcherState {
    Watching,
    Error,
    Stopped,
}

/// Store a watcher's status and tell the frontend, unless nothing changed
/// (the folder check runs every 30 s and shouldn't repeat itself).
fn update_file_watcher_status(
    app_handle: Option<&tauri::AppHandle>,
    config: &WatchConfig,
    status: FileWatcherState,
    error: Option<String>,
    error_kind: Option<DeviceErrorKind>,
) {
    let watcher_status = FileWatcherStatus {
        integration_id: config.integration_id,
        name: config.name.clone(),
        watch_directory: config.directory.clone(),
        status,
        last_error: error,
        error_kind,
        files_processed: 0,
        last_result_at: last_result(config.integration_id),
    };

    {
        let mut statuses = get_file_watcher_status().lock().unwrap_or_else(|p| p.into_inner());
        let unchanged = statuses.get(&config.integration_id).is_some_and(|prev| {
            prev.status == watcher_status.status
                && prev.error_kind == watcher_status.error_kind
                && prev.watch_directory == watcher_status.watch_directory
        });
        statuses.insert(config.integration_id, watcher_status.clone());
        if unchanged {
            return;
        }
    }
    crate::services::device_health::record_status(
        config.integration_id,
        &format!("{:?}", watcher_status.status),
        watcher_status.error_kind,
        crate::services::device_health::folder_health(&watcher_status),
    );

    log::info!("📂 File watcher '{}' ({}): {:?} {}", config.name, config.directory,
        watcher_status.status, watcher_status.last_error.as_deref().unwrap_or(""));
    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit_all("file-watcher-status", &watcher_status) {
            log::error!("❌ Failed to emit file-watcher-status event: {}", e);
        }
    }
}

/// Get all file watcher statuses
pub fn get_all_file_watcher_statuses() -> Vec<FileWatcherStatus> {
    let statuses = get_file_watcher_status().lock().unwrap_or_else(|p| p.into_inner());
    statuses.values().cloned().collect()
}

/// Re-send a watcher's status, e.g. after its last-result time changed.
pub fn emit_status_for(app_handle: &tauri::AppHandle, integration_id: i64) {
    let status = get_file_watcher_status().lock().unwrap_or_else(|p| p.into_inner()).get(&integration_id).cloned();
    if let Some(mut status) = status {
        status.last_result_at = last_result(integration_id);
        let _ = app_handle.emit_all("file-watcher-status", &status);
    }
}

fn remove_file_watcher_status(integration_id: i64) {
    let mut statuses = get_file_watcher_status().lock().unwrap_or_else(|p| p.into_inner());
    statuses.remove(&integration_id);
}

/// Stable 64-bit FNV-1a; std's hasher may change between Rust releases, and
/// these keys are stored.
fn fnv1a64(data: &[u8]) -> u64 {
    data.iter().fold(0xcbf29ce484222325u64, |hash, &b| (hash ^ b as u64).wrapping_mul(0x100000001b3))
}

/// One complete `<sample>` from an Exigo per-day file, as its own document.
#[derive(Debug, Clone, PartialEq)]
pub struct ExigoSample {
    pub key: String,
    pub seq: Option<String>,
    pub xml: Vec<u8>,
}

/// The BM800 appends every animal of the day to one file. Each complete
/// `<sample>` becomes its own document, keyed by instrument serial (SNO) and
/// run number (SEQ), so a re-read, a restart or an edited ID never offers a
/// sample twice. A sample still being written is left for the next read.
pub fn split_exigo_samples(data: &[u8]) -> Vec<ExigoSample> {
    use quick_xml::events::{BytesStart, Event as XmlEvent};

    fn is_sample(e: &BytesStart) -> bool {
        e.name().as_ref().eq_ignore_ascii_case(b"sample")
    }
    fn ids(e: &BytesStart) -> (Option<String>, Option<String>) {
        let mut sno = None;
        let mut seq = None;
        for attr in e.attributes().flatten() {
            let value = String::from_utf8_lossy(&attr.value).trim().to_string();
            match attr.key.as_ref() {
                b"SNO" if !value.is_empty() => sno = Some(value),
                b"SEQ" if !value.is_empty() => seq = Some(value),
                _ => {}
            }
        }
        (sno, seq)
    }
    fn sample(raw: &[u8], sno: Option<String>, seq: Option<String>) -> ExigoSample {
        let key = match (&sno, &seq) {
            (Some(sno), Some(seq)) => format!("{}:{}", sno, seq),
            _ => format!("sample:{:016x}", fnv1a64(raw)),
        };
        let mut xml = b"<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<samples>\n".to_vec();
        xml.extend_from_slice(raw);
        xml.extend_from_slice(b"\n</samples>\n");
        ExigoSample { key, seq, xml }
    }

    let mut reader = quick_xml::Reader::from_reader(data);
    let mut buf = Vec::new();
    let mut samples = Vec::new();
    let mut open: Option<(usize, Option<String>, Option<String>)> = None;

    loop {
        let start = reader.buffer_position();
        match reader.read_event_into(&mut buf) {
            Ok(XmlEvent::Empty(e)) if is_sample(&e) => {
                let (sno, seq) = ids(&e);
                samples.push(sample(&data[start..reader.buffer_position()], sno, seq));
            }
            Ok(XmlEvent::Start(e)) if is_sample(&e) => {
                let (sno, seq) = ids(&e);
                open = Some((start, sno, seq));
            }
            Ok(XmlEvent::End(e)) if e.name().as_ref().eq_ignore_ascii_case(b"sample") => {
                if let Some((from, sno, seq)) = open.take() {
                    samples.push(sample(&data[from..reader.buffer_position()], sno, seq));
                }
            }
            Ok(XmlEvent::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    samples
}

/// Wait until the file's size and modified time have not changed for
/// `stable_for` (or `max_wait` runs out). A file untouched for that long
/// already counts as settled.
pub fn wait_until_settled(
    path: &Path,
    stable_for: Duration,
    poll: Duration,
    max_wait: Duration,
) -> std::io::Result<()> {
    fn snapshot(path: &Path) -> std::io::Result<(u64, Option<SystemTime>)> {
        let meta = std::fs::metadata(path)?;
        Ok((meta.len(), meta.modified().ok()))
    }

    let deadline = Instant::now() + max_wait;
    let mut last = snapshot(path)?;
    if let Some(modified) = last.1 {
        if SystemTime::now().duration_since(modified).is_ok_and(|age| age >= stable_for) {
            return Ok(());
        }
    }
    let mut stable_since = Instant::now();
    loop {
        if stable_since.elapsed() >= stable_for || Instant::now() >= deadline {
            return Ok(());
        }
        std::thread::sleep(poll);
        let now = snapshot(path)?;
        if now != last {
            last = now;
            stable_since = Instant::now();
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchConfig {
    pub integration_id: i64,
    pub name: String,
    pub directory: String,
    pub pattern: String,
    pub device_type: String,
    /// When the machine was set up in Arkivet.
    pub set_up_at: Option<SystemTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DirState {
    Present,
    Missing,
    NotAFolder,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchAction {
    Start(WatchConfig),
    Stop(i64),
    Lost(WatchConfig),
    Unavailable(WatchConfig, DeviceErrorKind),
}

/// Compare the enabled folder integrations with the running watchers and say
/// what to do: start new or reappeared folders, stop removed or changed ones,
/// and notice a watched folder that has gone.
pub fn plan_watchers(
    desired: &[WatchConfig],
    active: &HashMap<i64, WatchConfig>,
    dir_state: &dyn Fn(&str) -> DirState,
) -> Vec<WatchAction> {
    let mut actions = Vec::new();

    let mut removed: Vec<i64> = active
        .keys()
        .filter(|id| !desired.iter().any(|d| d.integration_id == **id))
        .copied()
        .collect();
    removed.sort_unstable();
    actions.extend(removed.into_iter().map(WatchAction::Stop));

    for config in desired {
        match active.get(&config.integration_id) {
            Some(running) if running == config => {
                if dir_state(&config.directory) != DirState::Present {
                    actions.push(WatchAction::Lost(config.clone()));
                }
                continue;
            }
            Some(_) => actions.push(WatchAction::Stop(config.integration_id)),
            None => {}
        }
        actions.push(match dir_state(&config.directory) {
            DirState::Present => WatchAction::Start(config.clone()),
            DirState::Missing => WatchAction::Unavailable(config.clone(), DeviceErrorKind::FolderMissing),
            DirState::NotAFolder => WatchAction::Unavailable(config.clone(), DeviceErrorKind::NotAFolder),
        });
    }
    actions
}

/// Glob match on the file name, ignoring case (`*.xml` matches `.XML`).
pub fn pattern_matches(pattern: &str, file_name: &str) -> bool {
    let options = glob::MatchOptions {
        case_sensitive: false,
        require_literal_separator: false,
        require_literal_leading_dot: false,
    };
    glob::Pattern::new(pattern).is_ok_and(|p| p.matches_with(file_name, options))
}

/// What a watched folder's results are delivered with.
pub struct WatchContext {
    pub db: Arc<DatabaseConnection>,
    pub storage_dir: PathBuf,
    pub config: WatchConfig,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessMode {
    Offer,
    /// Remember what's there without offering it (first look at a folder).
    Seed,
}

const SETTLE_FOR: Duration = Duration::from_secs(1);
const SETTLE_POLL: Duration = Duration::from_millis(250);
const SETTLE_MAX: Duration = Duration::from_secs(15);

/// Record that a sample was handled. False when it already was.
async fn claim(ctx: &WatchContext, key: &str, file_name: &str) -> Result<bool, String> {
    let result = ctx.db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT OR IGNORE INTO device_processed_samples (integration_id, sample_key, file_name) VALUES (?, ?, ?)",
        [ctx.config.integration_id.into(), key.into(), file_name.into()],
    ))
    .await
    .map_err(|e| format!("Failed to record processed sample: {}", e))?;
    Ok(result.rows_affected() == 1)
}

/// A per-day file's `<samples>` or `<sample …>` element. XML names are
/// case-sensitive, so the single-result format's `<SampleId>` doesn't count.
fn has_day_file_element(text: &str) -> bool {
    text.match_indices("<sample").any(|(at, tag)| {
        matches!(
            text[at + tag.len()..].chars().next(),
            Some(c) if c.is_whitespace() || c == '>' || c == '/' || c == 's'
        )
    })
}

/// Read a watched file and deliver each result in it that hasn't been handled
/// before. Returns how many results were offered.
pub async fn process_file(
    ctx: &WatchContext,
    sink: &dyn DeviceSink,
    path: &Path,
    mode: ProcessMode,
) -> Result<usize, String> {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| format!("Not a file: {}", path.display()))?;

    if mode == ProcessMode::Offer {
        wait_until_settled(path, SETTLE_FOR, SETTLE_POLL, SETTLE_MAX)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    }
    let data = std::fs::read(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    if data.is_empty() {
        return Ok(0);
    }

    let mut units: Vec<(String, String, Vec<u8>)> = Vec::new();
    if ctx.config.device_type == "exigo_eos_vet" {
        let stem = Path::new(&file_name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        for (index, s) in split_exigo_samples(&data).into_iter().enumerate() {
            let suffix = s.seq.clone().unwrap_or_else(|| (index + 1).to_string());
            units.push((s.key, format!("{}_{}.xml", stem, suffix), s.xml));
        }
        if units.is_empty() && has_day_file_element(&String::from_utf8_lossy(&data)) {
            // First sample of the day still being written.
            return Ok(0);
        }
    }
    if units.is_empty() {
        let key = format!("file:{}:{:016x}", file_name, fnv1a64(&data));
        units.push((key, file_name.clone(), data));
    }

    let source = ResultSource {
        integration_id: ctx.config.integration_id,
        device_name: ctx.config.name.clone(),
        device_type: ctx.config.device_type.clone(),
        connection_method: "file_watch".to_string(),
    };
    let mut offered = 0;
    for (key, name, bytes) in units {
        if !claim(ctx, &key, &file_name).await? || mode == ProcessMode::Seed {
            continue;
        }
        log::info!("📄 New result in {} ({}) from '{}'", file_name, key, ctx.config.name);
        if deliver_result(&ctx.db, &ctx.storage_dir, sink, &source, &name, &bytes).await.parsed {
            offered += 1;
        }
    }
    Ok(offered)
}

/// Files older than this are not looked at when the app starts.
pub const CATCH_UP_WINDOW: Duration = Duration::from_secs(72 * 3600);

/// On start, offer results that arrived while the app was closed. The first
/// time a folder is watched, everything already in it is remembered instead,
/// so old results aren't offered as new.
pub async fn catch_up(ctx: &WatchContext, sink: &dyn DeviceSink) -> Result<usize, String> {
    let seen: i64 = ctx.db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM device_processed_samples WHERE integration_id = ?",
        [ctx.config.integration_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to read processed samples: {}", e))?
    .and_then(|row| row.try_get("", "c").ok())
    .unwrap_or(0);
    let first_look = seen == 0;
    let files = matching_files(ctx)?;

    let now = SystemTime::now();
    let mut offered = 0;
    for (modified, path) in files {
        let result = if first_look {
            process_file(ctx, sink, &path, ProcessMode::Seed).await
        } else if now.duration_since(modified).map_or(true, |age| age <= CATCH_UP_WINDOW) {
            process_file(ctx, sink, &path, ProcessMode::Offer).await
        } else {
            continue;
        };
        match result {
            Ok(n) => offered += n,
            Err(e) => log::warn!("Catch-up skipped {}: {}", path.display(), e),
        }
    }
    if offered > 0 {
        log::info!("📥 '{}': {} result(s) arrived while the app was closed", ctx.config.name, offered);
    }
    Ok(offered)
}

/// Files changed this recently are re-checked by the periodic rescan.
pub const RESCAN_WINDOW: Duration = Duration::from_secs(15 * 60);

/// Offer results in recently changed files that no folder event reported
/// (events are lost on network shares, after sleep, or when the OS buffer
/// overflows). Already-offered samples are skipped.
pub async fn rescan_recent(ctx: &WatchContext, sink: &dyn DeviceSink) -> Result<usize, String> {
    let now = SystemTime::now();
    let mut offered = 0;
    for (modified, path) in matching_files(ctx)? {
        if now.duration_since(modified).map_or(false, |age| age > RESCAN_WINDOW) {
            continue;
        }
        match process_file(ctx, sink, &path, ProcessMode::Offer).await {
            Ok(n) => offered += n,
            Err(e) => log::warn!("Rescan skipped {}: {}", path.display(), e),
        }
    }
    if offered > 0 {
        log::warn!("📥 '{}': rescan found {} result(s) the folder events missed", ctx.config.name, offered);
    }
    Ok(offered)
}

/// The watched folder's files that match its pattern, oldest first.
fn matching_files(ctx: &WatchContext) -> Result<Vec<(SystemTime, PathBuf)>, String> {
    let entries = std::fs::read_dir(&ctx.config.directory)
        .map_err(|e| format!("Failed to list {}: {}", ctx.config.directory, e))?;
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter(|e| pattern_matches(&ctx.config.pattern, &e.file_name().to_string_lossy()))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    files.sort();
    Ok(files)
}

struct ActiveWatcher {
    config: WatchConfig,
    _watcher: notify::RecommendedWatcher,
}

struct WatcherRuntime {
    db: Arc<DatabaseConnection>,
    app: tauri::AppHandle,
}

static ACTIVE_WATCHERS: OnceLock<Mutex<HashMap<i64, ActiveWatcher>>> = OnceLock::new();
static RUNTIME: OnceLock<WatcherRuntime> = OnceLock::new();
static SYNC_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn active_watchers() -> std::sync::MutexGuard<'static, HashMap<i64, ActiveWatcher>> {
    ACTIVE_WATCHERS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|p| p.into_inner())
}

const FOLDER_CHECK_INTERVAL: Duration = Duration::from_secs(30);

async fn enabled_folder_configs(db: &DatabaseConnection) -> Result<Vec<WatchConfig>, String> {
    let rows = db.query_all(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT id, name, watch_directory, file_pattern, device_type
         FROM device_integrations
         WHERE connection_type = 'file_watch'
           AND enabled = 1
           AND deleted_at IS NULL",
    ))
    .await
    .map_err(|e| format!("Failed to query device integrations: {}", e))?;

    Ok(rows
        .iter()
        .filter_map(|row| {
            let directory: Option<String> = row.try_get("", "watch_directory").ok().flatten();
            let pattern: Option<String> = row.try_get("", "file_pattern").ok().flatten();
            Some(WatchConfig {
                integration_id: row.try_get("", "id").ok()?,
                name: row.try_get("", "name").ok()?,
                directory: directory.filter(|d| !d.trim().is_empty())?,
                pattern: pattern.filter(|p| !p.trim().is_empty())?,
                device_type: row.try_get("", "device_type").ok()?,
                set_up_at: None,
            })
        })
        .collect())
}

fn dir_state(directory: &str) -> DirState {
    match std::fs::metadata(directory) {
        Ok(meta) if meta.is_dir() => DirState::Present,
        Ok(_) => DirState::NotAFolder,
        Err(_) => DirState::Missing,
    }
}

/// Bring the running watchers in line with the settings and the folders on
/// disk. Runs at start, after any device settings change, and every 30 s.
async fn sync_watchers(runtime: &WatcherRuntime) -> Result<(), String> {
    let _guard = SYNC_LOCK.get_or_init(|| tokio::sync::Mutex::new(())).lock().await;

    let desired = enabled_folder_configs(&runtime.db).await?;
    let dirs: Vec<String> = desired.iter().map(|c| c.directory.clone()).collect();
    // A dropped network share can make a metadata call hang for a while.
    let states: HashMap<String, DirState> = tokio::task::spawn_blocking(move || {
        dirs.into_iter().map(|d| { let s = dir_state(&d); (d, s) }).collect()
    })
    .await
    .map_err(|e| format!("Folder check failed: {}", e))?;

    let active: HashMap<i64, WatchConfig> = active_watchers()
        .iter()
        .map(|(id, w)| (*id, w.config.clone()))
        .collect();
    let actions = plan_watchers(&desired, &active, &|d: &str| {
        states.get(d).copied().unwrap_or(DirState::Missing)
    });

    for action in actions {
        match action {
            WatchAction::Stop(id) => {
                active_watchers().remove(&id);
                if !desired.iter().any(|c| c.integration_id == id) {
                    remove_file_watcher_status(id);
                }
                log::info!("⏹️  Stopped file watcher for integration {}", id);
            }
            WatchAction::Unavailable(config, kind) => {
                let message = match kind {
                    DeviceErrorKind::NotAFolder => format!("Path is not a directory: {}", config.directory),
                    _ => format!("Directory does not exist: {}", config.directory),
                };
                update_file_watcher_status(Some(&runtime.app), &config, FileWatcherState::Error, Some(message), Some(kind));
            }
            WatchAction::Lost(config) => {
                active_watchers().remove(&config.integration_id);
                update_file_watcher_status(
                    Some(&runtime.app), &config, FileWatcherState::Error,
                    Some(format!("Directory is no longer reachable: {}", config.directory)),
                    Some(DeviceErrorKind::FolderLost),
                );
                let source = ResultSource {
                    integration_id: config.integration_id,
                    device_name: config.name.clone(),
                    device_type: config.device_type.clone(),
                    connection_method: "file_watch".to_string(),
                };
                raise(&runtime.db, &AppSink { app: runtime.app.clone() }, &source, DeviceEventKind::FolderLost,
                    Some(config.directory.clone()), None, None).await;
            }
            WatchAction::Start(config) => {
                if let Err(e) = start_watcher(runtime, config.clone()).await {
                    update_file_watcher_status(Some(&runtime.app), &config, FileWatcherState::Error, Some(e), Some(DeviceErrorKind::Unknown));
                }
            }
        }
    }
    Ok(())
}

fn watch_context(runtime: &WatcherRuntime, config: WatchConfig) -> Result<WatchContext, String> {
    Ok(WatchContext {
        db: runtime.db.clone(),
        storage_dir: FileStorageService::get_storage_dir(&runtime.app)?,
        config,
    })
}

async fn start_watcher(runtime: &WatcherRuntime, config: WatchConfig) -> Result<(), String> {
    log::info!("👀 Watching '{}' in {} for {}", config.name, config.directory, config.pattern);
    let ctx = Arc::new(watch_context(runtime, config.clone())?);
    let sink = AppSink { app: runtime.app.clone() };

    // Remember what's already there before the first event can offer it.
    let seen: i64 = ctx.db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM device_processed_samples WHERE integration_id = ?",
        [config.integration_id.into()],
    ))
    .await
    .ok()
    .flatten()
    .and_then(|row| row.try_get("", "c").ok())
    .unwrap_or(0);
    if seen == 0 {
        if let Err(e) = catch_up(&ctx, &sink).await {
            log::warn!("First look at '{}' failed: {}", config.directory, e);
        }
    }

    let callback_ctx = ctx.clone();
    let callback_app = runtime.app.clone();
    let mut watcher = notify::recommended_watcher(move |res: NotifyResult<Event>| {
        let event = match res {
            Ok(event) => event,
            Err(e) => {
                log::error!("❌ Watch error for '{}': {:?}", callback_ctx.config.name, e);
                return;
            }
        };
        // Windows reports most creations as Create(Any), and some writers only
        // fire Modify, so both count.
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
            return;
        }
        let sink = AppSink { app: callback_app.clone() };
        for path in event.paths {
            let matches = path
                .file_name()
                .is_some_and(|n| pattern_matches(&callback_ctx.config.pattern, &n.to_string_lossy()));
            if !matches || !path.is_file() {
                continue;
            }
            if let Err(e) = tauri::async_runtime::block_on(process_file(&callback_ctx, &sink, &path, ProcessMode::Offer)) {
                log::error!("❌ {}", e);
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(Path::new(&config.directory), RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    active_watchers().insert(config.integration_id, ActiveWatcher { config: config.clone(), _watcher: watcher });
    update_file_watcher_status(Some(&runtime.app), &config, FileWatcherState::Watching, None, None);

    if seen > 0 {
        let catch_up_ctx = ctx.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = catch_up(&catch_up_ctx, &sink).await {
                log::warn!("Catch-up for '{}' failed: {}", catch_up_ctx.config.name, e);
            }
        });
    }
    Ok(())
}

/// Re-read folder integrations from the settings and restart watchers that
/// changed. Call after any device integration is created, edited, toggled or
/// deleted.
pub async fn reload_file_watchers() {
    if let Some(runtime) = RUNTIME.get() {
        if let Err(e) = sync_watchers(runtime).await {
            log::error!("❌ Failed to reload file watchers: {}", e);
        }
    }
}

/// Rescan every 4th folder check, i.e. every 2 minutes.
const RESCAN_EVERY_CHECKS: u32 = 4;

async fn rescan_active_watchers() {
    let Some(runtime) = RUNTIME.get() else { return };
    let configs: Vec<WatchConfig> = active_watchers().values().map(|w| w.config.clone()).collect();
    let sink = AppSink { app: runtime.app.clone() };
    for config in configs {
        let name = config.name.clone();
        let result = match watch_context(runtime, config) {
            Ok(ctx) => rescan_recent(&ctx, &sink).await,
            Err(e) => Err(e),
        };
        if let Err(e) = result {
            log::warn!("Rescan of '{}' failed: {}", name, e);
        }
    }
}

pub struct FileWatcherService {
    db: Arc<DatabaseConnection>,
    app_handle: Option<tauri::AppHandle>,
}

impl FileWatcherService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db, app_handle: None }
    }

    pub fn set_app_handle(&mut self, app_handle: tauri::AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Start watchers for all enabled folder integrations, then keep checking
    /// every 30 s for missing folders that came back and watched ones that went.
    pub async fn initialize(&mut self) -> Result<(), String> {
        let app = self.app_handle.clone().ok_or("File watcher needs the app handle")?;
        let first_start = RUNTIME.set(WatcherRuntime { db: self.db.clone(), app }).is_ok();
        let runtime = RUNTIME.get().ok_or("File watcher runtime missing")?;

        // The loop starts before the first sync: a failed first sync is then
        // retried 30 s later instead of leaving no folder watched all session.
        if first_start {
            tauri::async_runtime::spawn(async {
                let mut checks: u32 = 0;
                loop {
                    tokio::time::sleep(FOLDER_CHECK_INTERVAL).await;
                    reload_file_watchers().await;
                    checks = checks.wrapping_add(1);
                    if checks % RESCAN_EVERY_CHECKS == 0 {
                        rescan_active_watchers().await;
                    }
                }
            });
        }
        sync_watchers(runtime).await
    }
}
