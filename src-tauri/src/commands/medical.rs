use tauri::{AppHandle, State};
use crate::database::SeaOrmPool;
use crate::models::medical::*;
use crate::services::medical_record::MedicalRecordService;
use crate::services::file_storage::FileStorageService;
use crate::services::pdf_render::PdfRenderService;
use crate::services::device_parser::DeviceParserService;
use crate::services::device_pdf_service::{DevicePdfService, PatientData, DeviceTestData};
use sea_orm::{ConnectionTrait, Statement, DbBackend};

// T031: Implement get_medical_records command
#[tauri::command]
pub async fn get_medical_records(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    filter: Option<MedicalRecordFilter>,
    pagination: Option<PaginationParams>,
) -> Result<MedicalRecordsResponse, String> {
    MedicalRecordService::get_medical_records(&pool, patient_id, filter, pagination).await
}

// T032: Implement get_medical_record command
#[tauri::command]
pub async fn get_medical_record(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    include_history: Option<bool>,
) -> Result<MedicalRecordDetail, String> {
    log::debug!("get_medical_record called for record_id: {}", record_id);
    let include_history = include_history.unwrap_or(false);
    let result = MedicalRecordService::get_medical_record(&pool, record_id, include_history).await;
    match &result {
        Ok(_) => log::debug!("get_medical_record result: OK"),
        Err(err) => log::error!("get_medical_record failed: {}", err),
    }
    result
}

// T033: Implement create_medical_record command
#[tauri::command]
pub async fn create_medical_record(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    input: CreateMedicalRecordInput,
) -> Result<MedicalRecord, String> {
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

    MedicalRecordService::create_medical_record(&app_handle, &pool, input).await
}

// T034: Implement update_medical_record command
#[tauri::command]
pub async fn update_medical_record(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    updates: UpdateMedicalRecordInput,
) -> Result<MedicalRecord, String> {
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

    MedicalRecordService::update_medical_record(&pool, record_id, updates).await
}

// T035: Implement archive_medical_record command
#[tauri::command]
pub async fn archive_medical_record(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    archive: bool,
) -> Result<(), String> {
    MedicalRecordService::archive_medical_record(&pool, record_id, archive).await
}

// T036: Implement upload_medical_attachment command
#[tauri::command]
pub async fn upload_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
    file_name: String,
    file_data: Vec<u8>,
    mime_type: String,
    device_type: Option<String>,
    device_name: Option<String>,
    connection_method: Option<String>,
    attachment_type: Option<String>,
    source_file_id: Option<String>,
) -> Result<MedicalAttachment, String> {
    // Validate file
    FileStorageService::validate_file(&file_data, &file_name, 100)?;

    // Check if medical record exists
    let _ = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM medical_records WHERE id = ?",
        [medical_record_id.into()]
    ))
    .await
    .map_err(|_| "Medical record not found".to_string())?
    .ok_or("Medical record not found".to_string())?;

    let attachment = FileStorageService::upload_attachment(
        &app_handle,
        &pool,
        medical_record_id,
        file_name,
        file_data,
        mime_type,
        device_type,
        device_name,
        connection_method,
        attachment_type,
    ).await?;

    // If this file came from file_access_history, update the tracking
    if let Some(file_id) = source_file_id {
        use crate::commands::file_history::update_file_attachment_internal_seaorm;
        if let Err(e) = update_file_attachment_internal_seaorm(&pool, file_id, medical_record_id).await {
            log::warn!("Failed to update file attachment tracking: {}", e);
            // Don't fail the upload, just log the warning
        }
    }

    Ok(attachment)
}

// T037: Implement download_medical_attachment command
#[tauri::command]
pub async fn download_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<AttachmentData, String> {
    log::debug!("download_medical_attachment id={}", attachment_id);
    let res = FileStorageService::download_attachment(&app_handle, &pool, attachment_id).await;
    match &res {
        Ok(a) => log::debug!("download_medical_attachment bytes={} mime={}", a.file_data.len(), a.mime_type),
        Err(e) => log::error!("download_medical_attachment failed: {}", e),
    }
    res
}

