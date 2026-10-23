use tauri::{AppHandle, State};

use crate::database::SeaOrmPool;
use crate::models::device_integration::ConnectionType;
use crate::services::device_events::{last_bytes, last_result};
use crate::services::device_health::{
    self, DeviceAlertSettings, DeviceConfigSummary, DeviceDetails, DiagnosticsInput,
};
use crate::services::device_input::get_all_connection_statuses;
use crate::services::device_integration::DeviceIntegrationService;
use crate::services::file_storage::FileStorageService;
use crate::services::file_watcher::get_all_file_watcher_statuses;

/// Bytes in the last minute, errors today, the last raw message and recent
/// status changes, for the device details drawer.
#[tauri::command]
pub fn get_device_details(integration_id: i64) -> DeviceDetails {
    device_health::device_details(integration_id, chrono::Local::now().fixed_offset())
}

/// Readable results per machine since local midnight, for the overview.
#[tauri::command]
pub async fn get_results_today(pool: State<'_, SeaOrmPool>) -> Result<std::collections::HashMap<i64, i64>, String> {
    let now = chrono::Local::now();
    let midnight = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|m| m.and_local_timezone(chrono::Local).earliest())
        .unwrap_or(now);
    DeviceIntegrationService::results_since(&pool, midnight.with_timezone(&chrono::Utc)).await
}

/// The "Copy diagnostics" text. Holds settings, states and times only; no
/// message contents, so no patient names.
#[tauri::command]
pub async fn get_device_diagnostics(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    integration_id: i64,
) -> Result<String, String> {
    let integration = DeviceIntegrationService::get_by_id(&pool, integration_id).await?;
    let now = chrono::Local::now().fixed_offset();
    let details = device_health::device_details(integration_id, now);

    let (state, last_error, status_last_result) = match integration.connection_type {
        ConnectionType::SerialPort => get_all_connection_statuses()
            .into_iter()
            .find(|s| s.integration_id == integration_id && Some(&s.port_name) == integration.serial_port_name.as_ref())
            .map(|s| (describe(&format!("{:?}", s.status), s.error_kind), s.last_error, s.last_result_at)),
        ConnectionType::FileWatch => get_all_file_watcher_statuses()
            .into_iter()
            .find(|s| s.integration_id == integration_id)
            .map(|s| (describe(&format!("{:?}", s.status), s.error_kind), s.last_error, s.last_result_at)),
        ConnectionType::Hl7Tcp => None,
    }
    .unwrap_or_else(|| ("Unknown".to_string(), None, None));
    let stored_last_result = DeviceIntegrationService::last_result_times(&pool)
        .await
        .ok()
        .and_then(|times| times.get(&integration_id).cloned());

    let is_serial = integration.connection_type == ConnectionType::SerialPort;
    let input = DiagnosticsInput {
        app_version: app_handle.package_info().version.to_string(),
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        generated_at: now,
        device: DeviceConfigSummary {
            name: integration.name.clone(),
            device_type: integration.device_type.to_db_string().to_string(),
            connection_type: integration.connection_type.to_db_string().to_string(),
            enabled: integration.enabled,
            port: integration.serial_port_name.clone().filter(|_| is_serial),
            baud_rate: if is_serial {
                Some(crate::services::device_input::get_device_protocol(integration.device_type.to_db_string()).baud_rate as i64)
            } else {
                None
            },
            folder: integration.watch_directory.clone().filter(|_| !is_serial),
            file_pattern: integration.file_pattern.clone().filter(|_| !is_serial),
        },
        state,
        last_error,
        last_result_at: last_result(integration_id).or(status_last_result).or(stored_last_result),
        last_byte_at: last_bytes(integration_id),
        bytes_last_minute: details.bytes_last_minute,
        errors_today: details.errors_today,
        log: details.log,
    };
    Ok(device_health::diagnostics_text(&input))
}

fn describe(state: &str, kind: Option<crate::services::device_events::DeviceErrorKind>) -> String {
    match kind.and_then(|k| serde_json::to_value(k).ok()).and_then(|v| v.as_str().map(str::to_string)) {
        Some(kind) => format!("{state} ({kind})"),
        None => state.to_string(),
    }
}

/// Opens the folder holding Arkivet.log in Explorer / Finder.
#[tauri::command]
pub fn open_device_log_folder(app_handle: AppHandle) -> Result<(), String> {
    let dir = app_handle
        .path_resolver()
        .app_log_dir()
        .ok_or_else(|| "The log folder could not be found".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the log folder: {e}"))?;
    FileStorageService::open_path_with_default_app(&dir.to_string_lossy())
}

#[tauri::command]
pub async fn get_device_alert_settings(pool: State<'_, SeaOrmPool>) -> Result<DeviceAlertSettings, String> {
    device_health::load_alert_settings(&pool).await
}

#[tauri::command]
pub async fn update_device_alert_settings(
    pool: State<'_, SeaOrmPool>,
    settings: DeviceAlertSettings,
) -> Result<DeviceAlertSettings, String> {
    let saved = device_health::save_alert_settings(&pool, &settings).await?;
    device_health::kick_monitor();
    Ok(saved)
}
