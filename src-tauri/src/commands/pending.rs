use crate::database::SeaOrmPool;
use crate::services::device_parser::DeviceParserService;
use sea_orm::{ConnectionTrait, Statement, DbBackend, Value};
use tauri::State;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingFileMeta {
    pub original_name: String,
    pub file_size: Option<i64>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingDeviceEntryWithFile {
    pub id: i64,
    pub file_id: String,
    pub patient_serial: String,
    pub patient_identifier: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    // From file_access_history
    pub original_name: String,
    pub device_type: String,
    pub device_name: String,
    pub connection_method: Option<String>,
    pub received_at: String,
}

/// Save one or more device files for later processing by associating a user-provided patient serial
#[tauri::command]
pub async fn save_device_files_for_later(
    pool: State<'_, SeaOrmPool>,
    patient_serial: String,
    patient_identifier: Option<String>,
    files: Vec<PendingFileMeta>,
) -> Result<i64, String> {
    let mut saved: i64 = 0;

    for meta in files {
        // Lookup most recent file in history by original_name and optional size
        let mut sql = String::from(
            "SELECT file_id FROM file_access_history WHERE original_name = ?"
        );
        let mut params: Vec<Value> = vec![meta.original_name.clone().into()];
        if let Some(sz) = meta.file_size {
            sql.push_str(" AND (file_size IS NULL OR file_size = ?)");
            params.push(sz.into());
        }
        sql.push_str(" ORDER BY received_at DESC LIMIT 1");

        let row = pool
            .query_one(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| format!("Failed to lookup file history: {}", e))?;

        let Some(row) = row else {
            // Skip if cannot find; continue without failing entire batch
            continue;
        };

        let file_id: String = row.try_get("", "file_id").map_err(|e| format!("Failed to get file_id: {}", e))?;

        // Upsert into pending_device_entries by file_id
        let _ = pool
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO pending_device_entries (file_id, patient_serial, patient_identifier, status) VALUES (?, ?, ?, 'pending') \
                 ON CONFLICT(file_id) DO UPDATE SET patient_serial = excluded.patient_serial, patient_identifier = excluded.patient_identifier, status = 'pending', updated_at = CURRENT_TIMESTAMP",
                [
                    file_id.into(),
                    patient_serial.clone().into(),
                    Value::String(patient_identifier.clone().map(Box::new)),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to save pending entry: {}", e))?;

        saved += 1;
    }

    Ok(saved)
}

/// List pending device entries (optionally filter by patient_serial substring and status)
#[tauri::command]
pub async fn list_pending_device_entries(
    pool: State<'_, SeaOrmPool>,
    query: Option<String>,
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<PendingDeviceEntryWithFile>, String> {
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    let mut sql = String::from(
        "SELECT pde.id, pde.file_id, pde.patient_serial, pde.patient_identifier, pde.status, pde.created_at, pde.updated_at, \
                fah.original_name, fah.device_type, fah.device_name, fah.connection_method, fah.received_at \
         FROM pending_device_entries pde \
         JOIN file_access_history fah ON pde.file_id = fah.file_id \
         WHERE 1=1"
    );
    let mut params: Vec<Value> = Vec::new();

    if let Some(s) = status {
        sql.push_str(" AND pde.status = ?");
        params.push(s.into());
    } else {
        sql.push_str(" AND pde.status = 'pending'");
    }

    if let Some(q) = query {
        sql.push_str(" AND pde.patient_serial LIKE ?");
        params.push(format!("%{}%", q).into());
    }

    sql.push_str(" ORDER BY pde.created_at DESC LIMIT ? OFFSET ?");
    params.push(limit.into());
    params.push(offset.into());

    let rows = pool
        .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
        .await
        .map_err(|e| format!("Failed to list pending entries: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(PendingDeviceEntryWithFile {
            id: row.try_get("", "id").unwrap_or(0),
            file_id: row.try_get("", "file_id").unwrap_or_default(),
            patient_serial: row.try_get("", "patient_serial").unwrap_or_default(),
            patient_identifier: row.try_get("", "patient_identifier").ok(),
            status: row.try_get("", "status").unwrap_or_else(|_| "pending".to_string()),
            created_at: row.try_get("", "created_at").unwrap_or_default(),
            updated_at: row.try_get("", "updated_at").unwrap_or_default(),
            original_name: row.try_get("", "original_name").unwrap_or_default(),
            device_type: row.try_get("", "device_type").unwrap_or_default(),
            device_name: row.try_get("", "device_name").unwrap_or_default(),
            connection_method: row.try_get("", "connection_method").ok(),
            received_at: row.try_get("", "received_at").unwrap_or_default(),
        });
    }

    Ok(results)
}

/// Mark a pending entry as processed
#[tauri::command]
pub async fn mark_pending_entry_processed(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    pool
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE pending_device_entries SET status = 'processed' WHERE id = ?",
            [id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to mark processed: {}", e))?;
    Ok(())
}

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
