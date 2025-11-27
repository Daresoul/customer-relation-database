use tauri::{AppHandle, State};
use crate::database::connection::DatabasePool;
use crate::models::medical::*;
use crate::services::medical_record::MedicalRecordService;
use crate::services::file_storage::FileStorageService;
use crate::services::pdf_render::PdfRenderService;
use crate::services::device_parser::DeviceParserService;
use crate::services::device_pdf_service::{DevicePdfService, PatientData, DeviceTestData};
use sqlx::Row;

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
    app_handle: AppHandle,
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
    if input.record_type != "procedure" && input.record_type != "note" && input.record_type != "test_result" {
        return Err("Invalid record type".to_string());
    }
    // Note: We use the 'name' field for both procedures and notes
    // No need to check procedure_name separately

    MedicalRecordService::create_medical_record(&app_handle, &*pool_guard, input).await
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
    #[allow(non_snake_case)]
    deviceType: Option<String>,
    #[allow(non_snake_case)]
    deviceName: Option<String>,
    #[allow(non_snake_case)]
    connectionMethod: Option<String>,
    #[allow(non_snake_case)]
    attachmentType: Option<String>,
    #[allow(non_snake_case)]
    sourceFileId: Option<String>,
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

    let attachment = FileStorageService::upload_attachment(
        &app_handle,
        &*pool_guard,
        medicalRecordId,
        fileName,
        fileData,
        mimeType,
        deviceType,
        deviceName,
        connectionMethod,
        attachmentType,
    ).await?;

    // If this file came from file_access_history, update the tracking
    if let Some(source_file_id) = sourceFileId {
        use crate::commands::file_history::update_file_attachment_internal;
        if let Err(e) = update_file_attachment_internal(&*pool_guard, source_file_id, medicalRecordId).await {
            eprintln!("Warning: Failed to update file attachment tracking: {}", e);
            // Don't fail the upload, just log the warning
        }
    }

    Ok(attachment)
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

