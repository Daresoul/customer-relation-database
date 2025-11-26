use sqlx::{SqlitePool, Row};
use crate::models::medical::*;
use crate::models::dto::MaybeNull;
use chrono::{Utc, DateTime};
use serde_json::json;

// T027: MedicalRecordService with CRUD operations
pub struct MedicalRecordService;

impl MedicalRecordService {
    pub async fn get_medical_records(
        pool: &SqlitePool,
        patient_id: i64,
        filter: Option<MedicalRecordFilter>,
        pagination: Option<PaginationParams>,
    ) -> Result<MedicalRecordsResponse, String> {
        let page = pagination.as_ref().and_then(|p| p.page).unwrap_or(1);
        let page_size = pagination.as_ref().and_then(|p| p.page_size).unwrap_or(50);
        let offset = ((page - 1) * page_size) as i64;

        // Build the query based on filters
        let mut query = "SELECT id, patient_id, record_type, name, procedure_name, description, \
                         price, currency_id, is_archived, version, created_at, updated_at, \
                         created_by, updated_by \
                         FROM medical_records WHERE patient_id = ?".to_string();

        if let Some(ref f) = filter {
            if let Some(ref record_type) = f.record_type {
                query.push_str(&format!(" AND record_type = '{}'", record_type));
            }
            if let Some(is_archived) = f.is_archived {
                query.push_str(&format!(" AND is_archived = {}", if is_archived { 1 } else { 0 }));
            }
            if let Some(ref search_term) = f.search_term {
                query.push_str(&format!(" AND (name LIKE '%{}%' OR description LIKE '%{}%')", search_term, search_term));
            }
        } else {
            // Default to not showing archived records
            query.push_str(" AND is_archived = 0");
        }

        query.push_str(" ORDER BY created_at DESC");
        query.push_str(&format!(" LIMIT {} OFFSET {}", page_size, offset));

        println!("Executing query: {} with patient_id: {}", query, patient_id);

        let rows = sqlx::query(&query)
            .bind(patient_id)
            .fetch_all(pool)
            .await
            .map_err(|e| {
                eprintln!("SQL Error: {}", e);
                format!("Failed to fetch medical records: {}", e)
            })?;

        println!("Got {} rows from database", rows.len());

        let mut records = Vec::new();
        for row in rows {
            println!("Processing row...");
            let record_id: i64 = row.get("id");
            let is_archived_int: i64 = row.get("is_archived");
            let created_at_str: Option<String> = row.try_get("created_at").ok();
            let updated_at_str: Option<String> = row.try_get("updated_at").ok();

            let created_at = created_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            let updated_at = updated_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            // Handle price as either integer or float
            let price: Option<f64> = row.try_get::<Option<i64>, _>("price")
                .ok()
                .flatten()
                .map(|i| i as f64)
                .or_else(|| row.try_get("price").ok().flatten());

            // Fetch attachments for this record
            let attachments = sqlx::query_as::<_, MedicalAttachment>(
                "SELECT id, medical_record_id, file_id, original_name, mime_type, \
                 file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
                 FROM medical_attachments WHERE medical_record_id = ?"
            )
            .bind(record_id)
            .fetch_all(pool)
            .await
            .unwrap_or_else(|_| Vec::new());

            records.push(MedicalRecord {
                id: record_id,
                patient_id: row.get("patient_id"),
                record_type: row.get("record_type"),
                name: row.get("name"),
                procedure_name: row.get("procedure_name"),
                description: row.get("description"),
                price,
                currency_id: row.get("currency_id"),
                is_archived: is_archived_int != 0,
                version: row.get("version"),
                created_at,
                updated_at,
                created_by: row.get("created_by"),
                updated_by: row.get("updated_by"),
                attachments: if attachments.is_empty() { None } else { Some(attachments) },
            });
        }

        println!("Found {} records", records.len());

        // Get total count
        let mut count_query = "SELECT COUNT(*) FROM medical_records WHERE patient_id = ?".to_string();
        if let Some(ref f) = filter {
            if let Some(ref record_type) = f.record_type {
                count_query.push_str(&format!(" AND record_type = '{}'", record_type));
            }
            if let Some(is_archived) = f.is_archived {
                count_query.push_str(&format!(" AND is_archived = {}", if is_archived { 1 } else { 0 }));
            }
            if let Some(ref search_term) = f.search_term {
                count_query.push_str(&format!(" AND (name LIKE '%{}%' OR description LIKE '%{}%')", search_term, search_term));
            }
        } else {
            count_query.push_str(" AND is_archived = 0");
        }

        let total: i64 = sqlx::query_scalar(&count_query)
            .bind(patient_id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to count medical records: {}", e))?;

        Ok(MedicalRecordsResponse {
            records,
            total,
            page,
            page_size,
        })
    }

    pub async fn get_medical_record(
        pool: &SqlitePool,
        record_id: i64,
        include_history: bool,
    ) -> Result<MedicalRecordDetail, String> {
        // Get the record
        let row = sqlx::query(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records WHERE id = ?"
        )
        .bind(record_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch medical record: {}", e))?
        .ok_or("Medical record not found".to_string())?;

        let is_archived_int: i64 = row.get("is_archived");
        let created_at_str: Option<String> = row.try_get("created_at").ok();
        let updated_at_str: Option<String> = row.try_get("updated_at").ok();

        let created_at = created_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        let updated_at = updated_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        // Handle price as either integer or float
        let price: Option<f64> = row.try_get::<Option<i64>, _>("price")
            .ok()
            .flatten()
            .map(|i| i as f64)
            .or_else(|| row.try_get("price").ok().flatten());

        let record = MedicalRecord {
            id: row.get("id"),
            patient_id: row.get("patient_id"),
            record_type: row.get("record_type"),
            name: row.get("name"),
            procedure_name: row.get("procedure_name"),
            description: row.get("description"),
            price,
            currency_id: row.get("currency_id"),
            is_archived: is_archived_int != 0,
            version: row.get("version"),
            created_at,
            updated_at,
            created_by: row.get("created_by"),
            updated_by: row.get("updated_by"),
            attachments: None,
        };

        // Get attachments (tolerant to different datetime formats)
        let attachment_rows = sqlx::query(
            "SELECT id, medical_record_id, file_id, original_name, mime_type, \
             file_size, uploaded_at, device_type, device_name, connection_method, attachment_type \
             FROM medical_attachments WHERE medical_record_id = ?"
        )
        .bind(record_id)
        .fetch_all(pool)
        .await
        .unwrap_or_else(|_| Vec::new());

        fn parse_dt(s: &str) -> DateTime<Utc> {
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

        let attachments: Vec<MedicalAttachment> = attachment_rows
            .into_iter()
            .map(|row| {
                let uploaded_at_str: Option<String> = row.try_get("uploaded_at").ok();
                let uploaded_at = uploaded_at_str
                    .as_deref()
                    .map(parse_dt)
                    .unwrap_or_else(Utc::now);

                MedicalAttachment {
                    id: row.get("id"),
                    medical_record_id: row.get("medical_record_id"),
                    file_id: row.get("file_id"),
                    original_name: row.get("original_name"),
                    file_size: row.try_get("file_size").ok(),
                    mime_type: row.try_get("mime_type").ok(),
                    uploaded_at,
                    device_type: row.try_get("device_type").ok(),
                    device_name: row.try_get("device_name").ok(),
                    connection_method: row.try_get("connection_method").ok(),
                    attachment_type: row.try_get("attachment_type").ok(),
                }
            })
            .collect();

        // Get history if requested
        let history = if include_history {
            sqlx::query_as::<_, MedicalRecordHistory>(
                "SELECT id, medical_record_id, version, changed_fields, old_values, \
                 new_values, changed_by, changed_at \
                 FROM medical_record_history \
                 WHERE medical_record_id = ? \
                 ORDER BY changed_at DESC"
            )
            .bind(record_id)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch history: {}", e))?
        } else {
            Vec::new()
        };

        Ok(MedicalRecordDetail {
            record,
            attachments,
            history: if include_history { Some(history) } else { None },
        })
    }

    pub async fn create_medical_record(
        pool: &SqlitePool,
        input: CreateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        println!("🔍 Creating medical record with input:");
        println!("   device_test_data: {:?}", input.device_test_data.is_some());
        println!("   device_type: {:?}", input.device_type);
        println!("   device_name: {:?}", input.device_name);

        let now = Utc::now();

        // Development: do not populate procedure_name; use name as the single source of truth
        let procedure_name: Option<String> = None;

        let result = sqlx::query(
            "INSERT INTO medical_records \
             (patient_id, record_type, name, procedure_name, description, \
              price, currency_id, is_archived, version, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)"
        )
        .bind(input.patient_id)
        .bind(&input.record_type)
        .bind(&input.name)
        .bind(&procedure_name)
        .bind(&input.description)
        .bind(input.price)
        .bind(input.currency_id)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create medical record: {}", e))?;

        let id = result.last_insert_rowid();

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

        let _ = sqlx::query(
            "INSERT INTO medical_record_history (medical_record_id, version, changed_fields, old_values, new_values, changed_by) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(1)
        .bind("created")
        .bind(Option::<String>::None)
        .bind(new_snapshot.to_string())
        .bind(&record.created_by)
        .execute(pool)
        .await;

        println!(
            "History snapshot insert (create): rec_id={}, version=1, fields=created, new={}",
            id,
            new_snapshot
        );

        // Generate PDFs if device test data is present
        println!("🔍 [PDF] Checking for device data:");
        println!("   device_test_data (legacy): {}", input.device_test_data.is_some());
        println!("   device_data_list: {}", input.device_data_list.is_some());

        // Collect all device data (either from device_data_list or legacy single device)
        let mut all_device_data: Vec<crate::services::device_pdf_service::DeviceTestData> = Vec::new();

        // Add devices from device_data_list (new multi-device format)
        if let Some(ref device_list) = input.device_data_list {
            println!("📄 [PDF] Found {} devices in device_data_list", device_list.len());
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
            println!("📄 [PDF] Found legacy single device data");
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
            println!("📄 [PDF] Generating PDF with {} device samples...", all_device_data.len());

            // Get patient data for PDF generation
            let patient_data = match Self::get_patient_for_pdf(pool, input.patient_id).await {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("⚠️  Failed to get patient data for PDF: {}", e);
                    return Ok(record); // Return the record anyway, just skip PDF generation
                }
            };

            // Fill in patient identifier for all devices
            let patient_identifier = Some(patient_data.microchip_id.clone().unwrap_or_else(|| patient_data.name.clone()));
            for device in all_device_data.iter_mut() {
                device.patient_identifier = patient_identifier.clone();
            }

            // Generate PDF with all devices
            if let Err(e) = Self::generate_and_save_pdfs_multi(pool, id, &patient_data, &all_device_data).await {
                eprintln!("⚠️  Failed to generate PDFs: {}", e);
                // Continue anyway - the record was created successfully
            }
        }

        Ok(record)
    }

    /// Helper to get patient data for PDF generation
    async fn get_patient_for_pdf(
        pool: &SqlitePool,
        patient_id: i64,
    ) -> Result<crate::services::device_pdf_service::PatientData, String> {
        // Simple query - just get patient and species data
        let row = sqlx::query(
            "SELECT p.name, p.gender, p.date_of_birth, p.microchip_id, \
             s.name as species_name \
             FROM patients p \
             LEFT JOIN species s ON p.species_id = s.id \
             WHERE p.id = ?"
        )
        .bind(patient_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch patient: {}", e))?
        .ok_or("Patient not found".to_string())?;

        let birthdate: Option<String> = row.try_get("date_of_birth").ok().flatten();

        // Try to get owner information - prefer primary contact's full name, fall back to household name
        println!("   🔍 Looking up owner for patient_id: {}", patient_id);

        let owner_result = sqlx::query_scalar::<_, String>(
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
             LIMIT 1"
        )
        .bind(patient_id)
        .fetch_optional(pool)
        .await;

        let owner = match owner_result {
            Ok(Some(name)) => {
                println!("   ✅ Found owner: {}", name);
                name
            }
            Ok(None) => {
                println!("   ⚠️  No household link found for patient");
                "Unknown Owner".to_string()
            }
            Err(e) => {
                println!("   ❌ Owner query failed: {}", e);
                "Unknown Owner".to_string()
            }
        };

        Ok(crate::services::device_pdf_service::PatientData {
            name: row.get("name"),
            owner,
            species: row.try_get("species_name").ok().flatten().unwrap_or_else(|| "Unknown Species".to_string()),
            microchip_id: row.try_get("microchip_id").ok().flatten(),
            gender: row.try_get("gender").ok().flatten().unwrap_or_else(|| "Unknown".to_string()),
            date_of_birth: birthdate,
        })
    }

    /// Generate Java PDF report with multiple device samples and save as attachment
    async fn generate_and_save_pdfs_multi(
        pool: &SqlitePool,
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
        println!("   ☕ Generating combined PDF report using Java...");
        JavaPdfService::generate_pdf_multi(
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
            pool,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Device Test Report",
            device_type_str,
            device_name_str
        ).await?;

        println!("✅ PDF report generated and saved as attachment");
        Ok(())
    }

    /// Generate Java PDF report and save as attachment (legacy single-device wrapper)
    #[allow(dead_code)]
    async fn generate_and_save_pdfs(
        pool: &SqlitePool,
        medical_record_id: i64,
        patient_data: &crate::services::device_pdf_service::PatientData,
        device_data: &crate::services::device_pdf_service::DeviceTestData,
    ) -> Result<(), String> {
        Self::generate_and_save_pdfs_multi(pool, medical_record_id, patient_data, &[device_data.clone()]).await
    }

    /// Save a PDF file as an attachment to a medical record
    async fn save_pdf_attachment(
        pool: &SqlitePool,
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

        // Get storage directory - construct from home directory
        let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
        let storage_dir = home_dir
            .join("Library")
            .join("Application Support")
            .join("com.vetclinic.app")
            .join("files")
            .join("medical");

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&storage_dir)
            .map_err(|e| format!("Failed to create storage directory: {}", e))?;

        // Copy PDF to storage location
        let dest_path = storage_dir.join(&file_id);
        std::fs::copy(pdf_path, &dest_path)
            .map_err(|e| format!("Failed to copy {} PDF to storage: {}", pdf_type, e))?;

        println!("   📁 Copied {} PDF to: {}", pdf_type, dest_path.display());

        // Create attachment record
        let now = chrono::Utc::now();
        sqlx::query(
            "INSERT INTO medical_attachments \
             (medical_record_id, file_id, original_name, mime_type, file_size, uploaded_at, device_type, device_name, connection_method, attachment_type) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(medical_record_id)
        .bind(&file_id)
        .bind(filename)
        .bind("application/pdf")
        .bind(pdf_bytes.len() as i64)
        .bind(now)
        .bind(format!("{}_report", device_type))
        .bind(format!("{} Report ({})", device_name, pdf_type))
        .bind("pdf_generation")
        .bind("generated_pdf") // Attachment type for auto-generated PDFs
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create attachment record: {}", e))?;

        println!("   💾 Saved {} PDF attachment: {} (file_id: {})", pdf_type, filename, file_id);

        Ok(())
    }

    pub async fn update_medical_record(
        pool: &SqlitePool,
        record_id: i64,
        updates: UpdateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        let now = Utc::now();

        // Fetch current record for diffing/history
        let old_row = sqlx::query(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records WHERE id = ?"
        )
        .bind(record_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch existing medical record: {}", e))?
        .ok_or("Medical record not found".to_string())?;

        // Build dynamic update query
        let mut update_fields = Vec::new();
        if updates.name.is_some() {
            update_fields.push("name = ?1");
        }
        if updates.procedure_name.is_some() {
            update_fields.push("procedure_name = ?2");
        }
        if updates.description.is_some() {
            update_fields.push("description = ?3");
        }
        // MaybeNull fields - check for Null or Value, not Undefined
        if !matches!(updates.price, MaybeNull::Undefined) {
            update_fields.push("price = ?4");
        }
        if !matches!(updates.currency_id, MaybeNull::Undefined) {
            update_fields.push("currency_id = ?5");
        }
        if updates.is_archived.is_some() {
            update_fields.push("is_archived = ?6");
        }

        if update_fields.is_empty() {
            return Err("No fields to update".to_string());
        }

        update_fields.push("updated_at = ?7");
        update_fields.push("version = version + 1");

        let query = format!(
            "UPDATE medical_records SET {} WHERE id = ?8",
            update_fields.join(", ")
        );

        // Convert MaybeNull to Option for binding
        let price_opt: Option<f64> = match &updates.price {
            MaybeNull::Undefined => None, // Won't be used since field not in query
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(*v),
        };
        let currency_id_opt: Option<i64> = match &updates.currency_id {
            MaybeNull::Undefined => None, // Won't be used since field not in query
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(*v),
        };

        sqlx::query(&query)
            .bind(&updates.name)
            .bind(&updates.procedure_name)
            .bind(&updates.description)
            .bind(price_opt)
            .bind(currency_id_opt)
            .bind(updates.is_archived)
            .bind(now)
            .bind(record_id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update medical record: {}", e))?;

        // Fetch the updated record
        let row = sqlx::query(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records WHERE id = ?"
        )
        .bind(record_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to fetch updated medical record: {}", e))?;

        let is_archived_int: i64 = row.get("is_archived");
        let created_at_str: Option<String> = row.try_get("created_at").ok();
        let updated_at_str: Option<String> = row.try_get("updated_at").ok();

        let created_at = created_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        let updated_at = updated_at_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now());

        // Handle price as either integer or float
        let price: Option<f64> = row.try_get::<Option<i64>, _>("price")
            .ok()
            .flatten()
            .map(|i| i as f64)
            .or_else(|| row.try_get("price").ok().flatten());

        let updated_record = MedicalRecord {
            id: row.get("id"),
            patient_id: row.get("patient_id"),
            record_type: row.get("record_type"),
            name: row.get("name"),
            procedure_name: row.get("procedure_name"),
            description: row.get("description"),
            price,
            currency_id: row.get("currency_id"),
            is_archived: is_archived_int != 0,
            version: row.get("version"),
            created_at,
            updated_at,
            created_by: row.get("created_by"),
            updated_by: row.get("updated_by"),
            attachments: None,
        };

        // Build full snapshot history entry
        // Old snapshot
        let old_is_archived_int: Option<i64> = old_row.try_get("is_archived").ok();
        let old_is_archived = old_is_archived_int.map(|i| i != 0).unwrap_or(false);
        let old_price_int: Option<i64> = old_row.try_get("price").ok();
        let old_price: Option<f64> = old_price_int.map(|i| i as f64).or_else(|| old_row.try_get("price").ok());
        let old_snapshot = json!({
            "record_type": old_row.try_get::<String,_>("record_type").unwrap_or_default(),
            "name": old_row.try_get::<Option<String>,_>("name").ok().flatten(),
            "procedure_name": old_row.try_get::<Option<String>,_>("procedure_name").ok().flatten(),
            "description": old_row.try_get::<Option<String>,_>("description").ok().flatten(),
            "price": old_price,
            "currency_id": old_row.try_get::<Option<i64>,_>("currency_id").ok().flatten(),
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

        println!(
            "History snapshot insert (update): rec_id={}, version={}, fields={}",
            record_id,
            updated_record.version,
            changed_fields.join(",")
        );
        let _ = sqlx::query(
            "INSERT INTO medical_record_history (medical_record_id, version, changed_fields, old_values, new_values, changed_by) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(record_id)
        .bind(updated_record.version)
        .bind(changed_fields.join(","))
        .bind(old_snapshot.to_string())
        .bind(new_snapshot.to_string())
        .bind(&updated_record.updated_by)
        .execute(pool)
        .await;

        Ok(updated_record)
    }

    pub async fn archive_medical_record(
        pool: &SqlitePool,
        record_id: i64,
        archive: bool,
    ) -> Result<(), String> {
        sqlx::query(
            "UPDATE medical_records SET is_archived = ?, updated_at = ? WHERE id = ?"
        )
        .bind(archive)
        .bind(Utc::now())
        .bind(record_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to archive medical record: {}", e))?;

        Ok(())
    }

    pub async fn search_medical_records(
        pool: &SqlitePool,
        patient_id: i64,
        search_term: &str,
        include_archived: bool,
    ) -> Result<Vec<MedicalRecord>, String> {
        let mut query = "SELECT id, patient_id, record_type, name, procedure_name, description, \
                         price, currency_id, is_archived, version, created_at, updated_at, \
                         created_by, updated_by \
                         FROM medical_records \
                         WHERE patient_id = ? \
                         AND (name LIKE ? OR description LIKE ? OR procedure_name LIKE ?)".to_string();

        if !include_archived {
            query.push_str(" AND is_archived = 0");
        }

        query.push_str(" ORDER BY created_at DESC");

        let search_pattern = format!("%{}%", search_term);

        let rows = sqlx::query(&query)
            .bind(patient_id)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .bind(&search_pattern)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to search medical records: {}", e))?;

        let mut records = Vec::new();
        for row in rows {
            let is_archived_int: i64 = row.get("is_archived");
            let created_at_str: Option<String> = row.try_get("created_at").ok();
            let updated_at_str: Option<String> = row.try_get("updated_at").ok();

            let created_at = created_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            let updated_at = updated_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| Utc::now());

            // Handle price as either integer or float
            let price: Option<f64> = row.try_get::<Option<i64>, _>("price")
                .ok()
                .flatten()
                .map(|i| i as f64)
                .or_else(|| row.try_get("price").ok().flatten());

            records.push(MedicalRecord {
                id: row.get("id"),
                patient_id: row.get("patient_id"),
                record_type: row.get("record_type"),
                name: row.get("name"),
                procedure_name: row.get("procedure_name"),
                description: row.get("description"),
                price,
                currency_id: row.get("currency_id"),
                is_archived: is_archived_int != 0,
                version: row.get("version"),
                created_at,
                updated_at,
                created_by: row.get("created_by"),
                updated_by: row.get("updated_by"),
                attachments: None,
            });
        }
        Ok(records)
    }

    pub async fn get_currencies(pool: &SqlitePool) -> Result<Vec<Currency>, String> {
        let currencies = sqlx::query_as::<_, Currency>(
            "SELECT id, code, name, symbol FROM currencies ORDER BY id"
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch currencies: {}", e))?;

        println!("DEBUG: Fetched currencies from DB: {:?}", currencies);
        Ok(currencies)
    }

    // Get a record snapshot at a specific version using history new_values
    pub async fn get_record_at_version(
        pool: &SqlitePool,
        record_id: i64,
        version: i32,
    ) -> Result<MedicalRecord, String> {
        // Fetch base record
        let row = sqlx::query(
            "SELECT id, patient_id, record_type, name, procedure_name, description, \
             price, currency_id, is_archived, version, created_at, updated_at, \
             created_by, updated_by \
             FROM medical_records WHERE id = ?"
        )
        .bind(record_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch medical record: {}", e))?
        .ok_or("Medical record not found".to_string())?;

        let mut base = MedicalRecord {
            id: row.get("id"),
            patient_id: row.get("patient_id"),
            record_type: row.get("record_type"),
            name: row.get("name"),
            procedure_name: row.get("procedure_name"),
            description: row.get("description"),
            price: row
                .try_get::<Option<i64>, _>("price")
                .ok()
                .flatten()
                .map(|i| i as f64)
                .or_else(|| row.try_get("price").ok().flatten()),
            currency_id: row.get("currency_id"),
            is_archived: {
                let v: i64 = row.get("is_archived");
                v != 0
            },
            version: row.get("version"),
            created_at: {
                let s: Option<String> = row.try_get("created_at").ok();
                s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|| Utc::now())
            },
            updated_at: {
                let s: Option<String> = row.try_get("updated_at").ok();
                s.and_then(|s| DateTime::parse_from_rfc3339(&s).ok()).map(|d| d.with_timezone(&Utc)).unwrap_or_else(|| Utc::now())
            },
            created_by: row.get("created_by"),
            updated_by: row.get("updated_by"),
            attachments: None,
        };

        // Fetch history snapshot
        let hrow = sqlx::query(
            "SELECT new_values FROM medical_record_history WHERE medical_record_id = ? AND version = ?"
        )
        .bind(record_id)
        .bind(version)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch history: {}", e))?;

        if let Some(hr) = hrow {
            let json_str: String = hr.get("new_values");
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
        pool: &SqlitePool,
        record_id: i64,
    ) -> Result<MedicalRecord, String> {
        // Fetch latest history entry
        let row = sqlx::query(
            "SELECT version, old_values FROM medical_record_history \
             WHERE medical_record_id = ? ORDER BY version DESC LIMIT 1"
        )
        .bind(record_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch history: {}", e))?
        .ok_or("No history available to revert".to_string())?;

        let old_values_str: Option<String> = row.try_get("old_values").ok();
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

        Self::update_medical_record(pool, record_id, updates).await
    }
}
