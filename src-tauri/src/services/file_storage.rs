use std::path::{Path, PathBuf};
use std::fs;
use uuid::Uuid;
use sqlx::{SqlitePool, Row};
use crate::models::medical::{MedicalAttachment, AttachmentData};
use chrono::Utc;
use tauri::AppHandle;
use std::io::Write;
use std::fs::File;
use std::process::Command;

// T028: FileStorageService for attachment handling
pub struct FileStorageService;

impl FileStorageService {
    /// Get the base directory for file storage
    pub fn get_storage_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
        let app_dir = app_handle
            .path_resolver()
            .app_data_dir()
            .ok_or("Failed to get app data directory")?;

        let files_dir = app_dir.join("files").join("medical");

        // Create directory if it doesn't exist
        if !files_dir.exists() {
            fs::create_dir_all(&files_dir)
                .map_err(|e| format!("Failed to create storage directory: {}", e))?;
        }

        Ok(files_dir)
    }

    pub async fn upload_attachment(
        app_handle: &AppHandle,
        pool: &SqlitePool,
        medical_record_id: i64,
        file_name: String,
        file_data: Vec<u8>,
        mime_type: String,
    ) -> Result<MedicalAttachment, String> {
        // Generate unique file ID
        let file_id = Uuid::new_v4().to_string();

        // Get storage directory
        let storage_dir = Self::get_storage_dir(app_handle)?;

        // Save file to disk
        let file_path = storage_dir.join(&file_id);
        fs::write(&file_path, &file_data)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        let file_size = file_data.len() as i64;
        let now = Utc::now();

        // Insert attachment record into database
        let result = sqlx::query(
            "INSERT INTO medical_attachments \
             (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at) \
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(medical_record_id)
        .bind(&file_id)
        .bind(&file_name)
        .bind(file_size)
        .bind(&mime_type)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to save attachment record: {}", e))?;

        let attachment_id = result.last_insert_rowid();

        Ok(MedicalAttachment {
            id: attachment_id,
            medical_record_id,
            file_id,
            original_name: file_name,
            mime_type: Some(mime_type),
            file_size: Some(file_size),
            uploaded_at: now,
        })
    }

    pub async fn download_attachment(
        app_handle: &AppHandle,
        pool: &SqlitePool,
        attachment_id: i64,
    ) -> Result<AttachmentData, String> {
        // Get attachment record from database
        let row = sqlx::query(
            "SELECT file_id, original_name, mime_type \
             FROM medical_attachments WHERE id = ?"
        )
        .bind(attachment_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch attachment record: {}", e))?
        .ok_or("Attachment not found".to_string())?;

        let file_id: String = row.get("file_id");
        let original_name: String = row.get("original_name");
        let mime_type: String = row.get("mime_type");

        // Get storage directory and read file
        let storage_dir = Self::get_storage_dir(app_handle)?;
        let file_path = storage_dir.join(&file_id);

        println!("Debug: file_storage download id={} path={}", attachment_id, file_path.display());

        let file_data = fs::read(&file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        println!("Debug: file_storage read bytes={}", file_data.len());

        Ok(AttachmentData {
            file_name: original_name,
            file_data,
            mime_type,
        })
    }

    pub async fn delete_attachment(
        app_handle: &AppHandle,
        pool: &SqlitePool,
        attachment_id: i64,
    ) -> Result<(), String> {
        // Get file_id before deleting from database
        let row = sqlx::query("SELECT file_id FROM medical_attachments WHERE id = ?")
            .bind(attachment_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to fetch attachment: {}", e))?
            .ok_or("Attachment not found".to_string())?;

        let file_id: String = row.get("file_id");

        // Delete from database
        sqlx::query("DELETE FROM medical_attachments WHERE id = ?")
            .bind(attachment_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete attachment record: {}", e))?;

        // Delete file from disk
        let storage_dir = Self::get_storage_dir(app_handle)?;
        let file_path = storage_dir.join(&file_id);

        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to delete file: {}", e))?;
        }

        Ok(())
    }

    /// Clean up orphaned files (files in storage but not in database)
    pub async fn cleanup_orphaned_files(
        _app_handle: &AppHandle,
        _pool: &SqlitePool,
    ) -> Result<usize, String> {
        // Temporary stub - return 0 files cleaned
        Ok(0)
    }

    /// Validate file before upload
    pub fn validate_file(
        file_data: &[u8],
        file_name: &str,
        max_size_mb: usize,
    ) -> Result<(), String> {
        // Check file size
        let max_size = max_size_mb * 1024 * 1024;
        if file_data.len() > max_size {
            return Err(format!("File size exceeds {}MB limit", max_size_mb));
        }

        // Check file extension
        let extension = Path::new(file_name)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        let allowed_extensions = vec![
            "pdf", "doc", "docx", "xls", "xlsx", "txt", "csv",
            "jpg", "jpeg", "png", "gif", "bmp", "svg"
        ];

        if !allowed_extensions.contains(&extension.as_str()) {
            return Err(format!("File type '{}' is not supported", extension));
        }

        Ok(())
    }

    /// Materialize an attachment to a temporary path and return that path
    pub async fn materialize_attachment(
        app_handle: &AppHandle,
        pool: &SqlitePool,
        attachment_id: i64,
    ) -> Result<String, String> {
        let data = Self::download_attachment(app_handle, pool, attachment_id).await?;

        // Create temp path
        let mut tmp_dir = std::env::temp_dir();
        tmp_dir.push("vet-clinic-attachments");
        if !tmp_dir.exists() {
            fs::create_dir_all(&tmp_dir)
                .map_err(|e| format!("Failed to create temp dir: {}", e))?;
        }
        let target_path = tmp_dir.join(&data.file_name);

        // Write file
        fs::write(&target_path, &data.file_data)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;

        Ok(target_path.display().to_string())
    }

    /// Write an attachment to a specific path chosen by the user
    pub async fn write_attachment_to_path(
        app_handle: &AppHandle,
        pool: &SqlitePool,
        attachment_id: i64,
        target_path: String,
    ) -> Result<(), String> {
        let data = Self::download_attachment(app_handle, pool, attachment_id).await?;

        let path = std::path::Path::new(&target_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
            }
        }

        let mut f = File::create(path)
            .map_err(|e| format!("Failed to create file '{}': {}", target_path, e))?;
        f.write_all(&data.file_data)
            .map_err(|e| format!("Failed to write file '{}': {}", target_path, e))?;
        Ok(())
    }

    /// Open a file path with the system default application
    pub fn open_path_with_default_app(path: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/C", "start", "", path])
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
            return Ok(());
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open")
                .arg(path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
            return Ok(());
        }

        #[allow(unreachable_code)]
        Err("Unsupported platform".to_string())
    }
}