// Get attachment content for text file viewer
#[tauri::command]
pub async fn get_attachment_content(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<Vec<u8>, String> {
    let pool = pool.lock().await;
    let attachment_data = FileStorageService::download_attachment(&app_handle, &*pool, attachment_id).await?;
    Ok(attachment_data.file_data)
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

// Print a PDF attachment using the system's native print functionality
#[tauri::command]
pub async fn print_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<(), String> {
    let pool_guard = pool.lock().await;
    let path = FileStorageService::materialize_attachment(&app_handle, &*pool_guard, attachment_id).await?;
    FileStorageService::print_file(&path)
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

// T029: Regenerate PDF from device data attachment
#[tauri::command]
pub async fn regenerate_pdf_from_attachment(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    attachment_id: i64,
) -> Result<MedicalAttachment, String> {
    println!("Debug: regenerate_pdf_from_attachment attachment_id={}", attachment_id);
    let pool_guard = pool.lock().await;

    // 1. Fetch the attachment with device metadata
    let attachment_row = sqlx::query(
        "SELECT id, medical_record_id, file_id, original_name, mime_type, \
         file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
         FROM medical_attachments WHERE id = ?"
    )
    .bind(attachment_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch attachment: {}", e))?
    .ok_or("Attachment not found".to_string())?;

    let medical_record_id: i64 = attachment_row.try_get("medical_record_id")
        .map_err(|e| format!("Failed to get medical_record_id: {}", e))?;
    let device_type: Option<String> = attachment_row.try_get("device_type").ok();
    let device_name: Option<String> = attachment_row.try_get("device_name").ok();
    let connection_method: Option<String> = attachment_row.try_get("connection_method").ok();
    let original_name: String = attachment_row.try_get("original_name")
        .map_err(|e| format!("Failed to get original_name: {}", e))?;

    // 2. Validate that this attachment has device metadata
    let device_type = device_type.ok_or("This attachment does not have device metadata. Cannot regenerate PDF.".to_string())?;
    let device_name = device_name.ok_or("This attachment is missing device name metadata.".to_string())?;
    let connection_method = connection_method.unwrap_or_else(|| "unknown".to_string()); // Default for old attachments without this field

    println!("Debug: Regenerating PDF for device_type={}, device_name={}, connection_method={}", device_type, device_name, connection_method);

    // 3. Download the XML file data
    let xml_data = FileStorageService::download_attachment(&app_handle, &*pool_guard, attachment_id).await?;

    // 4. Parse the device data
    let device_data = DeviceParserService::parse_device_data(
        &device_type,
        &device_name,
        &xml_data.file_name,
        &xml_data.file_data,
        &connection_method,
    )?;

    println!("Debug: Parsed device data, patient_identifier={:?}", device_data.patient_identifier);

    // 5. Get patient info from the medical record
    let record_row = sqlx::query(
        "SELECT patient_id FROM medical_records WHERE id = ?"
    )
    .bind(medical_record_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch medical record: {}", e))?
    .ok_or("Medical record not found".to_string())?;

    let patient_id: i64 = record_row.try_get("patient_id")
        .map_err(|e| format!("Failed to get patient_id: {}", e))?;

    // Fetch patient details (simplified query to avoid schema issues)
    let patient_row = sqlx::query(
        "SELECT id, name, species, breed, microchip_id, gender, date_of_birth \
         FROM patients \
         WHERE id = ?"
    )
    .bind(patient_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch patient: {}", e))?
    .ok_or("Patient not found".to_string())?;

    // Try to fetch owner information separately (optional, won't fail if tables don't exist)
    let owner_name = sqlx::query_scalar::<_, String>(
        "SELECT o.name FROM patient_owners po \
         JOIN owners o ON po.owner_id = o.id \
         WHERE po.patient_id = ? AND po.is_primary = 1 \
         LIMIT 1"
    )
    .bind(patient_id)
    .fetch_optional(&*pool_guard)
    .await
    .unwrap_or(None)
    .unwrap_or_else(|| "Unknown Owner".to_string());

    let patient_data = PatientData {
        name: patient_row.try_get("name").unwrap_or_else(|_| "Unknown Patient".to_string()),
        owner: owner_name,
        species: patient_row.try_get("species").unwrap_or_else(|_| "Unknown Species".to_string()),
        microchip_id: patient_row.try_get("microchip_id").ok(),
        gender: patient_row.try_get("gender").unwrap_or_else(|_| "Unknown".to_string()),
        date_of_birth: patient_row.try_get("date_of_birth").ok(),
    };

    println!("Debug: Patient info: name={}, microchip={:?}", patient_data.name, patient_data.microchip_id);

    // 6. Generate PDF using centralized service (same function as file watcher)
    let pdf_filename = format!("{}_regenerated.pdf", original_name.trim_end_matches(".xml"));
    let pdf_path = std::env::temp_dir().join(&pdf_filename);

    let test_data = DeviceTestData {
        device_type: device_data.device_type.clone(),
        device_name: device_data.device_name.clone(),
        test_results: device_data.test_results.clone(),
        detected_at: device_data.detected_at,
        patient_identifier: device_data.patient_identifier.clone(),
    };

    // Generate PDF using centralized service (single source of truth)
    DevicePdfService::generate_pdf(
        &app_handle,
        pdf_path.to_str().ok_or("Invalid PDF path")?,
        patient_data,
        test_data,
    )?;

    println!("Debug: PDF generated at {:?}", pdf_path);

    // 8. Read the generated PDF
    let pdf_bytes = std::fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    println!("Debug: Read {} bytes from PDF", pdf_bytes.len());

    // 9. Upload the PDF as a new attachment to the same medical record
    let pdf_attachment = FileStorageService::upload_attachment(
        &app_handle,
        &*pool_guard,
        medical_record_id,
        pdf_filename.clone(),
        pdf_bytes,
        "application/pdf".to_string(),
        Some(format!("{}_report", device_type)),
        Some(format!("{} Report", device_name)),
        Some("regenerated".to_string()),
        Some("generated_pdf".to_string()), // Attachment type for regenerated PDFs
    ).await?;

    println!("Debug: PDF attachment uploaded with id={}", pdf_attachment.id);

    // Clean up temp file
    let _ = std::fs::remove_file(&pdf_path);

    Ok(pdf_attachment)
}

// T030: Regenerate PDF from ALL test_result attachments in a medical record
#[tauri::command]
pub async fn regenerate_pdf_from_medical_record(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    medical_record_id: i64,
) -> Result<MedicalAttachment, String> {
    println!("Debug: regenerate_pdf_from_medical_record medical_record_id={}", medical_record_id);
    let pool_guard = pool.lock().await;

    // 1. Get all device data attachments for this medical record
    // Check for attachment_type = 'test_result' OR files with device metadata that aren't PDFs
    // This handles both new files (with proper attachment_type) and legacy files (with device_type set)
    let attachment_rows = sqlx::query(
        "SELECT id, medical_record_id, file_id, original_name, mime_type, \
         file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
         FROM medical_attachments \
         WHERE medical_record_id = ? \
         AND device_type IS NOT NULL \
         AND device_name IS NOT NULL \
         AND (attachment_type = 'test_result' \
              OR (attachment_type != 'generated_pdf' AND mime_type != 'application/pdf'))"
    )
    .bind(medical_record_id)
    .fetch_all(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch device data attachments: {}", e))?;

    if attachment_rows.is_empty() {
        return Err("No device data attachments found for this medical record.".to_string());
    }

    println!("Debug: Found {} test_result attachments", attachment_rows.len());

    // 2. Get patient info from the medical record
    let record_row = sqlx::query(
        "SELECT patient_id FROM medical_records WHERE id = ?"
    )
    .bind(medical_record_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch medical record: {}", e))?
    .ok_or("Medical record not found".to_string())?;

    let patient_id: i64 = record_row.try_get("patient_id")
        .map_err(|e| format!("Failed to get patient_id: {}", e))?;

    // 3. Fetch patient details using the same query pattern as MedicalRecordService
    let patient_row = sqlx::query(
        "SELECT p.name, p.gender, p.date_of_birth, p.microchip_id, \
         s.name as species_name \
         FROM patients p \
         LEFT JOIN species s ON p.species_id = s.id \
         WHERE p.id = ?"
    )
    .bind(patient_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch patient: {}", e))?
    .ok_or("Patient not found".to_string())?;

    // Try to get owner information - prefer primary contact's full name, fall back to household name
    let owner_name = sqlx::query_scalar::<_, String>(
        "SELECT COALESCE( \
            (SELECT p.first_name || ' ' || p.last_name \
             FROM people p \
             JOIN household_members hm ON hm.person_id = p.id \
             JOIN patient_households ph ON ph.household_id = hm.household_id \
             WHERE ph.patient_id = ? AND hm.is_primary_contact = 1 \
             LIMIT 1), \
            (SELECT h.name \
             FROM households h \
             JOIN patient_households ph ON ph.household_id = h.id \
             WHERE ph.patient_id = ? \
             LIMIT 1), \
            'Unknown Owner' \
         )"
    )
    .bind(patient_id)
    .bind(patient_id)
    .fetch_one(&*pool_guard)
    .await
    .unwrap_or_else(|_| "Unknown Owner".to_string());

    let patient_data = PatientData {
        name: patient_row.try_get("name").unwrap_or_else(|_| "Unknown Patient".to_string()),
        owner: owner_name,
        species: patient_row.try_get("species_name").unwrap_or_else(|_| "Unknown Species".to_string()),
        microchip_id: patient_row.try_get("microchip_id").ok(),
        gender: patient_row.try_get("gender").unwrap_or_else(|_| "Unknown".to_string()),
        date_of_birth: patient_row.try_get("date_of_birth").ok(),
    };

    println!("Debug: Patient info: name={}, microchip={:?}", patient_data.name, patient_data.microchip_id);

    // 4. Parse each attachment and collect device data
    let mut all_device_data: Vec<DeviceTestData> = Vec::new();

    for attachment_row in &attachment_rows {
        let attachment_id: i64 = attachment_row.try_get("id")
            .map_err(|e| format!("Failed to get attachment id: {}", e))?;
        let device_type: Option<String> = attachment_row.try_get("device_type").ok();
        let device_name: Option<String> = attachment_row.try_get("device_name").ok();
        let connection_method: Option<String> = attachment_row.try_get("connection_method").ok();
        let original_name: String = attachment_row.try_get("original_name")
            .map_err(|e| format!("Failed to get original_name: {}", e))?;

        // Skip if missing device metadata
        let device_type = match device_type {
            Some(dt) => dt,
            None => {
                println!("Debug: Skipping attachment {} - no device_type", attachment_id);
                continue;
            }
        };
        let device_name = match device_name {
            Some(dn) => dn,
            None => {
                println!("Debug: Skipping attachment {} - no device_name", attachment_id);
                continue;
            }
        };
        let connection_method = connection_method.unwrap_or_else(|| "unknown".to_string());

        println!("Debug: Processing attachment {} - device_type={}, device_name={}", attachment_id, device_type, device_name);

        // Download the file data
        let file_data = FileStorageService::download_attachment(&app_handle, &*pool_guard, attachment_id).await?;

        // Parse the device data (works for XML, JSON, etc.)
        match DeviceParserService::parse_device_data(
            &device_type,
            &device_name,
            &file_data.file_name,
            &file_data.file_data,
            &connection_method,
        ) {
            Ok(parsed_data) => {
                println!("Debug: Parsed device data from {}", original_name);
                all_device_data.push(DeviceTestData {
                    device_type: parsed_data.device_type.clone(),
                    device_name: parsed_data.device_name.clone(),
                    test_results: parsed_data.test_results.clone(),
                    detected_at: parsed_data.detected_at,
                    patient_identifier: patient_data.microchip_id.clone().or_else(|| Some(patient_data.name.clone())),
                });
            }
            Err(e) => {
                println!("Debug: Failed to parse attachment {}: {}", attachment_id, e);
                // Continue with other attachments
            }
        }
    }

    if all_device_data.is_empty() {
        return Err("Could not parse any device data from test_result attachments.".to_string());
    }

    println!("Debug: Parsed {} device data sets", all_device_data.len());

    // 5. Generate combined PDF using Java service
    use crate::services::java_pdf_service::JavaPdfService;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let pdf_filename = if all_device_data.len() == 1 {
        let device = &all_device_data[0];
        let safe_device_name = device.device_name.replace(" ", "_").replace("/", "_");
        let safe_device_type = device.device_type.replace("_", "-");
        format!("{}_{}_report_{}.pdf", safe_device_type, safe_device_name, timestamp)
    } else {
        format!("combined_device_report_{}.pdf", timestamp)
    };

    let pdf_path = std::env::temp_dir().join(&pdf_filename);

    // Convert PatientData to the format expected by Java PDF service
    let java_patient_data = crate::services::device_pdf_service::PatientData {
        name: patient_data.name.clone(),
        owner: patient_data.owner.clone(),
        species: patient_data.species.clone(),
        microchip_id: patient_data.microchip_id.clone(),
        gender: patient_data.gender.clone(),
        date_of_birth: patient_data.date_of_birth.clone(),
    };

    // Convert DeviceTestData to the format expected by Java PDF service
    let java_device_data: Vec<crate::services::device_pdf_service::DeviceTestData> = all_device_data
        .iter()
        .map(|d| crate::services::device_pdf_service::DeviceTestData {
            device_type: d.device_type.clone(),
            device_name: d.device_name.clone(),
            test_results: d.test_results.clone(),
            detected_at: d.detected_at,
            patient_identifier: d.patient_identifier.clone(),
        })
        .collect();

    // Generate PDF with all devices
    println!("   ☕ Generating combined PDF report using Java...");
    JavaPdfService::generate_pdf_multi(
        &app_handle,
        pdf_path.to_str().ok_or("Invalid PDF path")?,
        &java_patient_data,
        &java_device_data,
    )?;

    println!("Debug: PDF generated at {:?}", pdf_path);

    // 6. Read the generated PDF
    let pdf_bytes = std::fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    println!("Debug: Read {} bytes from PDF", pdf_bytes.len());

    // 7. Determine device metadata for the attachment
    let device_type_str = if all_device_data.len() > 1 {
        "combined".to_string()
    } else {
        all_device_data[0].device_type.clone()
    };
    let device_name_str = if all_device_data.len() > 1 {
        "Multiple Devices".to_string()
    } else {
        all_device_data[0].device_name.clone()
    };

    // 8. Upload the PDF as a new attachment
    let pdf_attachment = FileStorageService::upload_attachment(
        &app_handle,
        &*pool_guard,
        medical_record_id,
        pdf_filename.clone(),
        pdf_bytes,
        "application/pdf".to_string(),
        Some(format!("{}_report", device_type_str)),
        Some(format!("{} Report (Regenerated)", device_name_str)),
        Some("regenerated".to_string()),
        Some("generated_pdf".to_string()),
    ).await?;

    println!("Debug: PDF attachment uploaded with id={}", pdf_attachment.id);

    // Clean up temp file
    let _ = std::fs::remove_file(&pdf_path);

    Ok(pdf_attachment)
}

// ============================================================================
// Record Template Commands
// ============================================================================

#[tauri::command]
pub async fn get_record_templates(
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    recordType: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    let pool = pool.lock().await;

    let query = if let Some(ref rt) = recordType {
        sqlx::query_as::<_, RecordTemplate>(
            "SELECT * FROM record_templates WHERE record_type = ? ORDER BY title ASC"
        )
        .bind(rt)
    } else {
        sqlx::query_as::<_, RecordTemplate>(
            "SELECT * FROM record_templates ORDER BY record_type, title ASC"
        )
    };

    let templates = query
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to fetch record templates: {}", e))?;

    Ok(templates)
}

#[tauri::command]
pub async fn search_record_templates(
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    searchTerm: String,
    #[allow(non_snake_case)]
    recordType: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    let pool = pool.lock().await;

    let search_pattern = format!("%{}%", searchTerm);

    let query = if let Some(ref rt) = recordType {
        sqlx::query_as::<_, RecordTemplate>(
            "SELECT * FROM record_templates WHERE record_type = ? AND (title LIKE ? OR description LIKE ?) ORDER BY title ASC"
        )
        .bind(rt)
        .bind(&search_pattern)
        .bind(&search_pattern)
    } else {
        sqlx::query_as::<_, RecordTemplate>(
            "SELECT * FROM record_templates WHERE title LIKE ? OR description LIKE ? ORDER BY record_type, title ASC"
        )
        .bind(&search_pattern)
        .bind(&search_pattern)
    };

    let templates = query
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to search record templates: {}", e))?;

    Ok(templates)
}

#[tauri::command]
pub async fn create_record_template(
    pool: State<'_, DatabasePool>,
    input: CreateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    let pool = pool.lock().await;

    // Validate record type
    if input.record_type != "procedure" && input.record_type != "note" && input.record_type != "test_result" {
        return Err(format!("Invalid record type: {}. Must be 'procedure', 'note', or 'test_result'", input.record_type));
    }

    let result = sqlx::query(
        "INSERT INTO record_templates (record_type, title, description, price, currency_id) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&input.record_type)
    .bind(&input.title)
    .bind(&input.description)
    .bind(input.price)
    .bind(input.currency_id)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to create record template: {}", e))?;

    let template_id = result.last_insert_rowid();

    let template = sqlx::query_as::<_, RecordTemplate>(
        "SELECT * FROM record_templates WHERE id = ?"
    )
    .bind(template_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch created template: {}", e))?;

    Ok(template)
}

#[tauri::command]
pub async fn update_record_template(
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    templateId: i64,
    input: UpdateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    let pool = pool.lock().await;

    // Build dynamic UPDATE query for efficiency
    let mut set_clauses = Vec::new();

    if input.title.is_some() { set_clauses.push("title = ?"); }
    if input.description.is_some() { set_clauses.push("description = ?"); }
    if input.price.is_some() { set_clauses.push("price = ?"); }
    if input.currency_id.is_some() { set_clauses.push("currency_id = ?"); }

    if !set_clauses.is_empty() {
        let mut query_str = "UPDATE record_templates SET ".to_string();
        query_str.push_str(&set_clauses.join(", "));
        query_str.push_str(" WHERE id = ?");

        let mut query = sqlx::query(&query_str);

        if let Some(title) = input.title { query = query.bind(title); }
        if let Some(description) = input.description { query = query.bind(description); }
        if let Some(price) = input.price { query = query.bind(price); }
        if let Some(currency_id) = input.currency_id { query = query.bind(currency_id); }
        query = query.bind(templateId);

        query.execute(&*pool).await
            .map_err(|e| format!("Failed to update template: {}", e))?;
    }

    let template = sqlx::query_as::<_, RecordTemplate>(
        "SELECT * FROM record_templates WHERE id = ?"
    )
    .bind(templateId)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch updated template: {}", e))?;

    Ok(template)
}

#[tauri::command]
pub async fn delete_record_template(
    pool: State<'_, DatabasePool>,
    #[allow(non_snake_case)]
    templateId: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;

    sqlx::query("DELETE FROM record_templates WHERE id = ?")
        .bind(templateId)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete template: {}", e))?;

    Ok(())
}
