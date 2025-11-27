use crate::models::medical::{FileAccessHistory, FileAccessHistoryWithRecord};
use crate::database::connection::DatabasePool;
use chrono::{Utc, Duration};
use sqlx::SqlitePool;
use tauri::State;

/// Get recent device files from the last 14 days
#[tauri::command]
pub async fn get_recent_device_files(
    pool: State<'_, DatabasePool>,
    days: Option<i64>,
) -> Result<Vec<FileAccessHistoryWithRecord>, String> {
    let pool = pool.lock().await;
    let days = days.unwrap_or(14); // Default to 14 days
    let cutoff_date = Utc::now() - Duration::days(days);

    let files = sqlx::query_as::<_, FileAccessHistory>(
        r#"
        SELECT *
        FROM file_access_history
        WHERE received_at >= ?
        ORDER BY received_at DESC
        LIMIT 100
        "#
    )
    .bind(cutoff_date)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch recent files: {}", e))?;

    // Enrich with medical record details
    let mut enriched_files = Vec::new();
    for file in files {
        let (patient_name, record_name) = if let Some(record_id) = file.first_attached_to_record_id {
            let result: Option<(String, String)> = sqlx::query_as(
                r#"
                SELECT p.name, mr.name
                FROM medical_records mr
                JOIN patients p ON mr.patient_id = p.id
                WHERE mr.id = ?
                "#
            )
            .bind(record_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| format!("Failed to fetch record details: {}", e))?;

            if let Some((pname, rname)) = result {
                (Some(pname), Some(rname))
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
    pool: State<'_, DatabasePool>,
    file_id: String,
) -> Result<Option<FileAccessHistoryWithRecord>, String> {
    let pool = pool.lock().await;
    let file = sqlx::query_as::<_, FileAccessHistory>(
        "SELECT * FROM file_access_history WHERE file_id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch file history: {}", e))?;

    if let Some(file) = file {
        let (patient_name, record_name) = if let Some(record_id) = file.first_attached_to_record_id {
            let result: Option<(String, String)> = sqlx::query_as(
                r#"
                SELECT p.name, mr.name
                FROM medical_records mr
                JOIN patients p ON mr.patient_id = p.id
                WHERE mr.id = ?
                "#
            )
            .bind(record_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| format!("Failed to fetch record details: {}", e))?;

            if let Some((pname, rname)) = result {
                (Some(pname), Some(rname))
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

/// Internal function for recording file access (called from Rust code)
pub async fn record_device_file_access_internal(
    pool: &SqlitePool,
    file_id: String,
    original_name: String,
    file_path: String,
    file_size: Option<i64>,
    mime_type: Option<String>,
    device_type: String,
    device_name: String,
    connection_method: Option<String>,
) -> Result<(), String> {
    // Check if file already exists
    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM file_access_history WHERE file_id = ?"
    )
    .bind(&file_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to check existing file: {}", e))?;

    if existing.is_some() {
        // Update last_accessed_at
        sqlx::query(
            "UPDATE file_access_history SET last_accessed_at = ? WHERE file_id = ?"
        )
        .bind(Utc::now())
        .bind(&file_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update file access: {}", e))?;
    } else {
        // Insert new record
        sqlx::query(
            r#"
            INSERT INTO file_access_history
            (file_id, original_name, file_path, file_size, mime_type, device_type, device_name, connection_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&file_id)
        .bind(&original_name)
        .bind(&file_path)
        .bind(file_size)
        .bind(mime_type)
        .bind(&device_type)
        .bind(&device_name)
        .bind(connection_method)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to record file access: {}", e))?;
    }

    Ok(())
}

/// Record or update file access history when device data is received
#[tauri::command]
pub async fn record_device_file_access(
    pool: State<'_, DatabasePool>,
    file_id: String,
    original_name: String,
    file_path: String,
    file_size: Option<i64>,
    mime_type: Option<String>,
    device_type: String,
    device_name: String,
    connection_method: Option<String>,
) -> Result<(), String> {
    let pool = pool.lock().await;
    record_device_file_access_internal(
        &*pool,
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

/// Internal function for updating file attachment (called from Rust code)
pub async fn update_file_attachment_internal(
    pool: &SqlitePool,
    file_id: String,
    medical_record_id: i64,
) -> Result<(), String> {
    // Check if this is the first attachment
    let existing: Option<(Option<i64>, i32)> = sqlx::query_as(
        "SELECT first_attached_to_record_id, attachment_count FROM file_access_history WHERE file_id = ?"
    )
    .bind(&file_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to fetch file history: {}", e))?;

    if let Some((first_record_id, count)) = existing {
        if first_record_id.is_none() {
            // This is the first attachment
            sqlx::query(
                r#"
                UPDATE file_access_history
                SET first_attached_to_record_id = ?,
                    first_attached_at = ?,
                    attachment_count = ?,
                    last_accessed_at = ?
                WHERE file_id = ?
                "#
            )
            .bind(medical_record_id)
            .bind(Utc::now())
            .bind(count + 1)
            .bind(Utc::now())
            .bind(&file_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update file attachment: {}", e))?;
        } else {
            // Just increment count
            sqlx::query(
                r#"
                UPDATE file_access_history
                SET attachment_count = ?,
                    last_accessed_at = ?
                WHERE file_id = ?
                "#
            )
            .bind(count + 1)
            .bind(Utc::now())
            .bind(&file_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update attachment count: {}", e))?;
        }
    }

    Ok(())
}

/// Update file history when attached to a medical record (Tauri command wrapper)
#[tauri::command]
pub async fn update_file_attachment(
    pool: State<'_, DatabasePool>,
    file_id: String,
    medical_record_id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;
    update_file_attachment_internal(&*pool, file_id, medical_record_id).await
}

/// Clean up old file history entries (older than specified days)
#[tauri::command]
pub async fn cleanup_old_file_history(
    pool: State<'_, DatabasePool>,
    days: Option<i64>,
) -> Result<i64, String> {
    let pool = pool.lock().await;
    let days = days.unwrap_or(14); // Default to 14 days
    let cutoff_date = Utc::now() - Duration::days(days);

    let result = sqlx::query(
        "DELETE FROM file_access_history WHERE received_at < ?"
    )
    .bind(cutoff_date)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to cleanup old files: {}", e))?;

    Ok(result.rows_affected() as i64)
}

/// Download device file by file_id from storage
#[tauri::command]
pub async fn download_device_file(
    pool: State<'_, DatabasePool>,
    file_id: String,
) -> Result<crate::models::medical::AttachmentData, String> {
    use sqlx::Row;

    let pool = pool.lock().await;

    // Get file metadata from file_access_history
    let row = sqlx::query(
        "SELECT original_name, file_path, mime_type FROM file_access_history WHERE file_id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch file metadata: {}", e))?
    .ok_or("File not found in history")?;

    let original_name: String = row.get("original_name");
    let file_path: String = row.get("file_path");
    let mime_type: Option<String> = row.get("mime_type");

    // Read file from disk
    let file_data = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read device file: {}", e))?;

    Ok(crate::models::medical::AttachmentData {
        file_name: original_name,
        file_data,
        mime_type: mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
    })
}
