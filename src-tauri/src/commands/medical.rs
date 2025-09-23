use tauri::{AppHandle, State};
use crate::database::connection::DatabasePool;
use crate::models::medical::*;
use crate::services::medical_record::MedicalRecordService;
use crate::services::file_storage::FileStorageService;
use crate::services::pdf_render::PdfRenderService;

// T031: Implement get_medical_records command
#[tauri::command]
pub async fn get_medical_records(
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    patientId: i64,
    filter: Option<MedicalRecordFilter>,
    pagination: Option<PaginationParams>,
) -> Result<MedicalRecordsResponse, String> {
    let pool = pool.lock().await;
    MedicalRecordService::get_medical_records(&*pool, patientId, filter, pagination).await
}

// T032: Implement get_medical_record command
#[tauri::command]
pub async fn get_medical_record(
    pool: State<'_, DatabasePool>,
    record_id: i64,
    include_history: Option<bool>,
) -> Result<MedicalRecordDetail, String> {
    println!("Debug: get_medical_record called for record_id: {}", record_id);
    let pool = pool.lock().await;
    let include_history = include_history.unwrap_or(false);
    let result = MedicalRecordService::get_medical_record(&*pool, record_id, include_history).await;
    match &result {
        Ok(_) => println!("Debug: get_medical_record result: OK"),
        Err(err) => eprintln!("Error: get_medical_record failed: {}", err),
    }
    result
}

// T033: Implement create_medical_record command
#[tauri::command]
pub async fn create_medical_record(
    pool: State<'_, DatabasePool>,
    input: CreateMedicalRecordInput,
) -> Result<MedicalRecord, String> {
    let pool_guard = pool.lock().await;

    // Validate input
    if input.name.is_empty() {
        return Err("Name is required".to_string());
    }
    if input.description.is_empty() {
        return Err("Description is required".to_string());
    }
    if input.record_type != "procedure" && input.record_type != "note" {
        return Err("Invalid record type".to_string());
    }
    // Note: We use the 'name' field for both procedures and notes
    // No need to check procedure_name separately

    MedicalRecordService::create_medical_record(&*pool_guard, input).await
}

// T034: Implement update_medical_record command
#[tauri::command]
pub async fn update_medical_record(
    pool: State<'_, DatabasePool>,
    record_id: i64,
    updates: UpdateMedicalRecordInput,
) -> Result<MedicalRecord, String> {
    let pool_guard = pool.lock().await;

    // Validate updates
    if let Some(ref name) = updates.name {
        if name.is_empty() {
            return Err("Name cannot be empty".to_string());
        }
    }
    if let Some(ref description) = updates.description {
        if description.is_empty() {
            return Err("Description cannot be empty".to_string());
        }
    }

    MedicalRecordService::update_medical_record(&*pool_guard, record_id, updates).await
}

// T035: Implement archive_medical_record command
#[tauri::command]
pub async fn archive_medical_record(
    pool: State<'_, DatabasePool>,
    record_id: i64,
    archive: bool,
) -> Result<(), String> {
    let pool = pool.lock().await;
    MedicalRecordService::archive_medical_record(&*pool, record_id, archive).await
}

// T036: Implement upload_medical_attachment command
#[tauri::command]
pub async fn upload_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    medicalRecordId: i64,
    #[allow(non_snake_case)]
    fileName: String,
    #[allow(non_snake_case)]
    fileData: Vec<u8>,
    #[allow(non_snake_case)]
    mimeType: String,
) -> Result<MedicalAttachment, String> {
    let pool_guard = pool.lock().await;

    // Validate file
    FileStorageService::validate_file(&fileData, &fileName, 100)?;

    // Check if medical record exists
    let _ = sqlx::query("SELECT id FROM medical_records WHERE id = ?")
        .bind(medicalRecordId)
        .fetch_one(&*pool_guard)
        .await
        .map_err(|_| "Medical record not found".to_string())?;

    FileStorageService::upload_attachment(
        &app_handle,
        &*pool_guard,
        medicalRecordId,
        fileName,
        fileData,
        mimeType,
    ).await
}

