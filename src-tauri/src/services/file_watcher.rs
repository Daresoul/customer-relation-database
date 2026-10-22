use notify::{Watcher, RecursiveMode, Event, Result as NotifyResult, EventKind};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use glob::Pattern;
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use serde::{Serialize, Deserialize};
use crate::services::device_events::{deliver_result, AppSink, DeviceErrorKind, ResultSource};
use crate::services::file_storage::FileStorageService;

/// Read a file only once its size has stabilised, to avoid grabbing a
/// half-written file. Some analyzers (e.g. the Exigo) create the result file
/// empty and then stream content into it — or append to a single per-day file
/// over time — and the OS fires a create/modify event at each step. Polling
/// until two consecutive size samples match means we read the complete
/// document rather than a 0-byte or partial snapshot.
fn read_settled_file(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut last_len: Option<u64> = None;
    for _ in 0..10 {
        let len = std::fs::metadata(path)?.len();
        if Some(len) == last_len {
            break; // size stable across two samples → write has settled
        }
        last_len = Some(len);
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    std::fs::read(path)
}

/// Cheap non-cryptographic content fingerprint, used to skip re-processing a
/// file whose bytes haven't changed since we last handled it.
fn content_fingerprint(data: &[u8]) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    data.hash(&mut hasher);
    hasher.finish()
}

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

/// Update file watcher status and emit event to frontend
fn update_file_watcher_status(
    app_handle: Option<&tauri::AppHandle>,
    integration_id: i64,
    name: &str,
    watch_directory: &str,
    status: FileWatcherState,
    error: Option<String>,
) {
    log::info!("📂 File watcher status update - Integration ID: {}, Name: {}, Directory: {}, Status: {:?}",
        integration_id, name, watch_directory, status);

    if let Some(ref err) = error {
        log::error!("❌ File watcher error for '{}' ({}): {}", name, watch_directory, err);
    }

    let watcher_status = FileWatcherStatus {
        integration_id,
        name: name.to_string(),
        watch_directory: watch_directory.to_string(),
        status: status.clone(),
        last_error: error,
        error_kind: None,
        files_processed: 0,
        last_result_at: None,
    };

    // Store in global state
    {
        let mut statuses = get_file_watcher_status().lock().unwrap();
        statuses.insert(integration_id, watcher_status.clone());
        log::info!("💾 Stored file watcher status. Total active watchers: {}", statuses.len());
    }

    // Emit to frontend
    if let Some(handle) = app_handle {
        match handle.emit_all("file-watcher-status", &watcher_status) {
            Ok(_) => log::info!("📡 Emitted file-watcher-status event to frontend for '{}'", name),
            Err(e) => log::error!("❌ Failed to emit file-watcher-status event: {}", e),
        }
    }
}

/// Get all file watcher statuses
pub fn get_all_file_watcher_statuses() -> Vec<FileWatcherStatus> {
    let statuses = get_file_watcher_status().lock().unwrap();
    statuses.values().cloned().collect()
}

/// Re-send a watcher's status, e.g. after its last-result time changed.
pub fn emit_status_for(app_handle: &tauri::AppHandle, integration_id: i64) {
    let status = get_file_watcher_status().lock().unwrap().get(&integration_id).cloned();
    if let Some(status) = status {
        let _ = app_handle.emit_all("file-watcher-status", &status);
    }
}

/// Remove file watcher status when stopped
#[allow(dead_code)]
fn remove_file_watcher_status(integration_id: i64) {
    let mut statuses = get_file_watcher_status().lock().unwrap();
    statuses.remove(&integration_id);
}

pub struct FileWatcherService {
    db: Arc<DatabaseConnection>,
    watchers: HashMap<i64, notify::RecommendedWatcher>,
    app_handle: Option<tauri::AppHandle>,
}

