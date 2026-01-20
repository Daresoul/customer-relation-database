use crate::models::medical::{FileAccessHistory, FileAccessHistoryWithRecord};
use crate::database::SeaOrmPool;
use chrono::{Utc, Duration, DateTime};
use tauri::State;
use sea_orm::{ConnectionTrait, Statement, DbBackend, DatabaseConnection};

// Helper function to map SeaORM row to FileAccessHistory
fn row_to_file_access_history(row: &sea_orm::QueryResult) -> Result<FileAccessHistory, String> {
    Ok(FileAccessHistory {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        file_id: row.try_get("", "file_id").map_err(|e| format!("Failed to get file_id: {}", e))?,
        original_name: row.try_get("", "original_name").map_err(|e| format!("Failed to get original_name: {}", e))?,
        file_path: row.try_get("", "file_path").map_err(|e| format!("Failed to get file_path: {}", e))?,
        file_size: row.try_get("", "file_size").ok(),
        mime_type: row.try_get("", "mime_type").ok(),
        device_type: row.try_get("", "device_type").map_err(|e| format!("Failed to get device_type: {}", e))?,
        device_name: row.try_get("", "device_name").map_err(|e| format!("Failed to get device_name: {}", e))?,
        connection_method: row.try_get("", "connection_method").ok(),
        received_at: row.try_get("", "received_at").map_err(|e| format!("Failed to get received_at: {}", e))?,
        first_attached_to_record_id: row.try_get("", "first_attached_to_record_id").ok(),
        first_attached_at: row.try_get::<Option<DateTime<Utc>>>("", "first_attached_at").ok().flatten(),
        attachment_count: row.try_get("", "attachment_count").unwrap_or(0),
        last_accessed_at: row.try_get("", "last_accessed_at").map_err(|e| format!("Failed to get last_accessed_at: {}", e))?,
    })
}

/// Get recent device files from the last 14 days
#[tauri::command]
pub async fn get_recent_device_files(
    pool: State<'_, SeaOrmPool>,
    days: Option<i64>,
) -> Result<Vec<FileAccessHistoryWithRecord>, String> {
    let days = days.unwrap_or(14); // Default to 14 days
    let cutoff_date = Utc::now() - Duration::days(days);

    let rows = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM file_access_history WHERE received_at >= ? ORDER BY received_at DESC LIMIT 100",
        [cutoff_date.to_rfc3339().into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch recent files: {}", e))?;

    let files: Result<Vec<FileAccessHistory>, _> = rows.iter().map(row_to_file_access_history).collect();
    let files = files?;

    // Enrich with medical record details
    let mut enriched_files = Vec::new();
    for file in files {
        let (patient_name, record_name) = if let Some(record_id) = file.first_attached_to_record_id {
            let result = pool.query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT p.name as patient_name, mr.name as record_name \
                 FROM medical_records mr \
                 JOIN patients p ON mr.patient_id = p.id \
                 WHERE mr.id = ?",
                [record_id.into()]
            ))
            .await
            .map_err(|e| format!("Failed to fetch record details: {}", e))?;

            if let Some(row) = result {
                let pname: Option<String> = row.try_get("", "patient_name").ok();
                let rname: Option<String> = row.try_get("", "record_name").ok();
                (pname, rname)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        enriched_files.push(FileAccessHistoryWithRecord {
            file_history: file,
            patient_name,
            record_name,
        });
    }

    Ok(enriched_files)
}

/// Get file history for a specific file_id
#[tauri::command]
pub async fn get_file_history(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
) -> Result<Option<FileAccessHistoryWithRecord>, String> {
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM file_access_history WHERE file_id = ?",
        [file_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch file history: {}", e))?;

    if let Some(row) = row {
        let file = row_to_file_access_history(&row)?;

        let (patient_name, record_name) = if let Some(record_id) = file.first_attached_to_record_id {
            let result = pool.query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT p.name as patient_name, mr.name as record_name \
                 FROM medical_records mr \
                 JOIN patients p ON mr.patient_id = p.id \
                 WHERE mr.id = ?",
                [record_id.into()]
            ))
            .await
            .map_err(|e| format!("Failed to fetch record details: {}", e))?;

            if let Some(row) = result {
                let pname: Option<String> = row.try_get("", "patient_name").ok();
                let rname: Option<String> = row.try_get("", "record_name").ok();
                (pname, rname)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        Ok(Some(FileAccessHistoryWithRecord {
            file_history: file,
            patient_name,
            record_name,
        }))
    } else {
        Ok(None)
    }
}

/// Internal function for recording file access (called from Rust code) - SeaORM version
pub async fn record_device_file_access_internal_seaorm(
    db: &DatabaseConnection,
    file_id: String,
    original_name: String,
    file_path: String,
    file_size: Option<i64>,
    mime_type: Option<String>,
    device_type: String,
    device_name: String,
    connection_method: Option<String>,
) -> Result<(), String> {
    use sea_orm::Value;

    // Check if file already exists
    let existing = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM file_access_history WHERE file_id = ?",
        [file_id.clone().into()]
    ))
    .await
    .map_err(|e| format!("Failed to check existing file: {}", e))?;

    if existing.is_some() {
        // Update last_accessed_at
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE file_access_history SET last_accessed_at = ? WHERE file_id = ?",
            [Utc::now().to_rfc3339().into(), file_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to update file access: {}", e))?;
    } else {
        // Insert new record
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO file_access_history \
             (file_id, original_name, file_path, file_size, mime_type, device_type, device_name, connection_method) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                file_id.into(),
                original_name.into(),
                file_path.into(),
                file_size.map(|s| Value::BigInt(Some(s))).unwrap_or(Value::BigInt(None)),
                Value::String(mime_type.map(Box::new)),
                device_type.into(),
                device_name.into(),
                Value::String(connection_method.map(Box::new)),
            ]
        ))
        .await
        .map_err(|e| format!("Failed to record file access: {}", e))?;
    }

    Ok(())
}

