use std::path::PathBuf;
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
        device_type: Option<String>,
        device_name: Option<String>,
        connection_method: Option<String>,
        attachment_type: Option<String>,
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

        // Default attachment_type to 'file' if not provided
        let attachment_type = attachment_type.unwrap_or_else(|| "file".to_string());

        // Insert attachment record into database with device metadata
        let result = sqlx::query(
            "INSERT INTO medical_attachments \
             (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, \
              device_type, device_name, connection_method, attachment_type) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(medical_record_id)
        .bind(&file_id)
        .bind(&file_name)
        .bind(file_size)
        .bind(&mime_type)
        .bind(now)
        .bind(&device_type)
        .bind(&device_name)
        .bind(&connection_method)
        .bind(&attachment_type)
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
            device_type,
            device_name,
            connection_method,
            attachment_type: Some(attachment_type),
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
        _file_name: &str,
        max_size_mb: usize,
    ) -> Result<(), String> {
        // Check file size
        let max_size = max_size_mb * 1024 * 1024;
        if file_data.len() > max_size {
            return Err(format!("File size exceeds {}MB limit", max_size_mb));
        }

        // Allow all file types - doctors need to upload various medical records,
        // device data (XML, JSON, CSV), images, PDFs, videos, etc.
        // Only restriction is file size for practical storage reasons.

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
        log::info!("💾 Saving attachment {} to: {}", attachment_id, target_path);

        let data = Self::download_attachment(app_handle, pool, attachment_id).await?;
        log::info!("   Downloaded {} bytes", data.file_data.len());

        let path = std::path::Path::new(&target_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                log::info!("   Creating parent directory: {}", parent.display());
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
            }
        }

        log::info!("   Writing file...");
        let mut f = File::create(path)
            .map_err(|e| format!("Failed to create file '{}': {}", target_path, e))?;
        f.write_all(&data.file_data)
            .map_err(|e| format!("Failed to write file '{}': {}", target_path, e))?;

        log::info!("   ✅ File saved successfully to: {}", target_path);
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

    /// Print a file using the system's native print dialog
    pub fn print_file(path: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            // On macOS, use AppleScript to open the PDF in Preview and trigger the print dialog
            let script = format!(
                r#"
                set theFile to POSIX file "{}"
                tell application "Preview"
                    activate
                    open theFile
                    delay 0.5
                    print front document with print dialog
                end tell
                "#,
                path
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open print dialog: {}", e))?;
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, use PowerShell to open the PDF in the default viewer
            // and trigger the print dialog via shell verb
            // This works with Adobe Reader, Edge, and other PDF viewers
            log::info!("🖨️  Printing file: {}", path);

            let script = format!(
                r#"
                $shell = New-Object -ComObject Shell.Application
                $folder = $shell.Namespace((Split-Path -Parent '{}'))
                $file = $folder.ParseName((Split-Path -Leaf '{}'))
                if ($file) {{
                    Write-Output "Invoking Print verb..."
                    $file.InvokeVerb('Print')
                    Write-Output "Print command sent successfully"
                }} else {{
                    Write-Error "File not found in folder"
                    exit 1
                }}
                "#,
                path.replace("'", "''"),
                path.replace("'", "''")
            );

            log::info!("   Executing PowerShell script...");
            let output = Command::new("powershell")
                .args(["-NoProfile", "-Command", &script])
                .output()
                .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::error!("   ❌ PowerShell error: {}", stderr);
                return Err(format!("Print command failed: {}", stderr));
            }

            let stdout = String::from_utf8_lossy(&output.stdout);
            log::info!("   ✅ Print command output: {}", stdout);
            return Ok(());
        }

        #[cfg(target_os = "linux")]
        {
            // On Linux, try xdg-open with a print-capable application
            // or fall back to lpr if available
            Command::new("xdg-open")
                .arg(path)
                .spawn()
                .map_err(|e| format!("Failed to open file for printing: {}", e))?;
            return Ok(());
        }

        #[allow(unreachable_code)]
        Err("Unsupported platform".to_string())
    }

    /// Save device file to storage (for crash protection / file history tracking)
    /// Returns the file_id and file_path where the file was saved
    pub fn save_device_file(
        app_handle: &AppHandle,
        _file_name: &str,
        file_data: &[u8],
    ) -> Result<(String, String), String> {
        // Generate unique file ID
        let file_id = Uuid::new_v4().to_string();

        // Get storage directory
        let storage_dir = Self::get_storage_dir(app_handle)?;

        // Save file to disk
        let file_path = storage_dir.join(&file_id);
        fs::write(&file_path, file_data)
            .map_err(|e| format!("Failed to write device file: {}", e))?;

        Ok((file_id, file_path.display().to_string()))
    }
}
