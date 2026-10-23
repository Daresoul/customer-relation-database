use chrono::Utc;
use serde::{Deserialize, Serialize};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use crate::commands::file_history::record_device_file_with_status;
use crate::services::device_health;
use crate::services::device_integration::DeviceIntegrationService;
use crate::services::device_parser::{DeviceData, DeviceParserService};
use crate::services::device_capture::throttled_show_and_focus;
use crate::services::file_storage::FileStorageService;
use tauri::Manager;

/// Why a device can't be reached. The frontend turns each kind into a
/// translated "what happened / what to do" pair; the raw OS text stays in
/// `last_error` for the Details tooltip.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceErrorKind {
    PortMissing,
    PortBusy,
    AccessDenied,
    Disconnected,
    FolderMissing,
    FolderLost,
    NotAFolder,
    /// The listener thread ended on its own (a crash); Reconnect starts it again.
    ListenerStopped,
    Unknown,
}

/// Something went wrong with data a device sent. Sent to the frontend as the
/// `device-event` Tauri event and shown as a toast.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceEventKind {
    ParseFailed,
    EmptyResult,
    CutOff,
    SaveFailed,
    FolderLost,
}

impl DeviceEventKind {
    /// i18n key in the `devices` namespace.
    pub fn message_key(self) -> &'static str {
        match self {
            DeviceEventKind::ParseFailed => "events.parseFailed",
            DeviceEventKind::EmptyResult => "events.emptyResult",
            DeviceEventKind::CutOff => "events.cutOff",
            DeviceEventKind::SaveFailed => "events.saveFailed",
            DeviceEventKind::FolderLost => "events.folderLost",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEvent {
    pub integration_id: Option<i64>,
    pub device_name: String,
    pub device_type: String,
    pub kind: DeviceEventKind,
    pub message_key: String,
    pub detail: Option<String>,
    pub file_name: Option<String>,
    pub file_id: Option<String>,
    pub at: String,
}

/// The parsers report "read fine, but no values" as an error whose text says
/// "yielded no ...". That is a machine sending an empty result, not garbage.
pub fn classify_parse_error(error: &str) -> DeviceEventKind {
    if error.contains("yielded no analyte values") || error.contains("yielded no data") {
        DeviceEventKind::EmptyResult
    } else {
        DeviceEventKind::ParseFailed
    }
}

/// The HL7 and Healvet parsers also say "no values" for bytes that aren't a
/// message at all; only a real header makes it an empty result.
fn has_message_header(raw: &[u8]) -> bool {
    let text = String::from_utf8_lossy(raw);
    text.contains("MSH|") || text.contains("#AFS1000") || text.contains("<sample") || text.contains("<?xml")
}

/// How long an identical serial frame from the same machine counts as a resend.
const REPEAT_WINDOW: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// Hashes of recent serial frames per integration, to drop a machine's resend.
#[derive(Default)]
pub struct FrameMemory {
    seen: HashMap<(i64, u64), std::time::Instant>,
}

impl FrameMemory {
    /// True when this machine sent the same bytes within the last 10 minutes.
    /// Records the frame either way.
    pub fn seen_recently(&mut self, integration_id: i64, frame: &[u8], now: std::time::Instant) -> bool {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        frame.hash(&mut hasher);
        let key = (integration_id, hasher.finish());
        self.seen.retain(|_, at| now.saturating_duration_since(*at) < REPEAT_WINDOW);
        self.seen.insert(key, now).is_some()
    }
}

/// One memory per storage folder: the app has one, each test its own.
static RECENT_FRAMES: OnceLock<Mutex<HashMap<std::path::PathBuf, FrameMemory>>> = OnceLock::new();

fn is_repeated_frame(storage_dir: &Path, integration_id: i64, frame: &[u8]) -> bool {
    let mut all = RECENT_FRAMES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    all.entry(storage_dir.to_path_buf())
        .or_default()
        .seen_recently(integration_id, frame, std::time::Instant::now())
}

static LAST_RESULT: OnceLock<Mutex<HashMap<i64, String>>> = OnceLock::new();
static LAST_BYTE: OnceLock<Mutex<HashMap<i64, String>>> = OnceLock::new();

fn times(map: &'static OnceLock<Mutex<HashMap<i64, String>>>) -> std::sync::MutexGuard<'static, HashMap<i64, String>> {
    map.get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn note_result(integration_id: i64, at: &str) {
    times(&LAST_RESULT).insert(integration_id, at.to_string());
}

/// Keep a stored time from an earlier run unless this run already has one.
pub fn seed_last_result(integration_id: i64, at: &str) {
    times(&LAST_RESULT).entry(integration_id).or_insert_with(|| at.to_string());
}

pub fn last_result(integration_id: i64) -> Option<String> {
    times(&LAST_RESULT).get(&integration_id).cloned()
}

pub fn note_bytes(integration_id: i64) {
    times(&LAST_BYTE).insert(integration_id, Utc::now().to_rfc3339());
}

pub fn last_bytes(integration_id: i64) -> Option<String> {
    times(&LAST_BYTE).get(&integration_id).cloned()
}

/// The `device-data-received` payload: the parsed data plus `fileId`, the
/// `file_access_history.file_id` of the saved copy (null if saving failed).
pub fn result_payload(data: &DeviceData, file_id: Option<&str>) -> serde_json::Value {
    let mut payload = serde_json::to_value(data).unwrap_or_else(|_| serde_json::json!({}));
    if let Some(map) = payload.as_object_mut() {
        map.insert("fileId".to_string(), file_id.map(Into::into).unwrap_or(serde_json::Value::Null));
    }
    payload
}

/// Where delivered results and events go. The app sends them to the webview;
/// tests record them.
pub trait DeviceSink: Send + Sync {
    fn result_ready(&self, payload: &serde_json::Value, data: &DeviceData);
    fn device_event(&self, event: &DeviceEvent);
    fn result_recorded(&self, integration_id: i64);
}

/// Sends results and events to the webview, and wakes the window from the
/// tray when a result arrives.
pub struct AppSink {
    pub app: tauri::AppHandle,
}

impl DeviceSink for AppSink {
    fn result_ready(&self, payload: &serde_json::Value, data: &DeviceData) {
        if let Err(e) = self.app.emit_all("device-data-received", payload) {
            log::error!("Failed to emit device data to frontend: {}", e);
        }

        let is_hidden = self.app.get_window("main")
            .map(|w| !w.is_visible().unwrap_or(true))
            .unwrap_or(false);
        if !is_hidden {
            return;
        }
        throttled_show_and_focus(&self.app);
        let wake = if data.connection_method == "file_watch" {
            serde_json::json!({
                "cause": "file",
                "fileName": data.original_file_name,
                "device": data.device_name,
                "deviceType": data.device_type,
            })
        } else {
            let code = data.patient_identifier.clone().unwrap_or_default();
            let looks_like_chip = code.chars().all(|c| c.is_ascii_digit()) && (code.len() == 15 || code.len() == 10);
            serde_json::json!({
                "cause": if looks_like_chip { "scan" } else { "device_data" },
                "code": code,
                "device": data.device_name,
                "deviceType": data.device_type,
            })
        };
        let _ = self.app.emit_all("wake-from-tray", wake);
    }

    fn device_event(&self, event: &DeviceEvent) {
        log::warn!("Device event {:?} from {}: {}", event.kind, event.device_name,
            event.detail.as_deref().unwrap_or(""));
        if let Err(e) = self.app.emit_all("device-event", event) {
            log::error!("Failed to emit device-event: {}", e);
        }
    }

    fn result_recorded(&self, integration_id: i64) {
        crate::services::device_input::emit_status_for(&self.app, integration_id);
        crate::services::file_watcher::emit_status_for(&self.app, integration_id);
    }
}

pub struct ResultSource {
    pub integration_id: i64,
    /// Fallback name when the integration is gone (the port for serial devices);
    /// otherwise the integration's name is used.
    pub device_name: String,
    pub device_type: String,
    pub connection_method: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub file_id: Option<String>,
    pub parsed: bool,
}

/// Parse `raw`, save a copy, then tell the frontend. The copy is saved first so
/// the event can carry its `fileId`; attaching with that id marks the Recent
/// Device Files row as attached. Bytes that don't parse are saved as they came
/// in, with a "failed" row and a device event.
pub async fn deliver_result(
    db: &DatabaseConnection,
    storage_dir: &Path,
    sink: &dyn DeviceSink,
    source: &ResultSource,
    raw_name: &str,
    raw: &[u8],
) -> Delivery {
    let source = &named_by_machine(db, source).await;
    device_health::note_raw_message(source.integration_id, raw);
    if source.connection_method == "serial_port" && is_repeated_frame(storage_dir, source.integration_id, raw) {
        log::info!(
            "Dropped a repeat of a frame {} sent in the last 10 minutes ({} bytes)",
            source.device_name,
            raw.len()
        );
        return Delivery { file_id: None, parsed: true };
    }

    // A Healvet stream can carry several samples: each is its own result.
    let is_raw_healvet = source.device_type == "healvet_hv_fia_3000"
        && !String::from_utf8_lossy(raw).trim_start().starts_with('{');
    if is_raw_healvet {
        let parts = DeviceParserService::split_healvet_samples(raw);
        if parts.len() > 1 {
            log::info!("Healvet stream from {} holds {} samples", source.device_name, parts.len());
            let mut last = Delivery { file_id: None, parsed: false };
            let mut any_parsed = false;
            for part in &parts {
                last = deliver_one(db, storage_dir, sink, source, raw_name, part).await;
                any_parsed |= last.parsed;
            }
            return Delivery { file_id: last.file_id, parsed: any_parsed };
        }
    }
    deliver_one(db, storage_dir, sink, source, raw_name, raw).await
}

async fn deliver_one(
    db: &DatabaseConnection,
    storage_dir: &Path,
    sink: &dyn DeviceSink,
    source: &ResultSource,
    raw_name: &str,
    raw: &[u8],
) -> Delivery {
    let parsed = DeviceParserService::parse_device_data(
        &source.device_type,
        &source.device_name,
        raw_name,
        raw,
        &source.connection_method,
    );

    match parsed {
        Ok(data) => {
            let stored = store_file(
                db, storage_dir, source, &data.original_file_name, &data.file_data,
                &data.mime_type, "ok", None,
            )
            .await;
            let file_id = match stored {
                Ok(id) => Some(id),
                Err(e) => {
                    log::error!("Failed to save device result {} from {}: {}",
                        data.original_file_name, source.device_name, e);
                    raise(db, sink, source, DeviceEventKind::SaveFailed, Some(e),
                        Some(data.original_file_name.clone()), None).await;
                    None
                }
            };

            sink.result_ready(&result_payload(&data, file_id.as_deref()), &data);

            let at = Utc::now().to_rfc3339();
            note_result(source.integration_id, &at);
            if let Err(e) = DeviceIntegrationService::record_last_result(db, source.integration_id, &at).await {
                log::warn!("Could not store last result time for integration {}: {}", source.integration_id, e);
            }
            sink.result_recorded(source.integration_id);

            Delivery { file_id, parsed: true }
        }
        Err(parse_error) => {
            log::error!("Failed to parse device data from {} ({}): {}",
                source.device_name, source.device_type, parse_error);
            let kind = if has_message_header(raw) {
                classify_parse_error(&parse_error)
            } else {
                DeviceEventKind::ParseFailed
            };
            let file_id = keep_unreadable(db, storage_dir, source, raw_name, raw, &parse_error).await;
            raise(db, sink, source, kind, Some(parse_error), Some(raw_name.to_string()), file_id.clone()).await;
            Delivery { file_id, parsed: false }
        }
    }
}

/// A frame that stopped partway: keep its bytes and tell the user to resend.
pub async fn report_cut_off(
    db: &DatabaseConnection,
    storage_dir: &Path,
    sink: &dyn DeviceSink,
    source: &ResultSource,
    partial: &[u8],
) -> Option<String> {
    let source = &named_by_machine(db, source).await;
    device_health::note_raw_message(source.integration_id, partial);
    let name = format!("{}_cut_off_{}.txt", source.device_type, Utc::now().format("%Y%m%d_%H%M%S"));
    let detail = format!("Result stopped after {} bytes", partial.len());
    let file_id = keep_unreadable(db, storage_dir, source, &name, partial, &detail).await;
    raise(db, sink, source, DeviceEventKind::CutOff, Some(detail), Some(name), file_id.clone()).await;
    file_id
}

async fn keep_unreadable(
    db: &DatabaseConnection,
    storage_dir: &Path,
    source: &ResultSource,
    name: &str,
    raw: &[u8],
    error: &str,
) -> Option<String> {
    match store_file(db, storage_dir, source, name, raw, "application/octet-stream", "failed", Some(error.to_string())).await {
        Ok(id) => Some(id),
        Err(e) => {
            log::error!("Failed to keep unreadable bytes from {}: {}", source.device_name, e);
            None
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn store_file(
    db: &DatabaseConnection,
    storage_dir: &Path,
    source: &ResultSource,
    name: &str,
    bytes: &[u8],
    mime_type: &str,
    status: &str,
    error: Option<String>,
) -> Result<String, String> {
    let (file_id, file_path) = FileStorageService::save_device_file_in(storage_dir, bytes)?;
    record_device_file_with_status(
        db,
        file_id.clone(),
        name.to_string(),
        file_path,
        Some(bytes.len() as i64),
        Some(mime_type.to_string()),
        source.device_type.clone(),
        source.device_name.clone(),
        Some(source.connection_method.clone()),
        status,
        error,
    )
    .await?;
    Ok(file_id)
}

pub async fn raise(
    db: &DatabaseConnection,
    sink: &dyn DeviceSink,
    source: &ResultSource,
    kind: DeviceEventKind,
    detail: Option<String>,
    file_name: Option<String>,
    file_id: Option<String>,
) {
    device_health::record_event(source.integration_id, kind);
    let device_name = integration_name(db, source.integration_id)
        .await
        .unwrap_or_else(|| source.device_name.clone());
    sink.device_event(&DeviceEvent {
        integration_id: Some(source.integration_id),
        device_name,
        device_type: source.device_type.clone(),
        kind,
        message_key: kind.message_key().to_string(),
        detail,
        file_name,
        file_id,
        at: Utc::now().to_rfc3339(),
    });
}

/// Serial listeners only know their port; results, toasts and Recent files
/// should say which machine sent them. A removed integration keeps the port.
async fn named_by_machine(db: &DatabaseConnection, source: &ResultSource) -> ResultSource {
    ResultSource {
        integration_id: source.integration_id,
        device_name: integration_name(db, source.integration_id)
            .await
            .unwrap_or_else(|| source.device_name.clone()),
        device_type: source.device_type.clone(),
        connection_method: source.connection_method.clone(),
    }
}

async fn integration_name(db: &DatabaseConnection, integration_id: i64) -> Option<String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT name FROM device_integrations WHERE id = ?",
            [integration_id.into()],
        ))
        .await
        .ok()??;
    row.try_get("", "name").ok()
}