impl FileWatcherService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            watchers: HashMap::new(),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, app_handle: tauri::AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Initialize file watchers for all enabled file-watch device integrations
    pub async fn initialize(&mut self) -> Result<(), String> {
        log::info!("🔍 Initializing file watchers for enabled device integrations...");

        // Query all enabled file-watch device integrations
        let integrations = self.db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, name, watch_directory, file_pattern, device_type
             FROM device_integrations
             WHERE connection_type = 'file_watch'
               AND enabled = 1
               AND deleted_at IS NULL",
            []
        ))
        .await
        .map_err(|e| {
            let error_msg = format!("Failed to query device integrations: {}", e);
            log::error!("❌ {}", error_msg);
            error_msg
        })?;

        if integrations.is_empty() {
            log::info!("ℹ️  No enabled file-watch integrations found");
            return Ok(());
        }

        log::info!("📋 Found {} enabled file-watch integration(s)", integrations.len());

        // Set up watcher for each integration
        for row in integrations {
            let id: i64 = row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?;
            let name: String = row.try_get("", "name").map_err(|e| format!("Failed to get name: {}", e))?;
            let watch_directory: Option<String> = row.try_get("", "watch_directory").ok();
            let file_pattern: Option<String> = row.try_get("", "file_pattern").ok();
            let device_type: String = row.try_get("", "device_type").map_err(|e| format!("Failed to get device_type: {}", e))?;

            log::info!("   📂 Setting up file watcher - ID: {}, Name: '{}', Device: {}",
                id, name, device_type);

            match (watch_directory, file_pattern) {
                (Some(dir), Some(pattern)) => {
                    log::info!("      Directory: {}, Pattern: {}", dir, pattern);
                    if let Err(e) = self.setup_watcher(id, &name, &dir, &pattern, &device_type).await {
                        log::error!("      ❌ Failed to setup watcher for '{}': {}", name, e);
                    } else {
                        log::info!("      ✅ Watcher setup successful for '{}'", name);
                    }
                }
                _ => {
                    log::warn!("      ⚠️  Integration '{}' missing watch_directory or file_pattern", name);
                }
            }
        }

        log::info!("✅ File watcher initialization complete");
        Ok(())
    }

    async fn setup_watcher(
        &mut self,
        id: i64,
        name: &str,
        directory: &str,
        pattern: &str,
        device_type: &str,
    ) -> Result<(), String> {
        log::info!("⚙️  Setting up file watcher - Integration ID: {}, Name: '{}', Device: {}",
            id, name, device_type);
        log::info!("   📂 Directory: {}", directory);
        log::info!("   🔍 Pattern: {}", pattern);

        let dir_path = PathBuf::from(directory);

        // Check if directory exists
        if !dir_path.exists() {
            let error_msg = format!("Directory does not exist: {}", directory);
            log::error!("❌ File watcher setup failed for '{}': {}", name, error_msg);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        if !dir_path.is_dir() {
            let error_msg = format!("Path is not a directory: {}", directory);
            log::error!("❌ File watcher setup failed for '{}': {}", name, error_msg);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        log::info!("   ✅ Directory validated successfully");

        // Create channel for file events
        let (_tx, _rx) = channel::<NotifyResult<Event>>();

        log::info!("   🔨 Compiling glob pattern: {}", pattern);

        // Compile glob pattern
        let glob_pattern = Pattern::new(pattern)
            .map_err(|e| {
                let error_msg = format!("Invalid glob pattern '{}': {}", pattern, e);
                log::error!("❌ Pattern compilation failed for '{}': {}", name, error_msg);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        log::info!("   ✅ Glob pattern compiled successfully");

        // Clone values for the watcher closure
        let name_clone = name.to_string();
        let device_type_clone = device_type.to_string();
        let _dir_clone = directory.to_string();
        let app_handle_clone = self.app_handle.clone();
        let db_clone = self.db.clone();

        // Create a deduplication cache (file path -> last processed timestamp)
        // path -> (last-processed unix secs, content fingerprint of what we imported)
        let processed_files: Arc<Mutex<HashMap<String, (u64, u64)>>> = Arc::new(Mutex::new(HashMap::new()));
        let processed_files_clone = processed_files.clone();

        log::info!("   🎧 Creating file system watcher for '{}'", name);

        // Create watcher
        let mut watcher = notify::recommended_watcher(move |res: NotifyResult<Event>| {
            match res {
                Ok(event) => {
                    // Process file creation AND modify events
                    // Note: On Windows, the notify crate reports CreateKind::Any for all file creations
                    // due to limitations in the ReadDirectoryChangesW API. Some editors also trigger
                    // Modify events instead of Create events when saving new files.
                    // See: https://github.com/notify-rs/notify/issues/261
                    if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        log::info!("📁 File event detected for '{}' - Event type: {:?}, Paths: {}",
                            name_clone, event.kind, event.paths.len());

                        for path in event.paths {
                            log::info!("   🔍 Processing path: {}", path.display());

                            if let Some(file_name) = path.file_name() {
                                let file_name_str = file_name.to_string_lossy().to_string();

                                // Check if file matches pattern
                                if glob_pattern.matches(&file_name_str) {
                                    log::info!("   ✅ File matches pattern: {}", file_name_str);
                                    // Get current timestamp
                                    let now = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .unwrap()
                                        .as_secs();

                                    let path_str = path.display().to_string();

                                    log::info!("   📖 Reading file (waiting for write to settle): {}", path.display());

                                    // Read and parse the file, waiting for the write to complete first.
                                    match read_settled_file(&path) {
                                        Ok(file_data) => {
                                            log::info!("   ✅ File read successfully - Size: {} bytes", file_data.len());

                                            // Skip empty reads. Instruments like the Exigo create the result
                                            // file before writing content, so create/modify events routinely
                                            // fire on a 0-byte file. Recording those produced ~half the Exigo
                                            // history as empty junk rows.
                                            if file_data.is_empty() {
                                                log::info!("   ⏭️  Skipping {} - file is empty (still being written or truncated)",
                                                    file_name_str);
                                                continue;
                                            }

                                            // Content-based deduplication: skip if we already imported these
                                            // exact bytes for this path. The instrument writes/appends to one
                                            // file per day and the OS fires many modify events for it, so a
                                            // short time-window filter alone re-imported the same content
                                            // repeatedly (up to 17× per file in production).
                                            let fingerprint = content_fingerprint(&file_data);
                                            let already_processed = {
                                                let cache = processed_files_clone.lock().unwrap();
                                                cache.get(&path_str).map(|&(_, h)| h) == Some(fingerprint)
                                            };
                                            if already_processed {
                                                log::info!("   ⏭️  Skipping {} - content unchanged since last import (deduplication)",
                                                    file_name_str);
                                                continue;
                                            }

                                            let Some(ref app_handle) = app_handle_clone else { continue };
                                            let storage_dir = match FileStorageService::get_storage_dir(app_handle) {
                                                Ok(dir) => dir,
                                                Err(e) => {
                                                    log::error!("   ❌ No storage folder for device results: {}", e);
                                                    continue;
                                                }
                                            };
                                            let source = ResultSource {
                                                integration_id: id,
                                                device_name: name_clone.clone(),
                                                device_type: device_type_clone.clone(),
                                                connection_method: "file_watch".to_string(),
                                            };
                                            let sink = AppSink { app: app_handle.clone() };
                                            tauri::async_runtime::block_on(deliver_result(
                                                &db_clone, &storage_dir, &sink, &source, &file_name_str, &file_data,
                                            ));
                                            let mut cache = processed_files_clone.lock().unwrap();
                                            cache.insert(path_str.clone(), (now, fingerprint));
                                            cache.retain(|_, &mut (timestamp, _)| now - timestamp < 86_400);
                                        }
                                        Err(e) => {
                                            log::error!("   ❌ Failed to read file {}: {}", path.display(), e);
                                        }
                                    }
                                } else {
                                    log::info!("   ⏭️  File does not match pattern: {}", file_name_str);
                                }
                            }
                        }
                    }
                }
                Err(e) => log::error!("❌ Watch error for '{}': {:?}", name_clone, e),
            }
        })
        .map_err(|e| {
            let error_msg = format!("Failed to create watcher: {}", e);
            log::error!("❌ {}", error_msg);
            error_msg
        })?;

        log::info!("   👀 Starting directory watch for: {}", directory);

        // Start watching the directory
        watcher.watch(&dir_path, RecursiveMode::NonRecursive)
            .map_err(|e| {
                let error_msg = format!("Failed to watch directory: {}", e);
                log::error!("❌ Failed to start watching directory for '{}': {}", name, error_msg);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        log::info!("   ✅ Directory watch active for: {}", directory);

        // Store watcher
        self.watchers.insert(id, watcher);
        log::info!("   📝 Watcher stored. Total active watchers: {}", self.watchers.len());

        // Update status to watching
        update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Watching, None);

        log::info!("✅ File watcher setup complete for '{}' (Integration ID: {})", name, id);

        Ok(())
    }

    /// Reload watchers (useful when device integrations are updated)
    #[allow(dead_code)]
    pub async fn reload(&mut self) -> Result<(), String> {
        // Clear existing watchers
        self.watchers.clear();

        // Re-initialize
        self.initialize().await
    }

    #[allow(dead_code)]
    pub fn active_watcher_count(&self) -> usize {
        self.watchers.len()
    }
}

#[cfg(test)]
mod tests {
    use super::{content_fingerprint, read_settled_file};
    use std::io::Write;

    #[test]
    fn fingerprint_is_stable_and_distinguishes_content() {
        let a = b"<ExigoResult>...</ExigoResult>";
        let b = b"<ExigoResult>...</ExigoResult>";
        let c = b"<ExigoResult>different</ExigoResult>";
        // Same bytes -> same fingerprint (so an unchanged re-read is deduped).
        assert_eq!(content_fingerprint(a), content_fingerprint(b));
        // Different bytes -> different fingerprint (so new/appended content imports).
        assert_ne!(content_fingerprint(a), content_fingerprint(c));
    }

    #[test]
    fn read_settled_file_returns_full_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("BM-53672_result.xml");
        let payload = b"<ExigoResult><WBC>8.1</WBC></ExigoResult>";
        std::fs::File::create(&path).unwrap().write_all(payload).unwrap();

        let data = read_settled_file(&path).unwrap();
        assert_eq!(data, payload);
    }

    #[test]
    fn read_settled_file_reports_empty_for_zero_byte_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("BM-53672_empty.xml");
        std::fs::File::create(&path).unwrap(); // 0 bytes

        // The caller (watcher) treats an empty read as "skip"; here we just
        // confirm the helper faithfully reports emptiness rather than erroring.
        let data = read_settled_file(&path).unwrap();
        assert!(data.is_empty());
    }
}
