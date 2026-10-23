//! The "Save for later" commands were replaced by the lab inbox
//! (`commands::lab_inbox`); `pending_device_entries` keeps its rows.

use crate::database::SeaOrmPool;
use crate::services::device_parser::DeviceParserService;
use sea_orm::{ConnectionTrait, Statement, DbBackend};
use tauri::State;

/// Re-parse a stored device file by file_id and return normalized DeviceData
#[tauri::command]
pub async fn get_device_data_from_history(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
) -> Result<serde_json::Value, String> {
    // Lookup file metadata
    let row = pool
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT original_name, file_path, device_type, device_name, connection_method FROM file_access_history WHERE file_id = ?",
            [file_id.clone().into()],
        ))
        .await
        .map_err(|e| format!("Failed to fetch file metadata: {}", e))?
        .ok_or_else(|| "File not found".to_string())?;

    let original_name: String = row
        .try_get("", "original_name")
        .map_err(|e| format!("Failed to get original_name: {}", e))?;
    let file_path: String = row
        .try_get("", "file_path")
        .map_err(|e| format!("Failed to get file_path: {}", e))?;
    let device_type: String = row
        .try_get("", "device_type")
        .map_err(|e| format!("Failed to get device_type: {}", e))?;
    let device_name: String = row
        .try_get("", "device_name")
        .map_err(|e| format!("Failed to get device_name: {}", e))?;
    let connection_method: Option<String> = row.try_get("", "connection_method").ok();

    // Read file
    let data = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Parse via DeviceParserService
    let parsed = DeviceParserService::parse_device_data(
        &device_type,
        &device_name,
        &original_name,
        &data,
        connection_method.as_deref().unwrap_or("file_watch"),
    )?;

    // Serialize to JSON for frontend
    let json = serde_json::to_value(parsed).map_err(|e| format!("Failed to serialize device data: {}", e))?;
    Ok(json)
}