// T038: Implement delete_medical_attachment command
#[tauri::command]
pub async fn delete_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<(), String> {
    FileStorageService::delete_attachment(&app_handle, &pool, attachment_id).await
}

// Get attachment content for text file viewer
#[tauri::command]
pub async fn get_attachment_content(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<Vec<u8>, String> {
    let attachment_data = FileStorageService::download_attachment(&app_handle, &pool, attachment_id).await?;
    Ok(attachment_data.file_data)
}

// T039: Implement search_medical_records command
#[tauri::command]
pub async fn search_medical_records(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    search_term: String,
    include_archived: Option<bool>,
) -> Result<SearchMedicalRecordsResponse, String> {
    // Validate search term
    if search_term.len() < 2 {
        return Err("Search term must be at least 2 characters".to_string());
    }

    let include_archived = include_archived.unwrap_or(false);
    let records = MedicalRecordService::search_medical_records(
        &pool,
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
    pool: State<'_, SeaOrmPool>,
) -> Result<Vec<Currency>, String> {
    MedicalRecordService::get_currencies(&pool).await
}

// Helper command to clean up orphaned files
#[tauri::command]
pub async fn cleanup_orphaned_files(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
) -> Result<usize, String> {
    FileStorageService::cleanup_orphaned_files(&app_handle, &pool).await
}

// Extra: Materialize attachment to temp and return path
#[tauri::command]
pub async fn materialize_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<String, String> {
    FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await
}

// Extra: Write attachment to a specific path
#[tauri::command]
pub async fn write_medical_attachment_to_path(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    target_path: String,
) -> Result<(), String> {
    FileStorageService::write_attachment_to_path(&app_handle, &pool, attachment_id, target_path).await
}

// Open attachment with default app (materialize to temp first)
#[tauri::command]
pub async fn open_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<(), String> {
    let path = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;
    FileStorageService::open_path_with_default_app(&path)
}

// Print a PDF attachment using the system's native print functionality
#[tauri::command]
pub async fn print_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<(), String> {
    let path = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;
    FileStorageService::print_file(&path)
}

// Render a PDF attachment page to a PNG thumbnail and return the temp file path
#[tauri::command]
pub async fn render_medical_attachment_pdf_thumbnail(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<String, String> {
    render_medical_attachment_pdf_thumbnail_with_options(
        app_handle,
        pool,
        attachment_id,
        page,
        width,
        false, // Don't force regenerate by default
    ).await
}

// Extended version with force regenerate option
#[tauri::command]
pub async fn render_medical_attachment_pdf_thumbnail_force(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<String, String> {
    render_medical_attachment_pdf_thumbnail_with_options(
        app_handle,
        pool,
        attachment_id,
        page,
        width,
        true, // Force regenerate
    ).await
}

async fn render_medical_attachment_pdf_thumbnail_with_options(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    page: Option<u32>,
    width: Option<u32>,
    force_regenerate: bool,
) -> Result<String, String> {
    log::debug!("render_medical_attachment_pdf_thumbnail called - attachment_id={}, page={:?}, width={:?}, force={}",
        attachment_id, page, width, force_regenerate);

    // First materialize the attachment to a temp file to get a local path
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;
    log::debug!("PDF materialized at: {}", pdf_path);

    // Build preview output path in a stable temp dir
    let mut tmp_dir = std::env::temp_dir();
    tmp_dir.push("vet-clinic-attachments");
    tmp_dir.push("previews");
    let page_index = page.unwrap_or(1).saturating_sub(1); // 1-based to 0-based
    let target_width = width.unwrap_or(900);
    let file_name = format!("attachment_{}_p{}_w{}.png", attachment_id, page_index + 1, target_width);
    let out_path = tmp_dir.join(file_name);

    // Check if preview exists and is valid (not 0 bytes) unless force regenerate
    if !force_regenerate && out_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&out_path) {
            if metadata.len() > 0 {
                log::debug!("Using cached preview: {} ({} bytes)", out_path.display(), metadata.len());
                return Ok(out_path.display().to_string());
            } else {
                log::debug!("Cached preview is 0 bytes, regenerating");
                // Delete the broken file
                let _ = std::fs::remove_file(&out_path);
            }
        }
    } else if force_regenerate && out_path.exists() {
        log::debug!("Force regenerating preview, removing old file");
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

    log::debug!("Wrote {} bytes to {:?}", png_bytes.len(), out_path);
    Ok(out_path.display().to_string())
}

// Render a PDF attachment page to PNG bytes (faster & no FS read needed)
#[tauri::command]
pub async fn render_medical_attachment_pdf_page_png(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
    page: Option<u32>,
    width: Option<u32>,
) -> Result<Vec<u8>, String> {
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;
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
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<u16, String> {
    let pdf_path = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;
    let handle_clone = app_handle.clone();
    let res = tauri::async_runtime::spawn_blocking(move || PdfRenderService::get_page_count(&handle_clone, &pdf_path))
        .await
        .map_err(|e| format!("Spawn failed: {}", e))?;
    res
}

// Revert a medical record one step to previous version
#[tauri::command]
pub async fn revert_medical_record(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
) -> Result<MedicalRecord, String> {
    MedicalRecordService::revert_one_step(&pool, record_id).await
}

// Get medical record snapshot at a specific version
#[tauri::command]
pub async fn get_medical_record_at_version(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    version: i32,
) -> Result<MedicalRecord, String> {
    log::debug!("get_medical_record_at_version record_id={}, version={}", record_id, version);
    let res = MedicalRecordService::get_record_at_version(&pool, record_id, version).await;
    match &res {
        Ok(r) => log::debug!("snapshot loaded: id={}, name={}, type={}, version={}", r.id, r.name, r.record_type, r.version),
        Err(e) => log::error!("get_medical_record_at_version failed: {}", e),
    }
    res
}

// T029: Regenerate PDF from device data attachment
#[tauri::command]
pub async fn regenerate_pdf_from_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<MedicalAttachment, String> {
    log::debug!("regenerate_pdf_from_attachment attachment_id={}", attachment_id);

    // 1. Fetch the attachment with device metadata
    let attachment_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, medical_record_id, file_id, original_name, mime_type, \
         file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
         FROM medical_attachments WHERE id = ?",
        [attachment_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch attachment: {}", e))?
    .ok_or("Attachment not found".to_string())?;

    let medical_record_id: i64 = attachment_row.try_get("", "medical_record_id")
        .map_err(|e| format!("Failed to get medical_record_id: {}", e))?;
    let device_type: Option<String> = attachment_row.try_get("", "device_type").ok();
    let device_name: Option<String> = attachment_row.try_get("", "device_name").ok();
    let connection_method: Option<String> = attachment_row.try_get("", "connection_method").ok();
    let original_name: String = attachment_row.try_get("", "original_name")
        .map_err(|e| format!("Failed to get original_name: {}", e))?;

    // 2. Validate that this attachment has device metadata
    let device_type = device_type.ok_or("This attachment does not have device metadata. Cannot regenerate PDF.".to_string())?;
    let device_name = device_name.ok_or("This attachment is missing device name metadata.".to_string())?;
    let connection_method = connection_method.unwrap_or_else(|| "unknown".to_string()); // Default for old attachments without this field

    log::debug!("Regenerating PDF for device_type={}, device_name={}, connection_method={}", device_type, device_name, connection_method);

    // 3. Download the XML file data
    let xml_data = FileStorageService::download_attachment(&app_handle, &pool, attachment_id).await?;

    // 4. Parse the device data
    let device_data = DeviceParserService::parse_device_data(
        &device_type,
        &device_name,
        &xml_data.file_name,
        &xml_data.file_data,
        &connection_method,
    )?;

    log::debug!("Parsed device data, patient_identifier={:?}", device_data.patient_identifier);

    // 5. Get patient info from the medical record
    let record_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT patient_id FROM medical_records WHERE id = ?",
        [medical_record_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch medical record: {}", e))?
    .ok_or("Medical record not found".to_string())?;

    let patient_id: i64 = record_row.try_get("", "patient_id")
        .map_err(|e| format!("Failed to get patient_id: {}", e))?;

    // Fetch patient details (simplified query to avoid schema issues)
    let patient_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, name, species, breed, microchip_id, gender, date_of_birth \
         FROM patients \
         WHERE id = ?",
        [patient_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch patient: {}", e))?
    .ok_or("Patient not found".to_string())?;

    // Try to fetch owner information separately (optional, won't fail if tables don't exist)
    let owner_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT o.name FROM patient_owners po \
         JOIN owners o ON po.owner_id = o.id \
         WHERE po.patient_id = ? AND po.is_primary = 1 \
         LIMIT 1",
        [patient_id.into()]
    ))
    .await
    .ok()
    .flatten();

    let owner_name: String = owner_row
        .and_then(|r| r.try_get::<String>("", "name").ok())
        .unwrap_or_default(); // Empty string - PDF will skip owner row

    let patient_data = PatientData {
        name: patient_row.try_get("", "name").unwrap_or_else(|_| "Непознат Пациент".to_string()),
        owner: owner_name,
        species: patient_row.try_get("", "species").unwrap_or_else(|_| "Непознат Вид".to_string()),
        microchip_id: patient_row.try_get("", "microchip_id").ok(),
        gender: patient_row.try_get("", "gender").unwrap_or_else(|_| "Непознат".to_string()),
        date_of_birth: patient_row.try_get("", "date_of_birth").ok(),
    };

    log::debug!("Patient info: name={}, microchip={:?}", patient_data.name, patient_data.microchip_id);

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

    log::debug!("PDF generated at {:?}", pdf_path);

    // 8. Read the generated PDF
    let pdf_bytes = std::fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    log::debug!("Read {} bytes from PDF", pdf_bytes.len());

    // 9. Upload the PDF as a new attachment to the same medical record
    let pdf_attachment = FileStorageService::upload_attachment(
        &app_handle,
        &pool,
        medical_record_id,
        pdf_filename.clone(),
        pdf_bytes,
        "application/pdf".to_string(),
        Some(format!("{}_report", device_type)),
        Some(format!("{} Report", device_name)),
        Some("regenerated".to_string()),
        Some("generated_pdf".to_string()), // Attachment type for regenerated PDFs
    ).await?;

    log::debug!("PDF attachment uploaded with id={}", pdf_attachment.id);

    // Clean up temp file
    let _ = std::fs::remove_file(&pdf_path);

    Ok(pdf_attachment)
}

// T030: Regenerate PDF from ALL test_result attachments in a medical record
#[tauri::command]
pub async fn regenerate_pdf_from_medical_record(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
) -> Result<MedicalAttachment, String> {
    log::debug!("regenerate_pdf_from_medical_record medical_record_id={}", medical_record_id);

    // 1. Get all device data attachments for this medical record
    // Check for attachment_type = 'test_result' OR files with device metadata that aren't PDFs
    // This handles both new files (with proper attachment_type) and legacy files (with device_type set)
    let attachment_rows = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, medical_record_id, file_id, original_name, mime_type, \
         file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
         FROM medical_attachments \
         WHERE medical_record_id = ? \
         AND device_type IS NOT NULL \
         AND device_name IS NOT NULL \
         AND (attachment_type = 'test_result' \
              OR (attachment_type != 'generated_pdf' AND mime_type != 'application/pdf'))",
        [medical_record_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch device data attachments: {}", e))?;

    if attachment_rows.is_empty() {
        return Err("No device data attachments found for this medical record.".to_string());
    }

    log::debug!("Found {} test_result attachments", attachment_rows.len());

    // 2. Get patient info from the medical record
    let record_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT patient_id FROM medical_records WHERE id = ?",
        [medical_record_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch medical record: {}", e))?
    .ok_or("Medical record not found".to_string())?;

    let patient_id: i64 = record_row.try_get("", "patient_id")
        .map_err(|e| format!("Failed to get patient_id: {}", e))?;

    // 3. Fetch patient details using the same query pattern as MedicalRecordService
    let patient_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT p.name, p.gender, p.date_of_birth, p.microchip_id, \
         s.name as species_name \
         FROM patients p \
         LEFT JOIN species s ON p.species_id = s.id \
         WHERE p.id = ?",
        [patient_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch patient: {}", e))?
    .ok_or("Patient not found".to_string())?;

    // Try to get owner information - prefer primary contact's full name, fall back to household name
    let owner_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
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
            '' \
         ) as owner_name",
        [patient_id.into(), patient_id.into()]
    ))
    .await
    .ok()
    .flatten();

    let owner_name: String = owner_row
        .and_then(|r| r.try_get::<String>("", "owner_name").ok())
        .unwrap_or_default(); // Empty string - PDF will skip owner row

    let patient_data = PatientData {
        name: patient_row.try_get("", "name").unwrap_or_else(|_| "Непознат Пациент".to_string()),
        owner: owner_name,
        species: patient_row.try_get("", "species_name").unwrap_or_else(|_| "Непознат Вид".to_string()),
        microchip_id: patient_row.try_get("", "microchip_id").ok(),
        gender: patient_row.try_get("", "gender").unwrap_or_else(|_| "Непознат".to_string()),
        date_of_birth: patient_row.try_get("", "date_of_birth").ok(),
    };

    log::debug!("Patient info: name={}, microchip={:?}", patient_data.name, patient_data.microchip_id);

    // 4. Parse each attachment and collect device data
    let mut all_device_data: Vec<DeviceTestData> = Vec::new();

    for attachment_row in &attachment_rows {
        let attachment_id: i64 = attachment_row.try_get("", "id")
            .map_err(|e| format!("Failed to get attachment id: {}", e))?;
        let device_type: Option<String> = attachment_row.try_get("", "device_type").ok();
        let device_name: Option<String> = attachment_row.try_get("", "device_name").ok();
        let connection_method: Option<String> = attachment_row.try_get("", "connection_method").ok();
        let original_name: String = attachment_row.try_get("", "original_name")
            .map_err(|e| format!("Failed to get original_name: {}", e))?;

        // Skip if missing device metadata
        let device_type = match device_type {
            Some(dt) => dt,
            None => {
                log::debug!("Skipping attachment {} - no device_type", attachment_id);
                continue;
            }
        };
        let device_name = match device_name {
            Some(dn) => dn,
            None => {
                log::debug!("Skipping attachment {} - no device_name", attachment_id);
                continue;
            }
        };
        let connection_method = connection_method.unwrap_or_else(|| "unknown".to_string());

        log::debug!("Processing attachment {} - device_type={}, device_name={}", attachment_id, device_type, device_name);

        // Download the file data
        let file_data = FileStorageService::download_attachment(&app_handle, &pool, attachment_id).await?;

        // Parse the device data (works for XML, JSON, etc.)
        match DeviceParserService::parse_device_data(
            &device_type,
            &device_name,
            &file_data.file_name,
            &file_data.file_data,
            &connection_method,
        ) {
            Ok(parsed_data) => {
                log::debug!("Parsed device data from {}", original_name);
                all_device_data.push(DeviceTestData {
                    device_type: parsed_data.device_type.clone(),
                    device_name: parsed_data.device_name.clone(),
                    test_results: parsed_data.test_results.clone(),
                    detected_at: parsed_data.detected_at,
                    patient_identifier: patient_data.microchip_id.clone().or_else(|| Some(patient_data.name.clone())),
                });
            }
            Err(e) => {
                log::debug!("Failed to parse attachment {}: {}", attachment_id, e);
                // Continue with other attachments
            }
        }
    }

    if all_device_data.is_empty() {
        return Err("Could not parse any device data from test_result attachments.".to_string());
    }

    log::debug!("Parsed {} device data sets", all_device_data.len());

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
    log::info!("Generating combined PDF report using Java...");
    JavaPdfService::generate_pdf_multi(
        &app_handle,
        pdf_path.to_str().ok_or("Invalid PDF path")?,
        &java_patient_data,
        &java_device_data,
    )?;

    log::debug!("PDF generated at {:?}", pdf_path);

    // 6. Read the generated PDF
    let pdf_bytes = std::fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    log::debug!("Read {} bytes from PDF", pdf_bytes.len());

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
        &pool,
        medical_record_id,
        pdf_filename.clone(),
        pdf_bytes,
        "application/pdf".to_string(),
        Some(format!("{}_report", device_type_str)),
        Some(format!("{} Report (Regenerated)", device_name_str)),
        Some("regenerated".to_string()),
        Some("generated_pdf".to_string()),
    ).await?;

    log::debug!("PDF attachment uploaded with id={}", pdf_attachment.id);

    // Clean up temp file
    let _ = std::fs::remove_file(&pdf_path);

    Ok(pdf_attachment)
}

// T031: Generate PDF from selected test_result attachments with patient overrides
#[tauri::command]
pub async fn generate_configured_report(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
    selected_attachment_ids: Vec<i64>,
    patient_overrides: Option<PatientOverrides>,
) -> Result<MedicalAttachment, String> {
    log::debug!("generate_configured_report medical_record_id={}, selected_attachments={:?}, overrides={:?}",
        medical_record_id, selected_attachment_ids, patient_overrides);

    if selected_attachment_ids.is_empty() {
        return Err("No attachments selected for the report.".to_string());
    }

    // 1. Get patient info from the medical record
    let record_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT patient_id FROM medical_records WHERE id = ?",
        [medical_record_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch medical record: {}", e))?
    .ok_or("Medical record not found".to_string())?;

    let patient_id: i64 = record_row.try_get("", "patient_id")
        .map_err(|e| format!("Failed to get patient_id: {}", e))?;

    // 2. Fetch patient details
    let patient_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT p.name, p.gender, p.date_of_birth, p.microchip_id, \
         s.name as species_name \
         FROM patients p \
         LEFT JOIN species s ON p.species_id = s.id \
         WHERE p.id = ?",
        [patient_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch patient: {}", e))?
    .ok_or("Patient not found".to_string())?;

    // Try to get owner information
    let owner_row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
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
            '' \
         ) as owner_name",
        [patient_id.into(), patient_id.into()]
    ))
    .await
    .ok()
    .flatten();

    let owner_name: String = owner_row
        .and_then(|r| r.try_get::<String>("", "owner_name").ok())
        .unwrap_or_default();

    // 3. Build patient data, applying overrides if provided
    let overrides = patient_overrides.unwrap_or_default();
    let patient_data = PatientData {
        name: overrides.patient_name.unwrap_or_else(||
            patient_row.try_get("", "name").unwrap_or_else(|_| "Unknown Patient".to_string())),
        owner: overrides.owner.unwrap_or(owner_name),
        species: overrides.species.unwrap_or_else(||
            patient_row.try_get("", "species_name").unwrap_or_else(|_| "Unknown Species".to_string())),
        microchip_id: overrides.microchip_id.or_else(|| patient_row.try_get("", "microchip_id").ok()),
        gender: overrides.gender.unwrap_or_else(||
            patient_row.try_get("", "gender").unwrap_or_else(|_| "Unknown".to_string())),
        date_of_birth: overrides.date_of_birth.or_else(|| patient_row.try_get("", "date_of_birth").ok()),
    };

    log::debug!("Patient info (with overrides): name={}, owner={}", patient_data.name, patient_data.owner);

    // 3.5 Ensure we don't accumulate multiple generated PDFs: delete existing generated_pdf attachments for this record
    if let Ok(rows) = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM medical_attachments WHERE medical_record_id = ? AND attachment_type = 'generated_pdf'",
        [medical_record_id.into()]
    )).await {
        for row in rows {
            if let Ok(att_id) = row.try_get::<i64>("", "id") {
                let _ = FileStorageService::delete_attachment(&app_handle, &pool, att_id).await;
            }
        }
    }

    // 4. Fetch and parse selected attachments
    let mut all_device_data: Vec<DeviceTestData> = Vec::new();

    for attachment_id in &selected_attachment_ids {
        let attachment_row = pool.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, original_name, device_type, device_name, connection_method \
             FROM medical_attachments WHERE id = ?",
            [(*attachment_id).into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch attachment {}: {}", attachment_id, e))?
        .ok_or(format!("Attachment {} not found", attachment_id))?;

        let device_type: Option<String> = attachment_row.try_get("", "device_type").ok();
        let device_name: Option<String> = attachment_row.try_get("", "device_name").ok();
        let connection_method: Option<String> = attachment_row.try_get("", "connection_method").ok();
        let original_name: String = attachment_row.try_get("", "original_name")
            .map_err(|e| format!("Failed to get original_name: {}", e))?;

        let device_type = match device_type {
            Some(dt) => dt,
            None => {
                log::debug!("Skipping attachment {} - no device_type", attachment_id);
                continue;
            }
        };
        let device_name = match device_name {
            Some(dn) => dn,
            None => {
                log::debug!("Skipping attachment {} - no device_name", attachment_id);
                continue;
            }
        };
        let connection_method = connection_method.unwrap_or_else(|| "unknown".to_string());

        log::debug!("Processing attachment {} - device_type={}, device_name={}", attachment_id, device_type, device_name);

        // Download the file data
        let file_data = FileStorageService::download_attachment(&app_handle, &pool, *attachment_id).await?;

        // Parse the device data
        match DeviceParserService::parse_device_data(
            &device_type,
            &device_name,
            &file_data.file_name,
            &file_data.file_data,
            &connection_method,
        ) {
            Ok(parsed_data) => {
                log::debug!("Parsed device data from {}", original_name);
                all_device_data.push(DeviceTestData {
                    device_type: parsed_data.device_type.clone(),
                    device_name: parsed_data.device_name.clone(),
                    test_results: parsed_data.test_results.clone(),
                    detected_at: parsed_data.detected_at,
                    patient_identifier: patient_data.microchip_id.clone().or_else(|| Some(patient_data.name.clone())),
                });
            }
            Err(e) => {
                log::debug!("Failed to parse attachment {}: {}", attachment_id, e);
                // Continue with other attachments
            }
        }
    }

    if all_device_data.is_empty() {
        return Err("Could not parse any device data from selected attachments.".to_string());
    }

    log::debug!("Parsed {} device data sets", all_device_data.len());

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

    // Generate PDF with all devices
    log::info!("Generating configured PDF report using Java...");
    JavaPdfService::generate_pdf_multi(
        &app_handle,
        pdf_path.to_str().ok_or("Invalid PDF path")?,
        &patient_data,
        &all_device_data,
    )?;

    log::debug!("PDF generated at {:?}", pdf_path);

    // 6. Read the generated PDF
    let pdf_bytes = std::fs::read(&pdf_path)
        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

    log::debug!("Read {} bytes from PDF", pdf_bytes.len());

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
        &pool,
        medical_record_id,
        pdf_filename.clone(),
        pdf_bytes,
        "application/pdf".to_string(),
        Some(format!("{}_report", device_type_str)),
        Some(format!("{} Report (Configured)", device_name_str)),
        Some("configured".to_string()),
        Some("generated_pdf".to_string()),
    ).await?;

    log::debug!("PDF attachment uploaded with id={}", pdf_attachment.id);

    // Clean up temp file
    let _ = std::fs::remove_file(&pdf_path);

    Ok(pdf_attachment)
}

// ============================================================================
// Record Template Commands
// ============================================================================

// Helper function to map SeaORM row to RecordTemplate
fn row_to_record_template(row: &sea_orm::QueryResult) -> Result<RecordTemplate, String> {
    Ok(RecordTemplate {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        record_type: row.try_get("", "record_type").map_err(|e| format!("Failed to get record_type: {}", e))?,
        title: row.try_get("", "title").map_err(|e| format!("Failed to get title: {}", e))?,
        description: row.try_get("", "description").map_err(|e| format!("Failed to get description: {}", e))?,
        price: row.try_get("", "price").ok(),
        currency_id: row.try_get("", "currency_id").ok(),
        created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
        updated_at: row.try_get("", "updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
    })
}

#[tauri::command]
pub async fn get_record_templates(
    pool: State<'_, SeaOrmPool>,
    record_type: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    let rows = if let Some(ref rt) = record_type {
        pool.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM record_templates WHERE record_type = ? ORDER BY title ASC",
            [rt.clone().into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch record templates: {}", e))?
    } else {
        pool.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM record_templates ORDER BY record_type, title ASC",
            []
        ))
        .await
        .map_err(|e| format!("Failed to fetch record templates: {}", e))?
    };

    let templates: Result<Vec<_>, _> = rows.iter().map(row_to_record_template).collect();
    templates
}

#[tauri::command]
pub async fn search_record_templates(
    pool: State<'_, SeaOrmPool>,
    search_term: String,
    record_type: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    let search_pattern = format!("%{}%", search_term);

    let rows = if let Some(ref rt) = record_type {
        pool.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM record_templates WHERE record_type = ? AND (title LIKE ? OR description LIKE ?) ORDER BY title ASC",
            [rt.clone().into(), search_pattern.clone().into(), search_pattern.clone().into()]
        ))
        .await
        .map_err(|e| format!("Failed to search record templates: {}", e))?
    } else {
        pool.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM record_templates WHERE title LIKE ? OR description LIKE ? ORDER BY record_type, title ASC",
            [search_pattern.clone().into(), search_pattern.clone().into()]
        ))
        .await
        .map_err(|e| format!("Failed to search record templates: {}", e))?
    };

    let templates: Result<Vec<_>, _> = rows.iter().map(row_to_record_template).collect();
    templates
}

