use tauri::{AppHandle, State};
use crate::database::SeaOrmPool;
use crate::models::medical::*;
use crate::services::medical_record::{MedicalRecordService, PdfEnv, PdfStatus, SavedMedicalRecord};
use crate::services::file_storage::FileStorageService;
use crate::services::record_template::RecordTemplateService;
use crate::services::pdf_render::PdfRenderService;
use crate::services::device_parser::DeviceParserService;
use crate::services::device_pdf_service::{PatientData, DeviceTestData};
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
) -> Result<SavedMedicalRecord, String> {
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
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    updates: UpdateMedicalRecordInput,
) -> Result<SavedMedicalRecord, String> {
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

    MedicalRecordService::update_medical_record(&app_handle, &pool, record_id, updates).await
}

/// Make one of a record's documents again (`report`, `pharmacy_note` or
/// `invoice`), replacing the old one once the new one is stored.
#[tauri::command]
pub async fn regenerate_record_document(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
    kind: String,
) -> Result<PdfStatus, String> {
    let env = PdfEnv::from_app(&app_handle)?;
    Ok(MedicalRecordService::regenerate_document(&env, &pool, record_id, &kind).await)
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
        if let Err(e) = update_file_attachment_internal_seaorm(&pool, file_id.clone(), medical_record_id).await {
            log::warn!("Failed to update file attachment tracking: {}", e);
            // Don't fail the upload, just log the warning
        }

        if let Err(e) = crate::services::lab_inbox::mark_attached(&pool, &file_id, medical_record_id, Some(attachment.id)).await {
            log::warn!("Failed to mark lab result {} attached: {}", file_id, e);
        }
    }

    if attachment.device_type.is_some() {
        let indexed = match FileStorageService::get_storage_dir(&app_handle) {
            Ok(dir) => crate::services::lab_results::index_attachment(&pool, &dir, attachment.id).await,
            Err(e) => Err(e),
        };
        if let Err(e) = indexed {
            log::warn!("Lab values of attachment {} not stored: {}", attachment.id, e);
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

// T038: Implement delete_medical_attachment command (soft delete — the row and
// the blob on disk are kept; the attachment just stops appearing on the record).
// Deleting a lab result rebuilds or retires the record's lab report; the
// status says how that went (null when there was nothing to rebuild).
#[tauri::command]
pub async fn delete_medical_attachment(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    attachment_id: i64,
) -> Result<Option<PdfStatus>, String> {
    let env = PdfEnv::from_app(&app_handle);
    crate::services::lab_inbox::delete_and_refresh_lab_report(env.as_ref().map_err(|e| e.clone()), &pool, attachment_id).await
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

    // The preview is cached per stored file: a cached image needs no copy of the PDF.
    let file_id = FileStorageService::attachment_file_id(&pool, attachment_id).await?;
    let page_index = page.unwrap_or(1).saturating_sub(1); // 1-based to 0-based
    let target_width = width.unwrap_or(900);
    let out_path = FileStorageService::preview_png_path(&file_id, page_index + 1, target_width);

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

    let pdf_path_clone = FileStorageService::materialize_attachment(&app_handle, &pool, attachment_id).await?;

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

// T030: Regenerate the lab report from ALL lab results on a record; the
// record's earlier lab reports are retired once the new one is stored.
#[tauri::command]
pub async fn regenerate_pdf_from_medical_record(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
) -> Result<MedicalAttachment, String> {
    let env = crate::services::medical_record::PdfEnv::from_app(&app_handle)?;
    let pdf_id = crate::services::lab_inbox::regenerate_lab_report(&env, &pool, medical_record_id).await?;
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, medical_record_id, file_id, original_name, mime_type, file_size, uploaded_at, \
         device_type, device_name, connection_method, attachment_type \
         FROM medical_attachments WHERE id = ?",
        [pdf_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to read the new lab report: {}", e))?
    .ok_or("The new lab report was not stored".to_string())?;
    Ok(MedicalAttachment {
        id: pdf_id,
        medical_record_id,
        file_id: row.try_get("", "file_id").map_err(|e| e.to_string())?,
        original_name: row.try_get("", "original_name").map_err(|e| e.to_string())?,
        mime_type: row.try_get("", "mime_type").ok(),
        file_size: row.try_get("", "file_size").ok(),
        uploaded_at: row
            .try_get::<String>("", "uploaded_at")
            .ok()
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
            .map(|t| t.with_timezone(&chrono::Utc))
            .unwrap_or_else(chrono::Utc::now),
        device_type: row.try_get("", "device_type").ok(),
        device_name: row.try_get("", "device_name").ok(),
        connection_method: row.try_get("", "connection_method").ok(),
        attachment_type: row.try_get("", "attachment_type").ok(),
    })
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

    let owner_name = lookup_owner_name(&pool, patient_id).await?;

    // 3. Build patient data, applying overrides if provided
    let overrides = patient_overrides.unwrap_or_default();
    let patient_data = PatientData {
        name: overrides.patient_name.unwrap_or_else(||
            patient_row.try_get("", "name").unwrap_or_else(|_| crate::services::medical_record::UNKNOWN_PATIENT.to_string())),
        owner: overrides.owner.unwrap_or(owner_name),
        species: overrides.species.unwrap_or_else(||
            patient_row.try_get("", "species_name").unwrap_or_else(|_| crate::services::medical_record::UNKNOWN_SPECIES.to_string())),
        microchip_id: overrides.microchip_id.or_else(|| patient_row.try_get("", "microchip_id").ok()),
        gender: overrides.gender.unwrap_or_else(||
            patient_row.try_get("", "gender").unwrap_or_else(|_| crate::services::medical_record::UNKNOWN_GENDER.to_string())),
        date_of_birth: overrides.date_of_birth.or_else(|| patient_row.try_get("", "date_of_birth").ok()),
    };


    // 4. Fetch and parse selected attachments
    let record_time = MedicalRecordService::record_time(&pool, medical_record_id).await?;
    let mut all_device_data: Vec<DeviceTestData> = Vec::new();

    for attachment_id in &selected_attachment_ids {
        let attachment_row = pool.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, original_name, device_type, device_name, connection_method \
             FROM medical_attachments WHERE id = ? AND deleted_at IS NULL",
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
                    detected_at: record_time,
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

    // Same names as the record's own lab report:
    //   "Device Report - <Patient> - <Device> - <YYYY-MM-DD HH-MM>.pdf"
    // (single device), or just patient+date for the combined case.
    let timestamp = MedicalRecordService::pdf_timestamp();
    let patient_part = MedicalRecordService::sanitize_filename_part(&patient_data.name);
    let pdf_filename = if all_device_data.len() == 1 {
        let device_part = MedicalRecordService::sanitize_filename_part(&all_device_data[0].device_name);
        format!("Device Report - {} - {} - {}.pdf", patient_part, device_part, timestamp)
    } else {
        format!("Device Report - {} - {}.pdf", patient_part, timestamp)
    };

    let (_job_folder, pdf_path) = MedicalRecordService::job_output(&pdf_filename)?;

    // Generate PDF with all devices
    log::info!("Generating configured PDF report using Java...");
    let (handle, out, patient, devices) =
        (app_handle.clone(), pdf_path.clone(), patient_data.clone(), all_device_data.clone());
    tauri::async_runtime::spawn_blocking(move || {
        JavaPdfService::generate_pdf_multi(&handle, out.to_str().ok_or("Invalid PDF path")?, &patient, &devices)
    })
    .await
    .map_err(|e| format!("The PDF job stopped: {}", e))??;

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

    // Only now that the new PDF is stored: one generated PDF per record.
    retire_generated_pdfs(&pool, medical_record_id, pdf_attachment.id).await;

    Ok(pdf_attachment)
}

/// Soft-deletes the record's generated PDFs other than `keep_id`.
pub(crate) async fn retire_generated_pdfs(db: &sea_orm::DatabaseConnection, medical_record_id: i64, keep_id: i64) {
    match db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM medical_attachments WHERE medical_record_id = ? AND attachment_type = 'generated_pdf' \
         AND deleted_at IS NULL AND id != ?",
        [medical_record_id.into(), keep_id.into()]
    )).await {
        Ok(rows) => {
            for row in rows {
                if let Ok(att_id) = row.try_get::<i64>("", "id") {
                    if let Err(e) = FileStorageService::delete_attachment(db, att_id).await {
                        log::warn!("Could not retire old generated PDF {}: {}", att_id, e);
                    }
                }
            }
        }
        Err(e) => log::warn!("Could not list old generated PDFs for record {}: {}", medical_record_id, e),
    }
}

// ============================================================================
// Record Template Commands
// ============================================================================

#[tauri::command]
pub async fn get_record_templates(
    pool: State<'_, SeaOrmPool>,
    record_type: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    RecordTemplateService::list(&pool, record_type.as_deref()).await
}

#[tauri::command]
pub async fn search_record_templates(
    pool: State<'_, SeaOrmPool>,
    search_term: String,
    record_type: Option<String>,
) -> Result<Vec<RecordTemplate>, String> {
    RecordTemplateService::search(&pool, &search_term, record_type.as_deref()).await
}

#[tauri::command]
pub async fn create_record_template(
    pool: State<'_, SeaOrmPool>,
    input: CreateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    RecordTemplateService::create(&pool, input).await
}

#[tauri::command]
pub async fn update_record_template(
    pool: State<'_, SeaOrmPool>,
    template_id: i64,
    input: UpdateRecordTemplateInput,
) -> Result<RecordTemplate, String> {
    RecordTemplateService::update(&pool, template_id, input).await
}

#[tauri::command]
pub async fn delete_record_template(
    pool: State<'_, SeaOrmPool>,
    template_id: i64,
) -> Result<(), String> {
    RecordTemplateService::delete(&pool, template_id).await
}

/// "Copy from last record": the patient's latest consult, or null.
#[tauri::command]
pub async fn get_last_record_for_copy(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
) -> Result<Option<LastRecordCopy>, String> {
    RecordTemplateService::last_record_copy(&pool, patient_id).await
}

/// The name printed as "owner" on PDFs for a patient: the household's primary
/// person, else the household name, else any person; "" when the patient has
/// no household.
pub(crate) async fn lookup_owner_name(db: &sea_orm::DatabaseConnection, patient_id: i64) -> Result<String, String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COALESCE( \
                (SELECT p.first_name || ' ' || p.last_name FROM people p \
                 WHERE p.household_id = h.id AND p.is_primary = 1 \
                 ORDER BY p.id LIMIT 1), \
                NULLIF(TRIM(h.household_name), ''), \
                (SELECT p.first_name || ' ' || p.last_name FROM people p \
                 WHERE p.household_id = h.id \
                 ORDER BY p.id LIMIT 1), \
                '' \
             ) AS owner_name \
             FROM patient_households ph \
             JOIN households h ON h.id = ph.household_id \
             WHERE ph.patient_id = ? \
             ORDER BY ph.is_primary DESC, ph.id \
             LIMIT 1",
            [patient_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to look up owner: {}", e))?;
    Ok(row
        .and_then(|r| r.try_get::<String>("", "owner_name").ok())
        .unwrap_or_default())
}