// T037: Implement download_medical_attachment command
#[tauri::command]
pub async fn download_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<AttachmentData, String> {
    println!("Debug: download_medical_attachment id={}", attachment_id);
    let pool = pool.lock().await;
    let res = FileStorageService::download_attachment(&app_handle, &*pool, attachment_id).await;
    match &res {
        Ok(a) => println!("Debug: download_medical_attachment bytes={} mime={}", a.file_data.len(), a.mime_type),
        Err(e) => eprintln!("Error: download_medical_attachment failed: {}", e),
    }
    res
}

// T038: Implement delete_medical_attachment command
#[tauri::command]
pub async fn delete_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;
    FileStorageService::delete_attachment(&app_handle, &*pool, attachment_id).await
}

// T039: Implement search_medical_records command
#[tauri::command]
pub async fn search_medical_records(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    search_term: String,
    include_archived: Option<bool>,
) -> Result<SearchMedicalRecordsResponse, String> {
    let pool_guard = pool.lock().await;

    // Validate search term
    if search_term.len() < 2 {
        return Err("Search term must be at least 2 characters".to_string());
    }

    let include_archived = include_archived.unwrap_or(false);
    let records = MedicalRecordService::search_medical_records(
        &*pool_guard,
        patient_id,
        &search_term,
        include_archived,
    ).await?;

    Ok(SearchMedicalRecordsResponse {
        match_count: records.len() as i64,
        records,
    })
}

// T040: Implement get_currencies command
#[tauri::command]
pub async fn get_currencies(
    pool: State<'_, DatabasePool>,
) -> Result<Vec<Currency>, String> {
    let pool = pool.lock().await;
    MedicalRecordService::get_currencies(&*pool).await
}

// Helper command to clean up orphaned files
#[tauri::command]
pub async fn cleanup_orphaned_files(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
) -> Result<usize, String> {
    let pool = pool.lock().await;
    FileStorageService::cleanup_orphaned_files(&app_handle, &*pool).await
}

// Extra: Materialize attachment to temp and return path
#[tauri::command]
pub async fn materialize_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<String, String> {
    let pool = pool.lock().await;
    FileStorageService::materialize_attachment(&app_handle, &*pool, attachment_id).await
}

// Extra: Write attachment to a specific path
#[tauri::command]
pub async fn write_medical_attachment_to_path(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
    target_path: String,
) -> Result<(), String> {
    let pool = pool.lock().await;
    FileStorageService::write_attachment_to_path(&app_handle, &*pool, attachment_id, target_path).await
}

// Open attachment with default app (materialize to temp first)
#[tauri::command]
pub async fn open_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<(), String> {
    let pool_guard = pool.lock().await;
    let path = FileStorageService::materialize_attachment(&app_handle, &*pool_guard, attachment_id).await?;
    FileStorageService::open_path_with_default_app(&path)
}