#[tauri::command]
pub async fn create_record_template(
    pool: State<'_, SeaOrmPool>,
    input: CreateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    // Validate record type
    if input.record_type != "procedure" && input.record_type != "note" && input.record_type != "test_result" {
        return Err(format!("Invalid record type: {}. Must be 'procedure', 'note', or 'test_result'", input.record_type));
    }

    use sea_orm::Value;
    let result = pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO record_templates (record_type, title, description, price, currency_id) VALUES (?, ?, ?, ?, ?)",
        [
            input.record_type.clone().into(),
            input.title.clone().into(),
            input.description.clone().into(),
            input.price.map(|p| Value::Double(Some(p))).unwrap_or(Value::Double(None)),
            input.currency_id.map(|c| Value::BigInt(Some(c))).unwrap_or(Value::BigInt(None)),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to create record template: {}", e))?;

    let template_id = result.last_insert_id() as i64;

    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM record_templates WHERE id = ?",
        [template_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch created template: {}", e))?
    .ok_or("Template not found".to_string())?;

    row_to_record_template(&row)
}

#[tauri::command]
pub async fn update_record_template(
    pool: State<'_, SeaOrmPool>,
    template_id: i64,
    input: UpdateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    use sea_orm::Value;

    // Build dynamic UPDATE query for efficiency
    let mut set_clauses = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(ref title) = input.title {
        set_clauses.push("title = ?");
        params.push(title.clone().into());
    }
    if let Some(ref description) = input.description {
        set_clauses.push("description = ?");
        params.push(description.clone().into());
    }
    if let Some(price) = input.price {
        set_clauses.push("price = ?");
        params.push(Value::Double(Some(price)));
    }
    if let Some(currency_id) = input.currency_id {
        set_clauses.push("currency_id = ?");
        params.push(Value::BigInt(Some(currency_id)));
    }

    if !set_clauses.is_empty() {
        let mut query_str = "UPDATE record_templates SET ".to_string();
        query_str.push_str(&set_clauses.join(", "));
        query_str.push_str(" WHERE id = ?");
        params.push(template_id.into());

        pool.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &query_str, params))
            .await
            .map_err(|e| format!("Failed to update template: {}", e))?;
    }

    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM record_templates WHERE id = ?",
        [template_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch updated template: {}", e))?
    .ok_or("Template not found".to_string())?;

    row_to_record_template(&row)
}

#[tauri::command]
pub async fn delete_record_template(
    pool: State<'_, SeaOrmPool>,
    template_id: i64,
) -> Result<(), String> {
    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM record_templates WHERE id = ?",
        [template_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to delete template: {}", e))?;

    Ok(())
}
