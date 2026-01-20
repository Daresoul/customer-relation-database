use sea_orm::*;
use crate::models::medical::*;
use crate::models::dto::MaybeNull;
use chrono::{Utc, DateTime};
use serde_json::json;

// T027: MedicalRecordService with CRUD operations
pub struct MedicalRecordService;

impl MedicalRecordService {
    pub async fn get_medical_records(
        db: &DatabaseConnection,
        patient_id: i64,
        filter: Option<MedicalRecordFilter>,
        pagination: Option<PaginationParams>,
    ) -> Result<MedicalRecordsResponse, String> {
        let page = pagination.as_ref().and_then(|p| p.page).unwrap_or(1);
        let page_size = pagination.as_ref().and_then(|p| p.page_size).unwrap_or(50);
        let offset = ((page - 1) * page_size) as i64;

        // Build the query based on filters
        let mut sql = String::from(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records WHERE patient_id = ?"
        );
        let mut params: Vec<Value> = vec![patient_id.into()];

        if let Some(ref f) = filter {
            if let Some(ref record_type) = f.record_type {
                sql.push_str(" AND record_type = ?");
                params.push(record_type.clone().into());
            }
            if let Some(is_archived) = f.is_archived {
                sql.push_str(" AND is_archived = ?");
                params.push((if is_archived { 1i32 } else { 0i32 }).into());
            }
            if let Some(ref search_term) = f.search_term {
                sql.push_str(" AND (name LIKE ? OR description LIKE ?)");
                let pattern = format!("%{}%", search_term);
                params.push(pattern.clone().into());
                params.push(pattern.into());
            }
        } else {
            // Default to not showing archived records
            sql.push_str(" AND is_archived = 0");
        }

        sql.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        params.push(page_size.into());
        params.push(offset.into());

        log::debug!("Executing safe parameterized query for patient_id: {}", patient_id);

        let rows = db
            .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| {
                log::error!("SQL Error: {}", e);
                format!("Failed to fetch medical records: {}", e)
            })?;

        log::debug!("Got {} rows from database", rows.len());

        let mut records = Vec::new();
        for row in rows {
            log::trace!("Processing row...");
            let record_id: i64 = row.try_get("", "id").map_err(|e| e.to_string())?;
            let is_archived_int: i64 = row.try_get("", "is_archived").unwrap_or(0);
            let created_at_str: Option<String> = row.try_get("", "created_at").ok();
            let updated_at_str: Option<String> = row.try_get("", "updated_at").ok();

            let created_at = created_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            let updated_at = updated_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            // Handle price as either integer or float
            let price: Option<f64> = row.try_get::<i64>("", "price")
                .ok()
                .map(|i| i as f64)
                .or_else(|| row.try_get::<f64>("", "price").ok());

            // Fetch attachments for this record
            let attachments = Self::fetch_attachments(db, record_id).await.unwrap_or_default();

            records.push(MedicalRecord {
                id: record_id,
                patient_id: row.try_get("", "patient_id").unwrap_or(0),
                record_type: row.try_get("", "record_type").unwrap_or_default(),
                name: row.try_get("", "name").unwrap_or_default(),
                procedure_name: row.try_get("", "procedure_name").ok(),
                description: row.try_get("", "description").unwrap_or_default(),
                price,
                currency_id: row.try_get("", "currency_id").ok(),
                is_archived: is_archived_int != 0,
                version: row.try_get("", "version").unwrap_or(1),
                created_at,
                updated_at,
                created_by: row.try_get("", "created_by").ok(),
                updated_by: row.try_get("", "updated_by").ok(),
                attachments: if attachments.is_empty() { None } else { Some(attachments) },
            });
        }

        log::debug!("Found {} records", records.len());

        // Get total count
        let mut count_sql = String::from("SELECT COUNT(*) as cnt FROM medical_records WHERE patient_id = ?");
        let mut count_params: Vec<Value> = vec![patient_id.into()];

        if let Some(ref f) = filter {
            if let Some(ref record_type) = f.record_type {
                count_sql.push_str(" AND record_type = ?");
                count_params.push(record_type.clone().into());
            }
            if let Some(is_archived) = f.is_archived {
                count_sql.push_str(" AND is_archived = ?");
                count_params.push((if is_archived { 1i32 } else { 0i32 }).into());
            }
            if let Some(ref search_term) = f.search_term {
                count_sql.push_str(" AND (name LIKE ? OR description LIKE ?)");
                let pattern = format!("%{}%", search_term);
                count_params.push(pattern.clone().into());
                count_params.push(pattern.into());
            }
        } else {
            count_sql.push_str(" AND is_archived = 0");
        }

