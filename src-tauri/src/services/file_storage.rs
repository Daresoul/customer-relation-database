use std::path::PathBuf;
use std::fs;
use uuid::Uuid;
use sea_orm::*;
use crate::models::medical::{MedicalAttachment, AttachmentData};
use chrono::Utc;
use tauri::AppHandle;
use std::io::Write;
use std::fs::File;
// Only the macOS/Linux launch paths shell out to `open`/`xdg-open`/`osascript`;
// Windows uses ShellExecuteW directly (see the helpers at the bottom of this
// file), so these imports would be unused warnings on Windows builds.
#[cfg(not(target_os = "windows"))]
use std::process::{Command, Stdio};

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
        db: &DatabaseConnection,
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
        if let Err(e) = fs::write(&file_path, &file_data) {
            log::error!("❌ Failed to write attachment file '{}' (record_id={}): {}", file_name, medical_record_id, e);
            return Err(format!("Failed to write file: {}", e));
        }

        let file_size = file_data.len() as i64;
        let now = Utc::now();

        // Default attachment_type to 'file' if not provided
        let attachment_type = attachment_type.unwrap_or_else(|| "file".to_string());

        // Insert attachment record into database with device metadata
        let result = db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_attachments \
             (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, \
              device_type, device_name, connection_method, attachment_type) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                medical_record_id.into(),
                file_id.clone().into(),
                file_name.clone().into(),
                file_size.into(),
                mime_type.clone().into(),
                now.to_rfc3339().into(),
                Value::String(device_type.clone().map(Box::new)),
                Value::String(device_name.clone().map(Box::new)),
                Value::String(connection_method.clone().map(Box::new)),
                attachment_type.clone().into(),
            ]
        ))
        .await
        .map_err(|e| {
            log::error!("❌ Failed to insert attachment record for '{}' (record_id={}): {}", file_name, medical_record_id, e);
            format!("Failed to save attachment record: {}", e)
        })?;

        let attachment_id = result.last_insert_id() as i64;

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
        db: &DatabaseConnection,
        attachment_id: i64,
    ) -> Result<AttachmentData, String> {
        // Get attachment record from database
        let row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT file_id, original_name, mime_type \
             FROM medical_attachments WHERE id = ? AND deleted_at IS NULL",
            [attachment_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch attachment record: {}", e))?
        .ok_or("Attachment not found".to_string())?;

        let file_id: String = row.try_get("", "file_id")
            .map_err(|e| format!("Failed to get file_id: {}", e))?;
        let original_name: String = row.try_get("", "original_name")
            .map_err(|e| format!("Failed to get original_name: {}", e))?;
        let mime_type: String = row.try_get("", "mime_type")
            .map_err(|e| format!("Failed to get mime_type: {}", e))?;

        // Get storage directory and read file
        let storage_dir = Self::get_storage_dir(app_handle)?;
        let file_path = storage_dir.join(&file_id);

        log::debug!("file_storage download id={} path={}", attachment_id, file_path.display());

        let file_data = fs::read(&file_path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        log::debug!("file_storage read bytes={}", file_data.len());

        Ok(AttachmentData {
            file_name: original_name,
            file_data,
            mime_type,
        })
    }

    /// SOFT delete: the row keeps existing with `deleted_at` set and the blob
    /// stays on disk — the attachment just stops appearing on the record (all
    /// read paths filter `deleted_at IS NULL`). Medical data is never
    /// destroyed by a UI action; a mistaken delete is recoverable by clearing
    /// `deleted_at` in the DB. Same pattern as appointment soft deletion.
    pub async fn delete_attachment(
        db: &DatabaseConnection,
        attachment_id: i64,
    ) -> Result<(), String> {
        let result = db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE medical_attachments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
            [Utc::now().to_rfc3339().into(), attachment_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to delete attachment record: {}", e))?;

        if result.rows_affected() == 0 {
            return Err("Attachment not found".to_string());
        }

        log::info!("🗑️  Soft-deleted attachment {} (file kept on disk)", attachment_id);
        Ok(())
    }

    /// Clean up orphaned files (files in storage but not in database)
    pub async fn cleanup_orphaned_files(
        _app_handle: &AppHandle,
        _db: &DatabaseConnection,
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
        db: &DatabaseConnection,
        attachment_id: i64,
    ) -> Result<String, String> {
        let data = Self::download_attachment(app_handle, db, attachment_id).await?;

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
        db: &DatabaseConnection,
        attachment_id: i64,
        target_path: String,
    ) -> Result<(), String> {
        log::info!("💾 Saving attachment {} to: {}", attachment_id, target_path);

        let data = Self::download_attachment(app_handle, db, attachment_id).await?;
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

    /// Open a file path with the system default application.
    /// Uses subprocess isolation (process group, Stdio::null) to prevent
    /// the spawned application from stealing focus from the main window.
    pub fn open_path_with_default_app(path: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let mut cmd = Command::new("open");
            cmd.arg(path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            // Isolate child process so it doesn't inherit our window session
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            cmd.spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            // ShellExecuteW instead of `cmd /C start "" <path>`: same effect
            // (open with the associated app), but it returns a real result
            // code we can log — `cmd start` always "succeeded" as long as
            // cmd.exe spawned, so association problems were invisible in the
            // clinic logs. It also removes cmd.exe's quote-parsing quirks
            // from the path handling entirely.
            log::info!("📂 Opening file with default app: {}", path);
            log_windows_launch_context(path);

            let code = windows_shell_execute(path, "open");
            if code > 32 {
                log::info!("   ✅ File opened with default app");
                return Ok(());
            }
            log::error!(
                "   ❌ Open failed with code {} ({})",
                code, describe_shellexecute_code(code)
            );
            crate::services::telemetry::event(
                log::Level::Error,
                "os_launch",
                "Opening a file with its default app failed",
                serde_json::json!({
                    "path": path,
                    "code": code,
                    "code_meaning": describe_shellexecute_code(code),
                    "open_handler": windows_resolve_association(path, Some("open")),
                }),
            );
            return Err(format!(
                "Could not open file. Error code: {} ({})",
                code,
                describe_shellexecute_code(code)
            ));
        }

        #[cfg(target_os = "linux")]
        {
            let mut cmd = Command::new("xdg-open");
            cmd.arg(path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            cmd.spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
            return Ok(());
        }

        #[allow(unreachable_code)]
        Err("Unsupported platform".to_string())
    }

    /// Print a file using the system's native print dialog.
    /// Uses subprocess isolation to minimize focus disruption.
    pub fn print_file(path: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            // On macOS, use AppleScript to open the PDF in Preview and trigger the print dialog.
            // Note: Preview.app needs to come to front for the print dialog, so we use `activate`.
            // We isolate the osascript process via process_group(0) to limit focus side-effects.
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
            let mut cmd = Command::new("osascript");
            cmd.args(["-e", &script])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            cmd.spawn()
                .map_err(|e| format!("Failed to open print dialog: {}", e))?;
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            log::info!("🖨️  Printing file: {}", path);
            log_windows_launch_context(path);

            // Try "print" verb first, fallback to "open" if not supported
            let mut codes: Vec<(&str, i32)> = Vec::new();
            for verb in ["print", "open"] {
                let code = windows_shell_execute(path, verb);
                if code > 32 {
                    if verb == "open" {
                        // The print verb didn't work and we opened the viewer
                        // instead. The user asked to PRINT — make the degraded
                        // outcome visible in Grafana, with what actually ran.
                        crate::services::telemetry::event(
                            log::Level::Warn,
                            "os_launch",
                            "Print verb unavailable — opened file in viewer instead of printing",
                            serde_json::json!({
                                "path": path,
                                "print_verb_code": codes.first().map(|(_, c)| *c),
                                "open_handler": windows_resolve_association(path, Some("open")),
                            }),
                        );
                    }
                    log::info!("   ✅ File opened with '{}' verb - user can print from viewer", verb);
                    return Ok(());
                }
                log::warn!(
                    "   ⚠️  '{}' verb failed with code {} ({}), trying next...",
                    verb, code, describe_shellexecute_code(code)
                );
                codes.push((verb, code));
            }

            let last_error = codes.last().map(|(_, c)| *c).unwrap_or(0);
            log::error!("   ❌ All print methods failed. Last error: {}", last_error);
            crate::services::telemetry::event(
                log::Level::Error,
                "os_launch",
                "Print failed — no verb could launch a handler for the file",
                serde_json::json!({
                    "path": path,
                    "verb_codes": codes.iter().map(|(v, c)| format!("{}={}", v, c)).collect::<Vec<_>>(),
                    "open_handler": windows_resolve_association(path, Some("open")),
                    "print_handler": windows_resolve_association(path, Some("print")),
                }),
            );
            return Err(format!(
                "Could not open file for printing. Error code: {} ({})",
                last_error,
                describe_shellexecute_code(last_error)
            ));
        }

        #[cfg(target_os = "linux")]
        {
            // On Linux, try xdg-open with a print-capable application
            // or fall back to lpr if available
            let mut cmd = Command::new("xdg-open");
            cmd.arg(path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            {
                use std::os::unix::process::CommandExt;
                cmd.process_group(0);
            }
            cmd.spawn()
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

/// Launch `path` via ShellExecuteW with the given verb ("open", "print").
/// Returns the raw ShellExecute result code: > 32 means success, <= 32 is one
/// of the SE_ERR_* failures (see `describe_shellexecute_code`).
#[cfg(target_os = "windows")]
fn windows_shell_execute(path: &str, verb: &str) -> i32 {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;

    let wide_path: Vec<u16> = OsStr::new(path).encode_wide().chain(Some(0)).collect();
    let wide_verb: Vec<u16> = OsStr::new(verb).encode_wide().chain(Some(0)).collect();

    unsafe {
        let result = ShellExecuteW(
            HWND(0),                    // No parent window
            PCWSTR(wide_verb.as_ptr()), // "print" or "open" verb
            PCWSTR(wide_path.as_ptr()), // File path
            PCWSTR::null(),             // No parameters
            PCWSTR::null(),             // No directory
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        );
        result.0 as i32
    }
}

/// Ask the Windows shell which executable is registered for `verb` on this
/// file's extension (e.g. `.pdf` + "open" → the default PDF viewer). This is
/// the single most useful diagnostic when a launch misbehaves at a clinic:
/// it tells us remotely what app Windows would hand the file to.
#[cfg(target_os = "windows")]
fn windows_resolve_association(path: &str, verb: Option<&str>) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::UI::Shell::{AssocQueryStringW, ASSOCF_NONE, ASSOCSTR_EXECUTABLE};

    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))?;

    let wide_ext: Vec<u16> = OsStr::new(&ext).encode_wide().chain(Some(0)).collect();
    let wide_verb: Option<Vec<u16>> =
        verb.map(|v| OsStr::new(v).encode_wide().chain(Some(0)).collect());

    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    unsafe {
        let hr = AssocQueryStringW(
            ASSOCF_NONE,
            ASSOCSTR_EXECUTABLE,
            PCWSTR(wide_ext.as_ptr()),
            wide_verb
                .as_ref()
                .map(|v| PCWSTR(v.as_ptr()))
                .unwrap_or(PCWSTR::null()),
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        if hr.is_ok() && len > 1 {
            Some(String::from_utf16_lossy(&buf[..(len as usize - 1)]))
        } else {
            None
        }
    }
}

/// Log everything about the file and its associations that a remote
/// diagnosis needs BEFORE we hand it to the shell: does the file exist, how
/// big is it, and which executables Windows resolves for its "open" and
/// "print" verbs. One glance at these lines in Arkivet.log answers "what did
/// Windows actually launch?" without touching the clinic machine.
#[cfg(target_os = "windows")]
fn log_windows_launch_context(path: &str) {
    match std::fs::metadata(path) {
        Ok(m) => log::info!("   📄 File exists, {} bytes", m.len()),
        Err(e) => log::error!("   ❌ File does NOT exist at launch time: {}", e),
    }
    log::info!(
        "   🔗 'open' handler: {}",
        windows_resolve_association(path, Some("open")).unwrap_or_else(|| "<none registered>".into())
    );
    log::info!(
        "   🔗 'print' handler: {}",
        windows_resolve_association(path, Some("print")).unwrap_or_else(|| "<none registered>".into())
    );
}

/// Human-readable meaning of a ShellExecute result code <= 32, so clinic logs
/// don't require a Win32 reference to interpret.
#[cfg(target_os = "windows")]
fn describe_shellexecute_code(code: i32) -> &'static str {
    match code {
        0 => "system out of memory or resources",
        2 => "file not found (SE_ERR_FNF)",
        3 => "path not found (SE_ERR_PNF)",
        5 => "access denied (SE_ERR_ACCESSDENIED)",
        8 => "out of memory (SE_ERR_OOM)",
        26 => "sharing violation (SE_ERR_SHARE)",
        27 => "file association incomplete or invalid (SE_ERR_ASSOCINCOMPLETE)",
        28 => "DDE transaction timed out (SE_ERR_DDETIMEOUT)",
        29 => "DDE transaction failed (SE_ERR_DDEFAIL)",
        30 => "DDE busy (SE_ERR_DDEBUSY)",
        31 => "no application associated with this file type (SE_ERR_NOASSOC)",
        32 => "DLL not found (SE_ERR_DLLNOTFOUND)",
        _ => "unknown error",
    }
}