// Render a PDF attachment page to a PNG thumbnail and return the temp file path
#[tauri::command]
pub async fn render_medical_attachment_pdf_thumbnail(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    attachmentId: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<String, String> {
    render_medical_attachment_pdf_thumbnail_with_options(
        app_handle,
        pool,
        attachmentId,
        page,
        width,
        false, // Don't force regenerate by default
    ).await
}

// Extended version with force regenerate option
#[tauri::command]
pub async fn render_medical_attachment_pdf_thumbnail_force(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    attachmentId: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<String, String> {
    render_medical_attachment_pdf_thumbnail_with_options(
        app_handle,
        pool,
        attachmentId,
        page,
        width,
        true, // Force regenerate
    ).await
}

async fn render_medical_attachment_pdf_thumbnail_with_options(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    attachmentId: i64,
    page: Option<u32>,
    width: Option<u32>,
    force_regenerate: bool,
) -> Result<String, String> {
    println!("Debug: render_medical_attachment_pdf_thumbnail called - attachmentId={}, page={:?}, width={:?}, force={}",
        attachmentId, page, width, force_regenerate);

    let pool_guard = pool.lock().await;

    // First materialize the attachment to a temp file to get a local path
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &*pool_guard, attachmentId).await?;
    println!("Debug: PDF materialized at: {}", pdf_path);

    // Build preview output path in a stable temp dir
    let mut tmp_dir = std::env::temp_dir();
    tmp_dir.push("vet-clinic-attachments");
    tmp_dir.push("previews");
    let page_index = page.unwrap_or(1).saturating_sub(1); // 1-based to 0-based
    let target_width = width.unwrap_or(900);
    let file_name = format!("attachment_{}_p{}_w{}.png", attachmentId, page_index + 1, target_width);
    let out_path = tmp_dir.join(file_name);

    // Check if preview exists and is valid (not 0 bytes) unless force regenerate
    if !force_regenerate && out_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&out_path) {
            if metadata.len() > 0 {
                println!("Debug: Using cached preview: {} ({} bytes)", out_path.display(), metadata.len());
                return Ok(out_path.display().to_string());
            } else {
                println!("Debug: Cached preview is 0 bytes, regenerating");
                // Delete the broken file
                let _ = std::fs::remove_file(&out_path);
            }
        }
    } else if force_regenerate && out_path.exists() {
        println!("Debug: Force regenerating preview, removing old file");
        let _ = std::fs::remove_file(&out_path);
    }

    let pdf_path_clone = pdf_path.clone();

    // Render in a blocking thread - use bytes method instead for better reliability
    let handle_clone = app_handle.clone();
    let png_bytes = tauri::async_runtime::spawn_blocking(move || {
        PdfRenderService::render_page_to_png_bytes(&handle_clone, &pdf_path_clone, page_index, target_width)
    })
    .await
    .map_err(|e| format!("Spawn failed: {}", e))??;

    // Write bytes to output file
    std::fs::create_dir_all(out_path.parent().unwrap())
        .map_err(|e| format!("Failed to create preview dir: {}", e))?;
    std::fs::write(&out_path, &png_bytes)
        .map_err(|e| format!("Failed to write preview: {}", e))?;

    println!("Debug: Wrote {} bytes to {:?}", png_bytes.len(), out_path);
    Ok(out_path.display().to_string())
}

// Render a PDF attachment page to PNG bytes (faster & no FS read needed)
#[tauri::command]
pub async fn render_medical_attachment_pdf_page_png(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<Vec<u8>, String> {
    let pool_guard = pool.lock().await;
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &*pool_guard, attachment_id).await?;
    let page_index = page.unwrap_or(1).saturating_sub(1);
    let target_width = width.unwrap_or(900);
    let handle_clone = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        PdfRenderService::render_page_to_png_bytes(&handle_clone, &pdf_path, page_index, target_width)
    })
    .await
    .map_err(|e| format!("Spawn failed: {}", e))?
}
// Get the total page count for a PDF attachment
#[tauri::command]
pub async fn get_medical_attachment_pdf_page_count(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<u16, String> {
    let pool_guard = pool.lock().await;
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &*pool_guard, attachment_id).await?;
    let handle_clone = app_handle.clone();
    let res = tauri::async_runtime::spawn_blocking(move || PdfRenderService::get_page_count(&handle_clone, &pdf_path))
        .await
        .map_err(|e| format!("Spawn failed: {}", e))?;
    res
}

// Revert a medical record one step to previous version
#[tauri::command]
pub async fn revert_medical_record(
    pool: State<'_, DatabasePool>,
    record_id: i64,
) -> Result<MedicalRecord, String> {
    let pool = pool.lock().await;
    MedicalRecordService::revert_one_step(&*pool, record_id).await
}

// Get medical record snapshot at a specific version
#[tauri::command]
pub async fn get_medical_record_at_version(
    pool: State<'_, DatabasePool>,
    record_id: i64,
    version: i32,
) -> Result<MedicalRecord, String> {
    println!("Debug: get_medical_record_at_version record_id={}, version={}", record_id, version);
    let pool = pool.lock().await;
    let res = MedicalRecordService::get_record_at_version(&*pool, record_id, version).await;
    match &res {
        Ok(r) => println!("Debug: snapshot loaded: id={}, name={}, type={}, version={}", r.id, r.name, r.record_type, r.version),
        Err(e) => eprintln!("Error: get_medical_record_at_version failed: {}", e),
    }
    res
}