/// Record or update file access history when device data is received
#[tauri::command]
pub async fn record_device_file_access(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
    original_name: String,
    file_path: String,
    file_size: Option<i64>,
    mime_type: Option<String>,
    device_type: String,
    device_name: String,
    connection_method: Option<String>,
) -> Result<(), String> {
    record_device_file_access_internal_seaorm(
        &pool,
        file_id,
        original_name,
        file_path,
        file_size,
        mime_type,
        device_type,
        device_name,
        connection_method,
    ).await
}

/// Internal function for updating file attachment (called from Rust code) - SeaORM version
pub async fn update_file_attachment_internal_seaorm(
    db: &DatabaseConnection,
    file_id: String,
    medical_record_id: i64,
) -> Result<(), String> {
    // Check if this is the first attachment
    let existing = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT first_attached_to_record_id, attachment_count FROM file_access_history WHERE file_id = ?",
        [file_id.clone().into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch file history: {}", e))?;

    if let Some(row) = existing {
        let first_record_id: Option<i64> = row.try_get("", "first_attached_to_record_id").ok();
        let count: i32 = row.try_get("", "attachment_count").unwrap_or(0);

        if first_record_id.is_none() {
            // This is the first attachment
            db.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE file_access_history \
                 SET first_attached_to_record_id = ?, \
                     first_attached_at = ?, \
                     attachment_count = ?, \
                     last_accessed_at = ? \
                 WHERE file_id = ?",
                [
                    medical_record_id.into(),
                    Utc::now().to_rfc3339().into(),
                    (count + 1).into(),
                    Utc::now().to_rfc3339().into(),
                    file_id.clone().into(),
                ]
            ))
            .await
            .map_err(|e| format!("Failed to update file attachment: {}", e))?;
        } else {
            // Just increment count
            db.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE file_access_history \
                 SET attachment_count = ?, \
                     last_accessed_at = ? \
                 WHERE file_id = ?",
                [
                    (count + 1).into(),
                    Utc::now().to_rfc3339().into(),
                    file_id.clone().into(),
                ]
            ))
            .await
            .map_err(|e| format!("Failed to update attachment count: {}", e))?;
        }
    }

    Ok(())
}

/// Update file history when attached to a medical record (Tauri command wrapper)
#[tauri::command]
pub async fn update_file_attachment(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
    medical_record_id: i64,
) -> Result<(), String> {
    update_file_attachment_internal_seaorm(&pool, file_id, medical_record_id).await
}

/// Clean up old file history entries (older than specified days)
#[tauri::command]
pub async fn cleanup_old_file_history(
    pool: State<'_, SeaOrmPool>,
    days: Option<i64>,
) -> Result<i64, String> {
    let days = days.unwrap_or(14); // Default to 14 days
    let cutoff_date = Utc::now() - Duration::days(days);

    let result = pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM file_access_history WHERE received_at < ?",
        [cutoff_date.to_rfc3339().into()]
    ))
    .await
    .map_err(|e| format!("Failed to cleanup old files: {}", e))?;

    Ok(result.rows_affected() as i64)
}

/// Download device file by file_id from storage (includes device metadata for PDF generation)
#[tauri::command]
pub async fn download_device_file(
    pool: State<'_, SeaOrmPool>,
    file_id: String,
) -> Result<DeviceFileDownloadResponse, String> {
    // Get file metadata from file_access_history (including device metadata)
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT original_name, file_path, mime_type, device_type, device_name, connection_method \
         FROM file_access_history WHERE file_id = ?",
        [file_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch file metadata: {}", e))?
    .ok_or("File not found in history")?;

    let original_name: String = row.try_get("", "original_name")
        .map_err(|e| format!("Failed to get original_name: {}", e))?;
    let file_path: String = row.try_get("", "file_path")
        .map_err(|e| format!("Failed to get file_path: {}", e))?;
    let mime_type: Option<String> = row.try_get("", "mime_type").ok();
    let device_type: String = row.try_get("", "device_type")
        .map_err(|e| format!("Failed to get device_type: {}", e))?;
    let device_name: String = row.try_get("", "device_name")
        .map_err(|e| format!("Failed to get device_name: {}", e))?;
    let connection_method: Option<String> = row.try_get("", "connection_method").ok();

    // Read file from disk
    let file_data = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read device file: {}", e))?;

    // Parse test results from file if it's JSON
    let test_results = if original_name.ends_with(".json") {
        match serde_json::from_slice::<serde_json::Value>(&file_data) {
            Ok(json) => Some(json),
            Err(_) => None,
        }
    } else {
        None
    };

    Ok(DeviceFileDownloadResponse {
        file_name: original_name,
        file_data,
        mime_type: mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
        device_type,
        device_name,
        connection_method,
        test_results,
    })
}

/// Response for download_device_file with device metadata
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFileDownloadResponse {
    pub file_name: String,
    pub file_data: Vec<u8>,
    pub mime_type: String,
    pub device_type: String,
    pub device_name: String,
    pub connection_method: Option<String>,
    pub test_results: Option<serde_json::Value>,
}