        let total: i64 = db
            .query_one(Statement::from_sql_and_values(DbBackend::Sqlite, &count_sql, count_params))
            .await
            .map_err(|e| format!("Failed to count medical records: {}", e))?
            .map(|r| r.try_get::<i64>("", "cnt").unwrap_or(0))
            .unwrap_or(0);

        Ok(MedicalRecordsResponse {
            records,
            total,
            page,
            page_size,
        })
    }

    /// Helper to fetch attachments for a medical record
    async fn fetch_attachments(db: &DatabaseConnection, record_id: i64) -> Result<Vec<MedicalAttachment>, String> {
        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, medical_record_id, file_id, original_name, mime_type, \
                 file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
                 FROM medical_attachments WHERE medical_record_id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch attachments: {}", e))?;

        let attachments: Vec<MedicalAttachment> = rows
            .iter()
            .filter_map(|row| {
                let uploaded_at_str: Option<String> = row.try_get("", "uploaded_at").ok();
                let uploaded_at = uploaded_at_str
                    .as_deref()
                    .map(Self::parse_datetime)
                    .unwrap_or_else(Utc::now);

                Some(MedicalAttachment {
                    id: row.try_get("", "id").ok()?,
                    medical_record_id: row.try_get("", "medical_record_id").ok()?,
                    file_id: row.try_get("", "file_id").ok()?,
                    original_name: row.try_get("", "original_name").ok()?,
                    file_size: row.try_get("", "file_size").ok(),
                    mime_type: row.try_get("", "mime_type").ok(),
                    uploaded_at,
                    device_type: row.try_get("", "device_type").ok(),
                    device_name: row.try_get("", "device_name").ok(),
                    connection_method: row.try_get("", "connection_method").ok(),
                    attachment_type: row.try_get("", "attachment_type").ok(),
                })
            })
            .collect();

        Ok(attachments)
    }

    /// Helper to parse datetime strings
    fn parse_datetime(s: &str) -> DateTime<Utc> {
        // Try RFC3339 first
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return dt.with_timezone(&Utc);
        }
        // Try common SQLite CURRENT_TIMESTAMP format
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
            return DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
        }
        // Fallback to now
        Utc::now()
    }

    pub async fn get_medical_record(
        db: &DatabaseConnection,
        record_id: i64,
        include_history: bool,
    ) -> Result<MedicalRecordDetail, String> {
        // Get the record
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, record_type, name, procedure_name, description, \
                 price, currency_id, is_archived, version, created_at, updated_at, \
                 created_by, updated_by \
                 FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch medical record: {}", e))?
            .ok_or("Medical record not found".to_string())?;

        let is_archived_int: i64 = row.try_get("", "is_archived").unwrap_or(0);
        let created_at_str: Option<String> = row.try_get("", "created_at").ok();
        let updated_at_str: Option<String> = row.try_get("", "updated_at").ok();

        let created_at = created_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        let updated_at = updated_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        // Handle price as either integer or float
        let price: Option<f64> = row.try_get::<i64>("", "price")
            .ok()
            .map(|i| i as f64)
            .or_else(|| row.try_get::<f64>("", "price").ok());

        let record = MedicalRecord {
            id: row.try_get("", "id").unwrap_or(0),
            patient_id: row.try_get("", "patient_id").unwrap_or(0),
            record_type: row.try_get("", "record_type").unwrap_or_default(),
            name: row.try_get("", "name").unwrap_or_default(),
            procedure_name: row.try_get("", "procedure_name").ok(),
            description: row.try_get("", "description").unwrap_or_default(),
            price,
            currency_id: row.try_get("", "currency_id").ok(),
            is_archived: is_archived_int != 0,
            version: row.try_get("", "version").unwrap_or(1),
            created_at,
            updated_at,
            created_by: row.try_get("", "created_by").ok(),
            updated_by: row.try_get("", "updated_by").ok(),
            attachments: None,
        };

        // Get attachments using helper
        let attachments = Self::fetch_attachments(db, record_id).await.unwrap_or_default();

        // Get history if requested
        let history = if include_history {
            Self::fetch_history(db, record_id).await?
        } else {
            Vec::new()
        };

        Ok(MedicalRecordDetail {
            record,
            attachments,
            history: if include_history { Some(history) } else { None },
        })
    }

    /// Helper to fetch history for a medical record
    async fn fetch_history(db: &DatabaseConnection, record_id: i64) -> Result<Vec<MedicalRecordHistory>, String> {
        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, medical_record_id, version, changed_fields, old_values, \
                 new_values, changed_by, changed_at \
                 FROM medical_record_history \
                 WHERE medical_record_id = ? \
                 ORDER BY changed_at DESC",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch history: {}", e))?;

        let history: Vec<MedicalRecordHistory> = rows
            .iter()
            .filter_map(|row| {
                let changed_at_str: Option<String> = row.try_get("", "changed_at").ok();
                let changed_at = changed_at_str
                    .as_deref()
                    .map(Self::parse_datetime)
                    .unwrap_or_else(Utc::now);

                Some(MedicalRecordHistory {
                    id: row.try_get("", "id").ok()?,
                    medical_record_id: row.try_get("", "medical_record_id").ok()?,
                    version: row.try_get("", "version").ok()?,
                    changed_fields: row.try_get("", "changed_fields").ok()?,
                    old_values: row.try_get("", "old_values").ok(),
                    new_values: row.try_get("", "new_values").ok()?,
                    changed_by: row.try_get("", "changed_by").ok(),
                    changed_at,
                })
            })
            .collect();

        Ok(history)
    }

    pub async fn create_medical_record(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        input: CreateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        log::debug!("Creating medical record with input: device_test_data={:?}, device_type={:?}, device_name={:?}",
            input.device_test_data.is_some(), input.device_type, input.device_name);

        let now = Utc::now();

        // Development: do not populate procedure_name; use name as the single source of truth
        let procedure_name: Option<String> = None;

        let result = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO medical_records \
                 (patient_id, record_type, name, procedure_name, description, \
                  price, currency_id, is_archived, version, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)",
                [
                    input.patient_id.into(),
                    input.record_type.clone().into(),
                    input.name.clone().into(),
                    procedure_name.clone().into(),
                    input.description.clone().into(),
                    input.price.into(),
                    input.currency_id.into(),
                    now.to_rfc3339().into(),
                    now.to_rfc3339().into(),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to create medical record: {}", e))?;

        let id = result.last_insert_id() as i64;

        let record = MedicalRecord {
            id,
            patient_id: input.patient_id,
            record_type: input.record_type,
            name: input.name,
            procedure_name,
            description: input.description,
            price: input.price,
            currency_id: input.currency_id,
            is_archived: false,
            version: 1,
            created_at: now,
            updated_at: now,
            created_by: None,
            updated_by: None,
            attachments: None,
        };

        // Insert initial snapshot into history (version 1)
        let new_snapshot = serde_json::json!({
            "record_type": record.record_type,
            "name": record.name,
            "procedure_name": record.procedure_name,
            "description": record.description,
            "price": record.price,
            "currency_id": record.currency_id,
            "is_archived": record.is_archived
        });

        let _ = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO medical_record_history (medical_record_id, version, changed_fields, old_values, new_values, changed_by) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    id.into(),
                    1i32.into(),
                    "created".into(),
                    Value::String(None),
                    new_snapshot.to_string().into(),
                    Value::String(None),
                ],
            ))
            .await;

        log::debug!("History snapshot insert (create): rec_id={}, version=1, fields=created, new={}", id, new_snapshot);

        // Generate PDFs if device test data is present
        log::debug!("[PDF] Checking for device data: device_test_data (legacy)={}, device_data_list={}",
            input.device_test_data.is_some(), input.device_data_list.is_some());

        // Collect all device data (either from device_data_list or legacy single device)
        let mut all_device_data: Vec<crate::services::device_pdf_service::DeviceTestData> = Vec::new();

        // Add devices from device_data_list (new multi-device format)
        if let Some(ref device_list) = input.device_data_list {
            log::debug!("[PDF] Found {} devices in device_data_list", device_list.len());
            for device in device_list {
                all_device_data.push(crate::services::device_pdf_service::DeviceTestData {
                    device_type: device.device_type.clone(),
                    device_name: device.device_name.clone(),
                    test_results: device.device_test_data.clone(),
                    detected_at: now,
                    patient_identifier: None, // Will be filled below
                });
            }
        }

        // Add legacy single device if present
        if input.device_test_data.is_some() && input.device_type.is_some() && input.device_name.is_some() {
            log::debug!("[PDF] Found legacy single device data");
            all_device_data.push(crate::services::device_pdf_service::DeviceTestData {
                device_type: input.device_type.unwrap(),
                device_name: input.device_name.unwrap(),
                test_results: input.device_test_data.unwrap(),
                detected_at: now,
                patient_identifier: None,
            });
        }

        // Generate PDF if we have any device data
        if !all_device_data.is_empty() {
            log::debug!("[PDF] Generating PDF with {} device samples...", all_device_data.len());

            // Get patient data for PDF generation
            let patient_data = match Self::get_patient_for_pdf(db, input.patient_id).await {
                Ok(p) => p,
                Err(e) => {
                    log::warn!("Failed to get patient data for PDF: {}", e);
                    return Ok(record); // Return the record anyway, just skip PDF generation
                }
            };

            // Fill in patient identifier for all devices
            let patient_identifier = Some(patient_data.microchip_id.clone().unwrap_or_else(|| patient_data.name.clone()));
            for device in all_device_data.iter_mut() {
                device.patient_identifier = patient_identifier.clone();
            }

            // Generate PDF with all devices
            if let Err(e) = Self::generate_and_save_pdfs_multi(app_handle, db, id, &patient_data, &all_device_data).await {
                log::warn!("Failed to generate PDFs: {}", e);
                // Continue anyway - the record was created successfully
            }
        }

        Ok(record)
    }

    /// Helper to get patient data for PDF generation
    async fn get_patient_for_pdf(
        db: &DatabaseConnection,
        patient_id: i64,
    ) -> Result<crate::services::device_pdf_service::PatientData, String> {
        // Simple query - just get patient and species data
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT p.name, p.gender, p.date_of_birth, p.microchip_id, \
                 s.name as species_name \
                 FROM patients p \
                 LEFT JOIN species s ON p.species_id = s.id \
                 WHERE p.id = ?",
                [patient_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?
            .ok_or("Patient not found".to_string())?;

        let birthdate: Option<String> = row.try_get("", "date_of_birth").ok();

        // Try to get owner information - prefer primary contact's full name, fall back to household name
        log::debug!("Looking up owner for patient_id: {}", patient_id);

        let owner_result = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT COALESCE( \
                    (SELECT p.first_name || ' ' || p.last_name \
                     FROM people p \
                     WHERE p.household_id = h.id AND p.is_primary = 1 \
                     LIMIT 1), \
                    h.household_name \
                 ) as owner_name \
                 FROM households h \
                 JOIN patient_households ph ON h.id = ph.household_id \
                 WHERE ph.patient_id = ? \
                 LIMIT 1",
                [patient_id.into()],
            ))
            .await;

        let owner = match owner_result {
            Ok(Some(r)) => {
                let name: String = r.try_get("", "owner_name").unwrap_or_default();
                log::debug!("Found owner: {}", name);
                name
            }
            Ok(None) => {
                log::debug!("No household link found for patient");
                String::new() // Empty string - PDF will skip owner row
            }
            Err(e) => {
                log::warn!("Owner query failed: {}", e);
                String::new() // Empty string - PDF will skip owner row
            }
        };

        Ok(crate::services::device_pdf_service::PatientData {
            name: row.try_get("", "name").unwrap_or_default(),
            owner,
            species: row.try_get::<String>("", "species_name").ok().unwrap_or_else(|| "Unknown Species".to_string()),
            microchip_id: row.try_get("", "microchip_id").ok(),
            gender: row.try_get::<String>("", "gender").ok().unwrap_or_else(|| "Unknown".to_string()),
            date_of_birth: birthdate,
        })
    }

    /// Generate Java PDF report with multiple device samples and save as attachment
    async fn generate_and_save_pdfs_multi(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        medical_record_id: i64,
        patient_data: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> Result<(), String> {
        use crate::services::java_pdf_service::JavaPdfService;

        if device_data_list.is_empty() {
            return Ok(());
        }

        // Create reports directory
        let reports_dir = std::env::temp_dir().join("device_reports");
        std::fs::create_dir_all(&reports_dir)
            .map_err(|e| format!("Failed to create reports directory: {}", e))?;

        // Generate unique filename based on first device or combined name
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let pdf_filename = if device_data_list.len() == 1 {
            let device = &device_data_list[0];
            let safe_device_name = device.device_name.replace(" ", "_").replace("/", "_");
            let safe_device_type = device.device_type.replace("_", "-");
            format!("{}_{}_report_{}.pdf", safe_device_type, safe_device_name, timestamp)
        } else {
            format!("combined_device_report_{}.pdf", timestamp)
        };
        let pdf_path = reports_dir.join(&pdf_filename);

        // Generate Java PDF with all devices
        log::debug!("Generating combined PDF report using Java...");
        JavaPdfService::generate_pdf_multi(
            app_handle,
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            patient_data,
            device_data_list,
        )?;

        // Determine device metadata for attachment (use first device for now)
        let first_device = &device_data_list[0];
        let device_type_str = if device_data_list.len() > 1 {
            "combined"
        } else {
            &first_device.device_type
        };
        let device_name_str = if device_data_list.len() > 1 {
            "Multiple Devices"
        } else {
            &first_device.device_name
        };

        // Save PDF as attachment
        Self::save_pdf_attachment(
            app_handle,
            db,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Device Test Report",
            device_type_str,
            device_name_str
        ).await?;

        log::debug!("PDF report generated and saved as attachment");
        Ok(())
    }

    /// Generate Java PDF report and save as attachment (legacy single-device wrapper)
    #[allow(dead_code)]
    async fn generate_and_save_pdfs(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        medical_record_id: i64,
        patient_data: &crate::services::device_pdf_service::PatientData,
        device_data: &crate::services::device_pdf_service::DeviceTestData,
    ) -> Result<(), String> {
        Self::generate_and_save_pdfs_multi(app_handle, db, medical_record_id, patient_data, &[device_data.clone()]).await
    }

    /// Save a PDF file as an attachment to a medical record
    async fn save_pdf_attachment(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        medical_record_id: i64,
        pdf_path: &std::path::Path,
        filename: &str,
        pdf_type: &str,
        device_type: &str,
        device_name: &str,
    ) -> Result<(), String> {
        use uuid::Uuid;

        // Read PDF file
        let pdf_bytes = std::fs::read(pdf_path)
            .map_err(|e| format!("Failed to read {} PDF: {}", pdf_type, e))?;

        // Generate unique file ID
        let file_id = Uuid::new_v4().to_string();

        // Get storage directory - use Tauri's platform-specific app data directory
        let app_data_dir = app_handle.path_resolver().app_data_dir()
            .ok_or("Failed to get app data directory")?;
        let storage_dir = app_data_dir
            .join("files")
            .join("medical");

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&storage_dir)
            .map_err(|e| format!("Failed to create storage directory: {}", e))?;

        // Copy PDF to storage location
        let dest_path = storage_dir.join(&file_id);
        std::fs::copy(pdf_path, &dest_path)
            .map_err(|e| format!("Failed to copy {} PDF to storage: {}", pdf_type, e))?;

        log::debug!("Copied {} PDF to: {}", pdf_type, dest_path.display());

        // Create attachment record
        let now = chrono::Utc::now();
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_attachments \
             (medical_record_id, file_id, original_name, mime_type, file_size, uploaded_at, device_type, device_name, connection_method, attachment_type) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                medical_record_id.into(),
                file_id.clone().into(),
                filename.into(),
                "application/pdf".into(),
                (pdf_bytes.len() as i64).into(),
                now.to_rfc3339().into(),
                format!("{}_report", device_type).into(),
                format!("{} Report ({})", device_name, pdf_type).into(),
                "pdf_generation".into(),
                "generated_pdf".into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to create attachment record: {}", e))?;

        log::debug!("Saved {} PDF attachment: {} (file_id: {})", pdf_type, filename, file_id);

        Ok(())
    }

    pub async fn update_medical_record(
        db: &DatabaseConnection,
        record_id: i64,
        updates: UpdateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        let now = Utc::now();

        // Fetch current record for diffing/history
        let old_row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, record_type, name, procedure_name, description, \
                 price, currency_id, is_archived, version, created_at, updated_at, \
                 created_by, updated_by \
                 FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch existing medical record: {}", e))?
            .ok_or("Medical record not found".to_string())?;

        // Build dynamic update query with sequential placeholders
        let mut update_parts: Vec<&str> = Vec::new();
        let mut params: Vec<Value> = Vec::new();

        if let Some(ref name) = updates.name {
            update_parts.push("name = ?");
            params.push(name.clone().into());
        }
        if let Some(ref procedure_name) = updates.procedure_name {
            update_parts.push("procedure_name = ?");
            params.push(procedure_name.clone().into());
        }
        if let Some(ref description) = updates.description {
            update_parts.push("description = ?");
            params.push(description.clone().into());
        }
        // MaybeNull fields - check for Null or Value, not Undefined
        match &updates.price {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                update_parts.push("price = ?");
                params.push(Value::Double(None));
            },
            MaybeNull::Value(v) => {
                update_parts.push("price = ?");
                params.push((*v).into());
            },
        }
        match &updates.currency_id {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                update_parts.push("currency_id = ?");
                params.push(Value::BigInt(None));
            },
            MaybeNull::Value(v) => {
                update_parts.push("currency_id = ?");
                params.push((*v).into());
            },
        }
        if let Some(is_archived) = updates.is_archived {
            update_parts.push("is_archived = ?");
            params.push((if is_archived { 1i32 } else { 0i32 }).into());
        }

        if update_parts.is_empty() {
            return Err("No fields to update".to_string());
        }

        update_parts.push("updated_at = ?");
        params.push(now.to_rfc3339().into());

        update_parts.push("version = version + 1");

        // Add record_id at the end for WHERE clause
        params.push(record_id.into());

        let query = format!(
            "UPDATE medical_records SET {} WHERE id = ?",
            update_parts.join(", ")
        );

        db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &query, params))
            .await
            .map_err(|e| format!("Failed to update medical record: {}", e))?;

        // Fetch the updated record
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, record_type, name, procedure_name, description, \
                 price, currency_id, is_archived, version, created_at, updated_at, \
                 created_by, updated_by \
                 FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch updated medical record: {}", e))?
            .ok_or("Updated record not found".to_string())?;

        let is_archived_int: i64 = row.try_get("", "is_archived").unwrap_or(0);
        let created_at_str: Option<String> = row.try_get("", "created_at").ok();
        let updated_at_str: Option<String> = row.try_get("", "updated_at").ok();

        let created_at = created_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        let updated_at = updated_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        // Handle price as either integer or float
        let price: Option<f64> = row.try_get::<i64>("", "price")
            .ok()
            .map(|i| i as f64)
            .or_else(|| row.try_get::<f64>("", "price").ok());

        let updated_record = MedicalRecord {
            id: row.try_get("", "id").unwrap_or(0),
            patient_id: row.try_get("", "patient_id").unwrap_or(0),
            record_type: row.try_get("", "record_type").unwrap_or_default(),
            name: row.try_get("", "name").unwrap_or_default(),
            procedure_name: row.try_get("", "procedure_name").ok(),
            description: row.try_get("", "description").unwrap_or_default(),
            price,
            currency_id: row.try_get("", "currency_id").ok(),
            is_archived: is_archived_int != 0,
            version: row.try_get("", "version").unwrap_or(1),
            created_at,
            updated_at,
            created_by: row.try_get("", "created_by").ok(),
            updated_by: row.try_get("", "updated_by").ok(),
            attachments: None,
        };

        // Build full snapshot history entry
        // Old snapshot
        let old_is_archived_int: i64 = old_row.try_get("", "is_archived").unwrap_or(0);
        let old_is_archived = old_is_archived_int != 0;
        let old_price: Option<f64> = old_row.try_get::<i64>("", "price")
            .ok()
            .map(|i| i as f64)
            .or_else(|| old_row.try_get::<f64>("", "price").ok());
        let old_snapshot = json!({
            "record_type": old_row.try_get::<String>("", "record_type").unwrap_or_default(),
            "name": old_row.try_get::<String>("", "name").ok(),
            "procedure_name": old_row.try_get::<String>("", "procedure_name").ok(),
            "description": old_row.try_get::<String>("", "description").ok(),
            "price": old_price,
            "currency_id": old_row.try_get::<i64>("", "currency_id").ok(),
            "is_archived": old_is_archived
        });

        // New snapshot from updated_record
        let new_snapshot = json!({
            "record_type": updated_record.record_type,
            "name": updated_record.name,
            "procedure_name": updated_record.procedure_name,
            "description": updated_record.description,
            "price": updated_record.price,
            "currency_id": updated_record.currency_id,
            "is_archived": updated_record.is_archived
        });

        // Compute changed fields list
        let mut changed_fields: Vec<&str> = Vec::new();
        if old_snapshot.get("record_type") != new_snapshot.get("record_type") { changed_fields.push("record_type"); }
        if old_snapshot.get("name") != new_snapshot.get("name") { changed_fields.push("name"); }
        if old_snapshot.get("procedure_name") != new_snapshot.get("procedure_name") { changed_fields.push("procedure_name"); }
        if old_snapshot.get("description") != new_snapshot.get("description") { changed_fields.push("description"); }
        if old_snapshot.get("price") != new_snapshot.get("price") { changed_fields.push("price"); }
        if old_snapshot.get("currency_id") != new_snapshot.get("currency_id") { changed_fields.push("currency_id"); }
        if old_snapshot.get("is_archived") != new_snapshot.get("is_archived") { changed_fields.push("is_archived"); }

        log::debug!("History snapshot insert (update): rec_id={}, version={}, fields={}", record_id, updated_record.version, changed_fields.join(","));
        let _ = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO medical_record_history (medical_record_id, version, changed_fields, old_values, new_values, changed_by) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    record_id.into(),
                    updated_record.version.into(),
                    changed_fields.join(",").into(),
                    old_snapshot.to_string().into(),
                    new_snapshot.to_string().into(),
                    Value::String(updated_record.updated_by.clone().map(Box::new)),
                ],
            ))
            .await;

        Ok(updated_record)
    }

    pub async fn archive_medical_record(
        db: &DatabaseConnection,
        record_id: i64,
        archive: bool,
    ) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE medical_records SET is_archived = ?, updated_at = ? WHERE id = ?",
            [
                (if archive { 1i32 } else { 0i32 }).into(),
                Utc::now().to_rfc3339().into(),
                record_id.into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to archive medical record: {}", e))?;

        Ok(())
    }

    pub async fn search_medical_records(
        db: &DatabaseConnection,
        patient_id: i64,
        search_term: &str,
        include_archived: bool,
    ) -> Result<Vec<MedicalRecord>, String> {
        let mut sql = String::from(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records \
             WHERE patient_id = ? \
             AND (name LIKE ? OR description LIKE ? OR procedure_name LIKE ?)"
        );

        if !include_archived {
            sql.push_str(" AND is_archived = 0");
        }

        sql.push_str(" ORDER BY created_at DESC");

        let search_pattern = format!("%{}%", search_term);

        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                [
                    patient_id.into(),
                    search_pattern.clone().into(),
                    search_pattern.clone().into(),
                    search_pattern.into(),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to search medical records: {}", e))?;

        let mut records = Vec::new();
        for row in rows {
            let is_archived_int: i64 = row.try_get("", "is_archived").unwrap_or(0);
            let created_at_str: Option<String> = row.try_get("", "created_at").ok();
            let updated_at_str: Option<String> = row.try_get("", "updated_at").ok();

            let created_at = created_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            let updated_at = updated_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            // Handle price as either integer or float
            let price: Option<f64> = row.try_get::<i64>("", "price")
                .ok()
                .map(|i| i as f64)
                .or_else(|| row.try_get::<f64>("", "price").ok());

            records.push(MedicalRecord {
                id: row.try_get("", "id").unwrap_or(0),
                patient_id: row.try_get("", "patient_id").unwrap_or(0),
                record_type: row.try_get("", "record_type").unwrap_or_default(),
                name: row.try_get("", "name").unwrap_or_default(),
                procedure_name: row.try_get("", "procedure_name").ok(),
                description: row.try_get("", "description").unwrap_or_default(),
                price,
                currency_id: row.try_get("", "currency_id").ok(),
                is_archived: is_archived_int != 0,
                version: row.try_get("", "version").unwrap_or(1),
                created_at,
                updated_at,
                created_by: row.try_get("", "created_by").ok(),
                updated_by: row.try_get("", "updated_by").ok(),
                attachments: None,
            });
        }
        Ok(records)
    }

    pub async fn get_currencies(db: &DatabaseConnection) -> Result<Vec<Currency>, String> {
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, code, name, symbol FROM currencies ORDER BY id".to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to fetch currencies: {}", e))?;

        let currencies: Vec<Currency> = rows
            .iter()
            .filter_map(|row| {
                Some(Currency {
                    id: row.try_get("", "id").ok()?,
                    code: row.try_get("", "code").ok()?,
                    name: row.try_get("", "name").ok()?,
                    symbol: row.try_get("", "symbol").ok(),
                })
            })
            .collect();

        log::debug!("Fetched currencies from DB: {:?}", currencies);
        Ok(currencies)
    }

    // Get a record snapshot at a specific version using history new_values
    pub async fn get_record_at_version(
        db: &DatabaseConnection,
        record_id: i64,
        version: i32,
    ) -> Result<MedicalRecord, String> {
        // Fetch base record
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, patient_id, record_type, name, procedure_name, description, \
                 price, currency_id, is_archived, version, created_at, updated_at, \
                 created_by, updated_by \
                 FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch medical record: {}", e))?
            .ok_or("Medical record not found".to_string())?;

        let mut base = MedicalRecord {
            id: row.try_get("", "id").unwrap_or(0),
            patient_id: row.try_get("", "patient_id").unwrap_or(0),
            record_type: row.try_get("", "record_type").unwrap_or_default(),
            name: row.try_get("", "name").unwrap_or_default(),
            procedure_name: row.try_get("", "procedure_name").ok(),
            description: row.try_get("", "description").unwrap_or_default(),
            price: row.try_get::<i64>("", "price")
                .ok()
                .map(|i| i as f64)
                .or_else(|| row.try_get::<f64>("", "price").ok()),
            currency_id: row.try_get("", "currency_id").ok(),
            is_archived: {
                let v: i64 = row.try_get("", "is_archived").unwrap_or(0);
                v != 0
            },
            version: row.try_get("", "version").unwrap_or(1),
            created_at: {
                let s: Option<String> = row.try_get("", "created_at").ok();
                s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|| Utc::now())
            },
            updated_at: {
                let s: Option<String> = row.try_get("", "updated_at").ok();
                s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|| Utc::now())
            },
            created_by: row.try_get("", "created_by").ok(),
            updated_by: row.try_get("", "updated_by").ok(),
            attachments: None,
        };

        // Fetch history snapshot
        let hrow = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT new_values FROM medical_record_history WHERE medical_record_id = ? AND version = ?",
                [record_id.into(), version.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch history: {}", e))?;

        if let Some(hr) = hrow {
            let json_str: String = hr.try_get("", "new_values").unwrap_or_default();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(rt) = v.get("record_type").and_then(|x| x.as_str()) { base.record_type = rt.to_string(); }
                if let Some(nm) = v.get("name").and_then(|x| x.as_str()) { base.name = nm.to_string(); }
                if let Some(pn) = v.get("procedure_name").and_then(|x| x.as_str()) { base.procedure_name = Some(pn.to_string()); }
                if let Some(desc) = v.get("description").and_then(|x| x.as_str()) { base.description = desc.to_string(); }
                if let Some(pr) = v.get("price").and_then(|x| x.as_f64()) { base.price = Some(pr); }
                if let Some(cid) = v.get("currency_id").and_then(|x| x.as_i64()) { base.currency_id = Some(cid); }
                if let Some(ia) = v.get("is_archived").and_then(|x| x.as_bool()) { base.is_archived = ia; }
                base.version = version;
            }
        }

        Ok(base)
    }

    // Revert a record one step to its previous version using latest history old_values
    pub async fn revert_one_step(
        db: &DatabaseConnection,
        record_id: i64,
    ) -> Result<MedicalRecord, String> {
        // Fetch latest history entry
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT version, old_values FROM medical_record_history \
                 WHERE medical_record_id = ? ORDER BY version DESC LIMIT 1",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch history: {}", e))?
            .ok_or("No history available to revert".to_string())?;

        let old_values_str: Option<String> = row.try_get("", "old_values").ok();
        if old_values_str.is_none() {
            return Err("No previous values recorded to revert".to_string());
        }

        let old_vals: serde_json::Value = serde_json::from_str(&old_values_str.unwrap())
            .map_err(|e| format!("Failed to parse history values: {}", e))?;

        // Build updates from old values (only known fields)
        let mut updates = UpdateMedicalRecordInput {
            name: None,
            procedure_name: None,
            description: None,
            price: MaybeNull::Undefined,
            currency_id: MaybeNull::Undefined,
            is_archived: None,
        };

        if let Some(v) = old_vals.get("name") { updates.name = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("procedure_name") { updates.procedure_name = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("description") { updates.description = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("price") {
            updates.price = match v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)) {
                Some(p) => MaybeNull::Value(p),
                None if v.is_null() => MaybeNull::Null,
                None => MaybeNull::Undefined,
            };
        }
        if let Some(v) = old_vals.get("currency_id") {
            updates.currency_id = match v.as_i64() {
                Some(id) => MaybeNull::Value(id),
                None if v.is_null() => MaybeNull::Null,
                None => MaybeNull::Undefined,
            };
        }
        if let Some(v) = old_vals.get("is_archived") { updates.is_archived = v.as_bool(); }

        // If no fields present, abort
        if updates.name.is_none()
            && updates.procedure_name.is_none()
            && updates.description.is_none()
            && matches!(updates.price, MaybeNull::Undefined)
            && matches!(updates.currency_id, MaybeNull::Undefined)
            && updates.is_archived.is_none() {
            return Err("No revertable fields in previous version".to_string());
        }

        Self::update_medical_record(db, record_id, updates).await
    }
}
