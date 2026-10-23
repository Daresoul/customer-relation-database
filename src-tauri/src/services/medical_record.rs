use sea_orm::*;
use crate::models::medical::*;
use crate::models::dto::MaybeNull;
use chrono::{Utc, DateTime};
use serde_json::json;

/// Every column a `MedicalRecord` is read from. All record SELECTs use this
/// list so no field (like `invoice_number`) is left out of one of them.
const RECORD_COLUMNS: &str = "id, patient_id, record_type, name, procedure_name, description, \
     prescription_notes, price, currency_id, discount_percent, manual_total, invoice_number, \
     is_archived, version, created_at, updated_at, created_by, updated_by";

/// A REAL column that may hold an integer or a float.
fn row_f64(row: &QueryResult, col: &str) -> Option<f64> {
    row.try_get::<i64>("", col)
        .ok()
        .map(|i| i as f64)
        .or_else(|| row.try_get::<f64>("", col).ok())
}

fn row_utc(row: &QueryResult, col: &str) -> DateTime<Utc> {
    row.try_get::<String>("", col)
        .ok()
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now)
}

/// Map a row selected with `RECORD_COLUMNS`. Attachments and line items
/// are loaded separately by the callers that need them.
fn row_to_record(row: &QueryResult) -> MedicalRecord {
    let is_archived_int: i64 = row.try_get("", "is_archived").unwrap_or(0);
    MedicalRecord {
        id: row.try_get("", "id").unwrap_or(0),
        patient_id: row.try_get("", "patient_id").unwrap_or(0),
        record_type: row.try_get("", "record_type").unwrap_or_default(),
        name: row.try_get("", "name").unwrap_or_default(),
        procedure_name: row.try_get("", "procedure_name").ok(),
        description: row.try_get("", "description").unwrap_or_default(),
        prescription_notes: row.try_get("", "prescription_notes").ok(),
        price: row_f64(row, "price"),
        currency_id: row.try_get("", "currency_id").ok(),
        discount_percent: row_f64(row, "discount_percent"),
        manual_total: row_f64(row, "manual_total"),
        invoice_number: row.try_get("", "invoice_number").ok(),
        is_archived: is_archived_int != 0,
        version: row.try_get("", "version").unwrap_or(1),
        created_at: row_utc(row, "created_at"),
        updated_at: row_utc(row, "updated_at"),
        created_by: row.try_get("", "created_by").ok(),
        updated_by: row.try_get("", "updated_by").ok(),
        attachments: None,
        line_items: None,
    }
}

/// An invoice's number and the date printed on it.
#[derive(Debug, Clone, PartialEq)]
pub struct Invoice {
    pub number: String,
    pub date: chrono::NaiveDate,
}

/// Where record documents are rendered (the JAR) and stored.
pub struct PdfEnv {
    pub jar_path: std::path::PathBuf,
    pub storage_dir: std::path::PathBuf,
}

/// How one generated document fared on a save.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PdfStatus {
    /// `report`, `pharmacy_note`, `invoice` or `device_report`.
    pub kind: String,
    pub ok: bool,
    pub error: Option<String>,
    /// The stored PDF, when one was made (the lab report).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub attachment_id: Option<i64>,
    /// Analyte codes the machine sent that have no row on the PDF.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub missing_values: Option<Vec<String>>,
}

impl PdfStatus {
    pub(crate) fn ok(kind: &str) -> Self {
        Self { kind: kind.to_string(), ok: true, error: None, attachment_id: None, missing_values: None }
    }

    pub(crate) fn failed(kind: &str, error: impl Into<String>) -> Self {
        Self { kind: kind.to_string(), ok: false, error: Some(error.into()), attachment_id: None, missing_values: None }
    }
}

impl PdfEnv {
    pub fn from_app(app_handle: &tauri::AppHandle) -> Result<Self, String> {
        Ok(Self {
            jar_path: crate::services::java_pdf_service::JavaPdfService::get_jar_path(app_handle)?,
            storage_dir: crate::services::file_storage::FileStorageService::get_storage_dir(app_handle)?,
        })
    }
}

/// The documents made from a record on every save, in the order they are made.
const DOCUMENT_KINDS: [&str; 3] = ["report", "pharmacy_note", "invoice"];

fn attachment_type_of(kind: &str) -> &'static str {
    match kind {
        "report" => "simple_report",
        "pharmacy_note" => "pharmacy_note",
        "invoice" => "invoice",
        _ => "generated_pdf",
    }
}

/// A saved record and how each of its documents fared.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SavedMedicalRecord {
    #[serde(flatten)]
    pub record: MedicalRecord,
    pub pdfs: Vec<PdfStatus>,
}

// T027: MedicalRecordService with CRUD operations
pub struct MedicalRecordService;

impl MedicalRecordService {
    /// Regenerate the record's report, pharmacy note and invoice. Each new
    /// document replaces the old one of its kind only once it is stored; a
    /// failure leaves the old one in place. A pharmacy note or invoice the
    /// record no longer has content for is retired.
    pub async fn generate_record_documents(
        env: &PdfEnv,
        db: &DatabaseConnection,
        record: &MedicalRecord,
    ) -> Vec<PdfStatus> {
        let mut statuses = Vec::new();
        for kind in DOCUMENT_KINDS {
            match Self::document_applies(db, record, kind).await {
                Ok(true) => statuses.push(Self::generate_document(env, db, record, kind).await),
                Ok(false) => Self::retire_documents(db, record.id, attachment_type_of(kind), None).await,
                Err(e) => statuses.push(PdfStatus::failed(kind, e)),
            }
        }
        statuses
    }

    /// When the record was made; lab reports print it when the analyzer
    /// sent no test time of its own.
    pub async fn record_time(db: &DatabaseConnection, record_id: i64) -> Result<DateTime<Utc>, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT created_at FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the record's time: {}", e))?
            .ok_or("Medical record not found".to_string())?;
        let created_at: String = row.try_get("", "created_at").unwrap_or_default();
        Ok(Self::parse_datetime(&created_at))
    }

    /// Regenerate one document (the Retry after a failed save).
    pub async fn regenerate_document(
        env: &PdfEnv,
        db: &DatabaseConnection,
        record_id: i64,
        kind: &str,
    ) -> PdfStatus {
        if !DOCUMENT_KINDS.contains(&kind) {
            return PdfStatus::failed(kind, format!("Unknown document kind: {}", kind));
        }
        match Self::get_medical_record(db, record_id, false).await {
            Ok(detail) => Self::generate_document(env, db, &detail.record, kind).await,
            Err(e) => PdfStatus::failed(kind, e),
        }
    }

    /// The kinds that need no other input than the record itself.
    async fn document_applies(db: &DatabaseConnection, record: &MedicalRecord, kind: &str) -> Result<bool, String> {
        Ok(match kind {
            "pharmacy_note" => record.prescription_notes.as_ref().is_some_and(|n| !n.trim().is_empty()),
            "invoice" => !crate::services::line_item::LineItemService::get_line_items_for_record(db, record.id)
                .await?
                .is_empty(),
            _ => true,
        })
    }

    async fn generate_document(env: &PdfEnv, db: &DatabaseConnection, record: &MedicalRecord, kind: &str) -> PdfStatus {
        let result = match kind {
            "report" => Self::generate_simple_report_pdf(env, db, record.id, record).await,
            "pharmacy_note" => Self::generate_pharmacy_note_pdf(env, db, record.id, record).await,
            "invoice" => Self::generate_invoice_pdf(env, db, record.id, record).await,
            other => Err(format!("Unknown document kind: {}", other)),
        };
        match result {
            Ok(new_id) => {
                Self::retire_documents(db, record.id, attachment_type_of(kind), Some(new_id)).await;
                PdfStatus::ok(kind)
            }
            Err(e) => {
                log::error!("❌ {} PDF for record {} failed: {}", kind, record.id, e);
                PdfStatus::failed(kind, e)
            }
        }
    }

    /// Soft-delete the record's documents of one type, except `keep_id`.
    async fn retire_documents(db: &DatabaseConnection, record_id: i64, attachment_type: &str, keep_id: Option<i64>) {
        let result = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE medical_attachments SET deleted_at = ? \
                 WHERE medical_record_id = ? AND attachment_type = ? AND deleted_at IS NULL AND id != ?",
                [
                    Utc::now().to_rfc3339().into(),
                    record_id.into(),
                    attachment_type.into(),
                    keep_id.unwrap_or(-1).into(),
                ],
            ))
            .await;
        if let Err(e) = result {
            log::warn!("Could not retire old {} documents of record {}: {}", attachment_type, record_id, e);
        }
    }

    /// The record's invoice number and date, assigned on first use and kept
    /// from then on. `now` carries the clinic's time zone: the date and the
    /// number's year are the local calendar date, not UTC's.
    pub async fn assign_invoice<Tz: chrono::TimeZone>(
        db: &DatabaseConnection,
        record_id: i64,
        now: DateTime<Tz>,
    ) -> Result<Invoice, String> {
        let txn = db.begin().await.map_err(|e| format!("Failed to start invoice numbering: {}", e))?;
        let row = txn
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT invoice_number, invoice_date, created_at FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the invoice number: {}", e))?
            .ok_or("Medical record not found".to_string())?;
        let number: Option<String> = row.try_get("", "invoice_number").ok().flatten();
        let stored_date = row
            .try_get::<Option<String>>("", "invoice_date")
            .ok()
            .flatten()
            .and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok());

        if let (Some(number), Some(date)) = (number.clone(), stored_date) {
            return Ok(Invoice { number, date });
        }

        let invoice = match number {
            // Numbered before dates were stored: the visit's own local date.
            Some(number) => {
                let date = row
                    .try_get::<String>("", "created_at")
                    .ok()
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&now.timezone()).date_naive())
                    .unwrap_or_else(|| now.date_naive());
                Invoice { number, date }
            }
            None => {
                let date = now.date_naive();
                let year = date.format("%Y").to_string();
                let last = txn
                    .query_one(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "SELECT invoice_number FROM medical_records \
                         WHERE invoice_number LIKE ? \
                         ORDER BY CAST(SUBSTR(invoice_number, 1, INSTR(invoice_number, '/') - 1) AS INTEGER) DESC \
                         LIMIT 1",
                        [format!("%/{}", year).into()],
                    ))
                    .await
                    .map_err(|e| format!("Failed to query max invoice number: {}", e))?
                    .and_then(|r| r.try_get::<String>("", "invoice_number").ok())
                    .and_then(|l| l.split('/').next().and_then(|n| n.parse::<i64>().ok()))
                    .unwrap_or(0);
                Invoice { number: format!("{:03}/{}", last + 1, year), date }
            }
        };

        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE medical_records SET invoice_number = ?, invoice_date = ? WHERE id = ?",
            [
                invoice.number.clone().into(),
                invoice.date.format("%Y-%m-%d").to_string().into(),
                record_id.into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to store invoice number: {}", e))?;
        txn.commit().await.map_err(|e| format!("Failed to store invoice number: {}", e))?;

        log::info!("📝 Invoice {} dated {} for record {}", invoice.number, invoice.date, record_id);
        Ok(invoice)
    }

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
        let mut sql = format!("SELECT {} FROM medical_records WHERE patient_id = ?", RECORD_COLUMNS);
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
            // NOTE: search_term is intentionally NOT applied here. SQLite
            // LIKE only case-folds ASCII, so a Cyrillic search term wouldn't
            // match Cyrillic record text differing in case. We fetch the
            // patient's records (filtered by the exact-match record_type /
            // is_archived above) and apply the search + pagination in Rust
            // below with Unicode-aware to_lowercase(). Per-patient record
            // counts are small, so the full fetch is cheap.
        } else {
            // Default to not showing archived records
            sql.push_str(" AND is_archived = 0");
        }

        sql.push_str(" ORDER BY created_at DESC");

        log::debug!("Executing safe parameterized query for patient_id: {}", patient_id);

        let rows = db
            .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| {
                log::error!("SQL Error: {}", e);
                format!("Failed to fetch medical records: {}", e)
            })?;

        log::debug!("Got {} rows from database", rows.len());

        let mut records: Vec<MedicalRecord> = rows.iter().map(row_to_record).collect();

        log::debug!("Fetched {} records before search filter", records.len());

        // Cyrillic-safe search filter (SQLite LIKE is ASCII-only). Matches
        // the same two fields the old SQL LIKE covered (name, description).
        if let Some(ref f) = filter {
            if let Some(ref search_term) = f.search_term {
                let needle = search_term.trim().to_lowercase();
                if !needle.is_empty() {
                    records.retain(|r| {
                        r.name.to_lowercase().contains(&needle)
                            || r.description.to_lowercase().contains(&needle)
                    });
                }
            }
        }

        // Total is the filtered count; paginate the in-memory list.
        let total = records.len() as i64;
        let start = offset.max(0) as usize;
        let mut page_records: Vec<MedicalRecord> = records
            .into_iter()
            .skip(start)
            .take(page_size as usize)
            .collect();

        // Fetch attachments only for the records on this page.
        for record in page_records.iter_mut() {
            let attachments = Self::fetch_attachments(db, record.id).await.unwrap_or_default();
            record.attachments = if attachments.is_empty() { None } else { Some(attachments) };
        }

        log::debug!("Returning {} of {} records (page {})", page_records.len(), total, page);

        Ok(MedicalRecordsResponse {
            records: page_records,
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
                 FROM medical_attachments WHERE medical_record_id = ? AND deleted_at IS NULL",
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
                &format!("SELECT {} FROM medical_records WHERE id = ?", RECORD_COLUMNS),
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch medical record: {}", e))?
            .ok_or("Medical record not found".to_string())?;

        // Get line items using the LineItemService
        let line_items = crate::services::line_item::LineItemService::get_line_items_for_record(db, record_id)
            .await
            .unwrap_or_default();

        let mut record = row_to_record(&row);
        record.line_items = if line_items.is_empty() { None } else { Some(line_items) };

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

    /// Write a new record, its line items and its first history row.
    pub async fn save_new_record(
        db: &DatabaseConnection,
        input: CreateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        let now = Utc::now();
        let txn = db.begin().await.map_err(|e| format!("Failed to start saving the record: {}", e))?;

        // Development: do not populate procedure_name; use name as the single source of truth
        let procedure_name: Option<String> = None;

        let result = txn
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO medical_records \
                 (patient_id, record_type, name, procedure_name, description, \
                  prescription_notes, price, currency_id, discount_percent, manual_total, \
                  is_archived, version, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)",
                [
                    input.patient_id.into(),
                    input.record_type.clone().into(),
                    input.name.clone().into(),
                    procedure_name.clone().into(),
                    input.description.clone().into(),
                    input.prescription_notes.clone().into(),
                    input.price.into(),
                    input.currency_id.into(),
                    input.discount_percent.into(),
                    input.manual_total.into(),
                    now.to_rfc3339().into(),
                    now.to_rfc3339().into(),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to create medical record: {}", e))?;

        let id = result.last_insert_id() as i64;

        // Create line items if provided
        let line_items = if let Some(items) = input.line_items.clone() {
            if !items.is_empty() {
                let created_items = crate::services::line_item::LineItemService::create_line_items_for_record_in(&txn, id, items)
                    .await
                    .map_err(|e| format!("Failed to create line items: {}", e))?;
                Some(created_items)
            } else {
                None
            }
        } else {
            None
        };

        let record = MedicalRecord {
            id,
            patient_id: input.patient_id,
            record_type: input.record_type,
            name: input.name,
            procedure_name,
            description: input.description,
            prescription_notes: input.prescription_notes,
            price: input.price,
            currency_id: input.currency_id,
            discount_percent: input.discount_percent,
            manual_total: input.manual_total,
            invoice_number: None,
            is_archived: false,
            version: 1,
            created_at: now,
            updated_at: now,
            created_by: None,
            updated_by: None,
            attachments: None,
            line_items,
        };

        // Insert initial snapshot into history (version 1)
        let new_snapshot = serde_json::json!({
            "record_type": record.record_type,
            "name": record.name,
            "procedure_name": record.procedure_name,
            "description": record.description,
            "prescription_notes": record.prescription_notes,
            "price": record.price,
            "currency_id": record.currency_id,
            "discount_percent": record.discount_percent,
            "manual_total": record.manual_total,
            "is_archived": record.is_archived
        });

        txn
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
            .await
            .map_err(|e| format!("Failed to write record history: {}", e))?;

        txn.commit().await.map_err(|e| format!("Failed to save the record: {}", e))?;

        log::debug!("History snapshot insert (create): rec_id={}, version=1, fields=created, new={}", id, new_snapshot);

        Ok(record)
    }

    pub async fn create_medical_record(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        input: CreateMedicalRecordInput,
    ) -> Result<SavedMedicalRecord, String> {
        let record = Self::save_new_record(db, input.clone()).await?;
        let pdfs = match PdfEnv::from_app(app_handle) {
            Ok(env) => {
                let mut pdfs = Vec::new();
                if let Some(device) = Self::generate_device_report(&env, db, &record, &input).await {
                    pdfs.push(device);
                }
                pdfs.extend(Self::generate_record_documents(&env, db, &record).await);
                pdfs
            }
            Err(e) => Self::unavailable_documents(db, &record, &e).await,
        };
        Ok(SavedMedicalRecord { record, pdfs })
    }

    /// Every document the record would get, marked failed with `error`
    /// (no JAR, no storage folder).
    async fn unavailable_documents(db: &DatabaseConnection, record: &MedicalRecord, error: &str) -> Vec<PdfStatus> {
        log::error!("❌ Record {} documents can't be made: {}", record.id, error);
        let mut statuses = Vec::new();
        for kind in DOCUMENT_KINDS {
            if Self::document_applies(db, record, kind).await.unwrap_or(true) {
                statuses.push(PdfStatus::failed(kind, error));
            }
        }
        statuses
    }

    /// The lab report for device results sent with a new record, if any.
    pub(crate) async fn generate_device_report(
        env: &PdfEnv,
        db: &DatabaseConnection,
        record: &MedicalRecord,
        input: &CreateMedicalRecordInput,
    ) -> Option<PdfStatus> {
        use crate::services::device_pdf_service::DeviceTestData;

        let mut devices: Vec<DeviceTestData> = input
            .device_data_list
            .iter()
            .flatten()
            .map(|d| DeviceTestData {
                device_type: d.device_type.clone(),
                device_name: d.device_name.clone(),
                test_results: d.device_test_data.clone(),
                detected_at: record.created_at,
                patient_identifier: None,
            })
            .collect();
        if let (Some(results), Some(device_type), Some(device_name)) =
            (&input.device_test_data, &input.device_type, &input.device_name)
        {
            devices.push(DeviceTestData {
                device_type: device_type.clone(),
                device_name: device_name.clone(),
                test_results: results.clone(),
                detected_at: record.created_at,
                patient_identifier: None,
            });
        }
        if devices.is_empty() {
            return None;
        }

        let result = async {
            let patient_data = Self::get_patient_for_pdf(db, record.patient_id).await?;
            let identifier = Some(patient_data.microchip_id.clone().unwrap_or_else(|| patient_data.name.clone()));
            for device in devices.iter_mut() {
                device.patient_identifier = identifier.clone();
            }
            Self::generate_and_save_pdfs_multi(env, db, record.id, &patient_data, &devices).await
        }
        .await;
        Some(match result {
            Ok(()) => PdfStatus::ok("device_report"),
            Err(e) => {
                log::error!("❌ Device report for record {} failed: {}", record.id, e);
                PdfStatus::failed("device_report", e)
            }
        })
    }

    /// Sanitize a string for inclusion in a PDF filename:
    /// - replaces path separators and reserved characters with `_`
    /// - collapses control characters
    /// - trims leading/trailing whitespace and dots (Windows hates
    ///   trailing dots in particular)
    /// - truncates to 60 chars so very long titles / patient names
    ///   don't blow past common filesystem path-length limits when
    ///   combined with the rest of the filename
    fn sanitize_filename_part(s: &str) -> String {
        let cleaned: String = s
            .chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                c if c.is_control() => '_',
                c => c,
            })
            .collect();
        let trimmed = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
        if trimmed.chars().count() > 60 {
            trimmed.chars().take(60).collect::<String>().trim_end().to_string()
        } else {
            trimmed.to_string()
        }
    }

    /// Format the current local time as `YYYY-MM-DD HH-MM` for use
    /// in filenames. We avoid colons (Windows-illegal), use spaces
    /// only between date and time (most file browsers handle those
    /// fine), and skip seconds — minute resolution is more than
    /// enough for human filenames.
    fn pdf_timestamp() -> String {
        chrono::Local::now().format("%Y-%m-%d %H-%M").to_string()
    }

    /// Generate a simple report PDF using the template with medical record title and description
    async fn generate_simple_report_pdf(
        env: &PdfEnv,
        db: &DatabaseConnection,
        medical_record_id: i64,
        record: &MedicalRecord,
    ) -> Result<i64, String> {
        use crate::services::java_pdf_service::JavaPdfService;

        // Get patient and owner info for the report
        let patient_data = Self::get_patient_for_pdf(db, record.patient_id).await?;

        // Create reports directory
        let reports_dir = std::env::temp_dir().join("simple_reports");
        std::fs::create_dir_all(&reports_dir)
            .map_err(|e| format!("Failed to create reports directory: {}", e))?;

        // Build a user-friendly filename:
        //   "Medical Report - <Patient> - <Record Title> - <YYYY-MM-DD HH-MM>.pdf"
        // so the user can identify what they're looking at from the
        // file name alone, both inside the app and when the file is
        // downloaded / printed externally.
        let patient_part = Self::sanitize_filename_part(&patient_data.name);
        let title_part = Self::sanitize_filename_part(&record.name);
        let pdf_filename = format!(
            "Medical Report - {} - {} - {}.pdf",
            patient_part,
            title_part,
            Self::pdf_timestamp(),
        );
        let pdf_path = reports_dir.join(&pdf_filename);

        // Generate simple report PDF
        log::info!("📄 Calling Java to generate simple report PDF for record {}...", medical_record_id);
        let clinic = crate::services::settings::SettingsService::get_clinic_profile(db).await?;
        JavaPdfService::generate_simple_report(
            &env.jar_path,
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            &record.name,
            &record.description,
            Some(&patient_data),
            &clinic,
        )?;

        // Save PDF as attachment
        let attachment_id = Self::save_pdf_attachment(
            env,
            db,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Simple Report",
            "simple_report",
            "Template Report",
            "simple_report",  // Use different type so generate_configured_report won't delete it
        ).await?;

        let _ = std::fs::remove_file(&pdf_path);
        log::debug!("Simple report PDF generated and saved as attachment");
        Ok(attachment_id)
    }

    /// Generate a pharmacy note PDF with prescription text overlaid on the template
    async fn generate_pharmacy_note_pdf(
        env: &PdfEnv,
        db: &DatabaseConnection,
        medical_record_id: i64,
        record: &MedicalRecord,
    ) -> Result<i64, String> {
        use crate::services::java_pdf_service::JavaPdfService;

        let prescription_text = match &record.prescription_notes {
            Some(text) if !text.trim().is_empty() => text.clone(),
            _ => return Err("The record has no prescription to print".to_string()),
        };

        // Pull patient name for the filename — slightly redundant with
        // the simple-report generator's fetch, but cheap (single row)
        // and avoids restructuring the call sites to share patient
        // data across the three PDF generators.
        let patient_data = Self::get_patient_for_pdf(db, record.patient_id).await?;

        // Create pharmacy notes directory
        let reports_dir = std::env::temp_dir().join("pharmacy_notes");
        std::fs::create_dir_all(&reports_dir)
            .map_err(|e| format!("Failed to create pharmacy notes directory: {}", e))?;

        // "Pharmacy Note - <Patient> - <Record Title> - <YYYY-MM-DD HH-MM>.pdf"
        let patient_part = Self::sanitize_filename_part(&patient_data.name);
        let title_part = Self::sanitize_filename_part(&record.name);
        let pdf_filename = format!(
            "Pharmacy Note - {} - {} - {}.pdf",
            patient_part,
            title_part,
            Self::pdf_timestamp(),
        );
        let pdf_path = reports_dir.join(&pdf_filename);

        log::info!("📄 Calling Java to generate pharmacy note PDF for record {}...", medical_record_id);
        let clinic = crate::services::settings::SettingsService::get_clinic_profile(db).await?;
        JavaPdfService::generate_pharmacy_note(
            &env.jar_path,
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            &prescription_text,
            &clinic,
        )?;

        // Save PDF as attachment
        let attachment_id = Self::save_pdf_attachment(
            env,
            db,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Pharmacy Note",
            "pharmacy_note",
            "Pharmacy Note",
            "pharmacy_note",
        ).await?;

        let _ = std::fs::remove_file(&pdf_path);
        log::debug!("Pharmacy note PDF generated and saved as attachment");
        Ok(attachment_id)
    }

    /// The record's invoice totals, as on its invoice PDF: the saved lines
    /// and rates, the record's discount and the clinic's price mode.
    pub async fn invoice_totals_for_record(
        db: &DatabaseConnection,
        record_id: i64,
    ) -> Result<crate::services::money::InvoiceTotals, String> {
        let lines = crate::services::line_item::LineItemService::get_line_items_for_record(db, record_id).await?;
        let discount = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT discount_percent FROM medical_records WHERE id = ?",
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the discount: {}", e))?
            .and_then(|row| row_f64(&row, "discount_percent"));
        let clinic = crate::services::settings::SettingsService::get_clinic_profile(db).await?;
        Ok(Self::totals_of(&lines, discount, clinic.prices_include_vat))
    }

    fn totals_of(
        lines: &[crate::models::MedicalRecordLineItem],
        discount_percent: Option<f64>,
        prices_include_vat: bool,
    ) -> crate::services::money::InvoiceTotals {
        let money: Vec<crate::services::money::MoneyLine> = lines
            .iter()
            .map(|item| crate::services::money::MoneyLine {
                unit_price: item.unit_price,
                quantity: item.quantity,
                vat_percent: item.vat_percent,
                vat_label: item.vat_name.clone(),
            })
            .collect();
        crate::services::money::invoice_totals(&money, discount_percent, prices_include_vat)
    }

    /// The JSON job the JAR renders the record's invoice from. Assigns the
    /// invoice number and date on first use.
    #[cfg(test)]
    pub async fn invoice_job(db: &DatabaseConnection, record: &MedicalRecord) -> Result<serde_json::Value, String> {
        Ok(Self::invoice_job_parts(db, record).await?.0)
    }

    async fn invoice_job_parts(
        db: &DatabaseConnection,
        record: &MedicalRecord,
    ) -> Result<(serde_json::Value, Invoice, String), String> {
        use crate::services::java_pdf_service::JavaPdfService;
        use crate::services::line_item::LineItemService;

        let line_items = LineItemService::get_line_items_for_record(db, record.id).await?;
        if line_items.is_empty() {
            return Err("The record has no line items to invoice".to_string());
        }

        // Get patient/owner info for the recipient (ЗА) field
        let patient_data = Self::get_patient_for_pdf(db, record.patient_id).await?;
        let recipient = if patient_data.owner.is_empty() {
            patient_data.name.clone()
        } else {
            patient_data.owner.clone()
        };

        let invoice = Self::assign_invoice(db, record.id, chrono::Local::now()).await?;
        let clinic = crate::services::settings::SettingsService::get_clinic_profile(db).await?;
        let totals = Self::totals_of(&line_items, record.discount_percent, clinic.prices_include_vat);
        let job = JavaPdfService::invoice_json(
            &invoice.date.format("%d/%m/%Y").to_string(),
            &invoice.number,
            &recipient,
            &line_items,
            record.discount_percent.unwrap_or(0.0),
            "ден",
            &totals,
            &clinic,
        );
        Ok((job, invoice, recipient))
    }

    /// Generate an invoice PDF from medical record line items
    async fn generate_invoice_pdf(
        env: &PdfEnv,
        db: &DatabaseConnection,
        medical_record_id: i64,
        record: &MedicalRecord,
    ) -> Result<i64, String> {
        use crate::services::java_pdf_service::JavaPdfService;

        let (job, invoice, recipient) = Self::invoice_job_parts(db, record).await?;

        // Create invoice directory
        let reports_dir = std::env::temp_dir().join("invoices");
        std::fs::create_dir_all(&reports_dir)
            .map_err(|e| format!("Failed to create invoices directory: {}", e))?;

        // "Invoice <Number> - <Recipient> - <YYYY-MM-DD>.pdf"
        // Invoice numbers like "042/2025" contain a slash, which we
        // sanitize to "_" via sanitize_filename_part — so the on-disk
        // form becomes "Invoice 042_2025 - John Petrov - 2026-05-24.pdf".
        // The original "042/2025" string is still what's stored in
        // medical_records.invoice_number and printed on the PDF body.
        let invoice_part = Self::sanitize_filename_part(&invoice.number);
        let recipient_part = Self::sanitize_filename_part(&recipient);
        let pdf_filename = format!(
            "Invoice {} - {} - {}.pdf",
            invoice_part,
            recipient_part,
            invoice.date.format("%Y-%m-%d"),
        );
        let pdf_path = reports_dir.join(&pdf_filename);

        log::info!("📄 Generating invoice PDF for record {}...", medical_record_id);
        JavaPdfService::generate_invoice(
            &env.jar_path,
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            job,
        )?;

        // Save PDF as attachment
        let attachment_id = Self::save_pdf_attachment(
            env,
            db,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Invoice",
            "invoice",
            "Invoice",
            "invoice",
        ).await?;

        let _ = std::fs::remove_file(&pdf_path);
        log::info!("✅ Invoice PDF generated and saved for record {}", medical_record_id);
        Ok(attachment_id)
    }

    /// Helper to get patient data for PDF generation
    pub(crate) async fn get_patient_for_pdf(
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
    pub(crate) async fn generate_and_save_pdfs_multi(
        env: &PdfEnv,
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

        // Build the device-report filename. Single device: include the
        // device name explicitly so the user can tell which analyzer
        // a report came from. Multiple devices: collapse to "Device
        // Report - <Patient> - <date>" since listing every device
        // name would blow the filename length budget on a typical
        // batch import.
        let patient_part = Self::sanitize_filename_part(&patient_data.name);
        let pdf_filename = if device_data_list.len() == 1 {
            let device = &device_data_list[0];
            let device_part = Self::sanitize_filename_part(&device.device_name);
            format!(
                "Device Report - {} - {} - {}.pdf",
                patient_part,
                device_part,
                Self::pdf_timestamp(),
            )
        } else {
            format!(
                "Device Report - {} - {}.pdf",
                patient_part,
                Self::pdf_timestamp(),
            )
        };
        let pdf_path = reports_dir.join(&pdf_filename);

        // Generate Java PDF with all devices
        log::debug!("Generating combined PDF report using Java...");
        let clinic = crate::services::settings::SettingsService::get_clinic_profile(db).await?;
        JavaPdfService::generate_pdf_multi_with_clinic(
            &env.jar_path,
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            patient_data,
            device_data_list,
            Some(&clinic),
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
        let attachment_id = Self::save_pdf_attachment(
            env,
            db,
            medical_record_id,
            &pdf_path,
            &pdf_filename,
            "Device Test Report",
            device_type_str,
            device_name_str,
            "generated_pdf",  // This can be replaced by generate_configured_report
        ).await?;

        let _ = std::fs::remove_file(&pdf_path);
        log::debug!("PDF report generated and saved as attachment {}", attachment_id);
        Ok(())
    }

    /// Save a PDF file as an attachment to a medical record
    async fn save_pdf_attachment(
        env: &PdfEnv,
        db: &DatabaseConnection,
        medical_record_id: i64,
        pdf_path: &std::path::Path,
        filename: &str,
        pdf_type: &str,
        device_type: &str,
        device_name: &str,
        attachment_type: &str,
    ) -> Result<i64, String> {
        use uuid::Uuid;

        // Read PDF file
        let pdf_bytes = std::fs::read(pdf_path)
            .map_err(|e| format!("Failed to read {} PDF: {}", pdf_type, e))?;

        // Generate unique file ID
        let file_id = Uuid::new_v4().to_string();

        let storage_dir = &env.storage_dir;

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
        let inserted = db.execute(Statement::from_sql_and_values(
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
                attachment_type.into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to create attachment record: {}", e))?;

        log::debug!("Saved {} PDF attachment: {} (file_id: {})", pdf_type, filename, file_id);

        Ok(inserted.last_insert_id() as i64)
    }

    /// Apply an edit: the record's fields, its line items and a history row.
    pub async fn save_record_changes(
        db: &DatabaseConnection,
        record_id: i64,
        updates: UpdateMedicalRecordInput,
    ) -> Result<MedicalRecord, String> {
        let now = Utc::now();
        let txn = db.begin().await.map_err(|e| format!("Failed to start saving the record: {}", e))?;

        // Fetch current record for diffing/history
        let old_row = txn
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &format!("SELECT {} FROM medical_records WHERE id = ?", RECORD_COLUMNS),
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
        if let Some(ref prescription_notes) = updates.prescription_notes {
            update_parts.push("prescription_notes = ?");
            params.push(prescription_notes.clone().into());
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
        match &updates.discount_percent {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                update_parts.push("discount_percent = ?");
                params.push(Value::Double(None));
            },
            MaybeNull::Value(v) => {
                update_parts.push("discount_percent = ?");
                params.push((*v).into());
            },
        }
        match &updates.manual_total {
            MaybeNull::Undefined => {},
            MaybeNull::Null => {
                update_parts.push("manual_total = ?");
                params.push(Value::Double(None));
            },
            MaybeNull::Value(v) => {
                update_parts.push("manual_total = ?");
                params.push((*v).into());
            },
        }
        if let Some(is_archived) = updates.is_archived {
            update_parts.push("is_archived = ?");
            params.push((if is_archived { 1i32 } else { 0i32 }).into());
        }

        // Check if we have line items to update (this counts as an update even if no other fields change)
        let has_line_items_update = updates.line_items.is_some();

        if update_parts.is_empty() && !has_line_items_update {
            return Err("No fields to update".to_string());
        }

        // Only run SQL update if there are record fields to update
        if !update_parts.is_empty() {
            update_parts.push("updated_at = ?");
            params.push(now.to_rfc3339().into());

            update_parts.push("version = version + 1");

            // Add record_id at the end for WHERE clause
            params.push(record_id.into());

            let query = format!(
                "UPDATE medical_records SET {} WHERE id = ?",
                update_parts.join(", ")
            );

            txn.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &query, params))
                .await
                .map_err(|e| format!("Failed to update medical record: {}", e))?;
        }

        // Handle line items replacement if provided
        let line_items = if let Some(items) = updates.line_items {
            let replaced_items = crate::services::line_item::LineItemService::replace_line_items_for_record_in(&txn, record_id, items)
                .await
                .map_err(|e| format!("Failed to update line items: {}", e))?;
            if replaced_items.is_empty() { None } else { Some(replaced_items) }
        } else {
            // Fetch existing line items
            let existing = crate::services::line_item::LineItemService::get_line_items_for_record_in(&txn, record_id)
                .await
                .unwrap_or_default();
            if existing.is_empty() { None } else { Some(existing) }
        };

        // Fetch the updated record
        let row = txn
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &format!("SELECT {} FROM medical_records WHERE id = ?", RECORD_COLUMNS),
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch updated medical record: {}", e))?
            .ok_or("Updated record not found".to_string())?;

        let mut updated_record = row_to_record(&row);
        updated_record.line_items = line_items;

        // Build full snapshot history entry
        // Old snapshot
        let old_is_archived_int: i64 = old_row.try_get("", "is_archived").unwrap_or(0);
        let old_is_archived = old_is_archived_int != 0;
        let old_price: Option<f64> = old_row.try_get::<i64>("", "price")
            .ok()
            .map(|i| i as f64)
            .or_else(|| old_row.try_get::<f64>("", "price").ok());
        // Handle old discount_percent and manual_total as either integer or float
        let old_discount_percent: Option<f64> = old_row.try_get::<i64>("", "discount_percent")
            .ok()
            .map(|i| i as f64)
            .or_else(|| old_row.try_get::<f64>("", "discount_percent").ok());
        let old_manual_total: Option<f64> = old_row.try_get::<i64>("", "manual_total")
            .ok()
            .map(|i| i as f64)
            .or_else(|| old_row.try_get::<f64>("", "manual_total").ok());

        let old_snapshot = json!({
            "record_type": old_row.try_get::<String>("", "record_type").unwrap_or_default(),
            "name": old_row.try_get::<String>("", "name").ok(),
            "procedure_name": old_row.try_get::<String>("", "procedure_name").ok(),
            "description": old_row.try_get::<String>("", "description").ok(),
            "prescription_notes": old_row.try_get::<String>("", "prescription_notes").ok(),
            "price": old_price,
            "currency_id": old_row.try_get::<i64>("", "currency_id").ok(),
            "discount_percent": old_discount_percent,
            "manual_total": old_manual_total,
            "is_archived": old_is_archived
        });

        // New snapshot from updated_record
        let new_snapshot = json!({
            "record_type": updated_record.record_type,
            "name": updated_record.name,
            "procedure_name": updated_record.procedure_name,
            "description": updated_record.description,
            "prescription_notes": updated_record.prescription_notes,
            "price": updated_record.price,
            "currency_id": updated_record.currency_id,
            "discount_percent": updated_record.discount_percent,
            "manual_total": updated_record.manual_total,
            "is_archived": updated_record.is_archived
        });

        // Compute changed fields list
        let mut changed_fields: Vec<&str> = Vec::new();
        if old_snapshot.get("record_type") != new_snapshot.get("record_type") { changed_fields.push("record_type"); }
        if old_snapshot.get("name") != new_snapshot.get("name") { changed_fields.push("name"); }
        if old_snapshot.get("procedure_name") != new_snapshot.get("procedure_name") { changed_fields.push("procedure_name"); }
        if old_snapshot.get("description") != new_snapshot.get("description") { changed_fields.push("description"); }
        if old_snapshot.get("prescription_notes") != new_snapshot.get("prescription_notes") { changed_fields.push("prescription_notes"); }
        if old_snapshot.get("price") != new_snapshot.get("price") { changed_fields.push("price"); }
        if old_snapshot.get("currency_id") != new_snapshot.get("currency_id") { changed_fields.push("currency_id"); }
        if old_snapshot.get("discount_percent") != new_snapshot.get("discount_percent") { changed_fields.push("discount_percent"); }
        if old_snapshot.get("manual_total") != new_snapshot.get("manual_total") { changed_fields.push("manual_total"); }
        if old_snapshot.get("is_archived") != new_snapshot.get("is_archived") { changed_fields.push("is_archived"); }

        log::debug!("History snapshot insert (update): rec_id={}, version={}, fields={}", record_id, updated_record.version, changed_fields.join(","));
        txn
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
            .await
            .map_err(|e| format!("Failed to write record history: {}", e))?;

        txn.commit().await.map_err(|e| format!("Failed to save the record: {}", e))?;

        Ok(updated_record)
    }

    pub async fn update_medical_record(
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        record_id: i64,
        updates: UpdateMedicalRecordInput,
    ) -> Result<SavedMedicalRecord, String> {
        let record = Self::save_record_changes(db, record_id, updates).await?;
        let pdfs = match PdfEnv::from_app(app_handle) {
            Ok(env) => Self::generate_record_documents(&env, db, &record).await,
            Err(e) => Self::unavailable_documents(db, &record, &e).await,
        };
        Ok(SavedMedicalRecord { record, pdfs })
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
        // Fetch the patient's records, then filter by search_term in Rust
        // with Unicode-aware to_lowercase(). SQLite LIKE only folds ASCII,
        // so a Cyrillic search term wouldn't match Cyrillic record text
        // differing only in case. The candidate set is bounded to one
        // patient's records (small), so the in-memory filter is cheap.
        let needle = search_term.trim().to_lowercase();

        let mut sql = format!("SELECT {} FROM medical_records WHERE patient_id = ?", RECORD_COLUMNS);

        if !include_archived {
            sql.push_str(" AND is_archived = 0");
        }

        sql.push_str(" ORDER BY created_at DESC");

        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                [
                    patient_id.into(),
                ],
            ))
            .await
            .map_err(|e| format!("Failed to search medical records: {}", e))?;

        let records = rows
            .iter()
            .map(row_to_record)
            .filter(|r| {
                // Unicode-aware substring match across name, description and
                // procedure_name. An empty needle matches everything.
                needle.is_empty()
                    || r.name.to_lowercase().contains(&needle)
                    || r.description.to_lowercase().contains(&needle)
                    || r.procedure_name
                        .as_deref()
                        .is_some_and(|p| p.to_lowercase().contains(&needle))
            })
            .collect();
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
                &format!("SELECT {} FROM medical_records WHERE id = ?", RECORD_COLUMNS),
                [record_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch medical record: {}", e))?
            .ok_or("Medical record not found".to_string())?;

        let mut base = row_to_record(&row);

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
                if let Some(prn) = v.get("prescription_notes").and_then(|x| x.as_str()) { base.prescription_notes = Some(prn.to_string()); }
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
        app_handle: &tauri::AppHandle,
        db: &DatabaseConnection,
        record_id: i64,
    ) -> Result<SavedMedicalRecord, String> {
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
            prescription_notes: None,
            price: MaybeNull::Undefined,
            currency_id: MaybeNull::Undefined,
            discount_percent: MaybeNull::Undefined,
            manual_total: MaybeNull::Undefined,
            is_archived: None,
            line_items: None,
        };

        if let Some(v) = old_vals.get("name") { updates.name = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("procedure_name") { updates.procedure_name = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("description") { updates.description = v.as_str().map(|s| s.to_string()); }
        if let Some(v) = old_vals.get("prescription_notes") { updates.prescription_notes = v.as_str().map(|s| s.to_string()); }
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
        if let Some(v) = old_vals.get("discount_percent") {
            updates.discount_percent = match v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)) {
                Some(p) => MaybeNull::Value(p),
                None if v.is_null() => MaybeNull::Null,
                None => MaybeNull::Undefined,
            };
        }
        if let Some(v) = old_vals.get("manual_total") {
            updates.manual_total = match v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)) {
                Some(p) => MaybeNull::Value(p),
                None if v.is_null() => MaybeNull::Null,
                None => MaybeNull::Undefined,
            };
        }
        if let Some(v) = old_vals.get("is_archived") { updates.is_archived = v.as_bool(); }

        // If no fields present, abort
        if updates.name.is_none()
            && updates.procedure_name.is_none()
            && updates.description.is_none()
            && updates.prescription_notes.is_none()
            && matches!(updates.price, MaybeNull::Undefined)
            && matches!(updates.currency_id, MaybeNull::Undefined)
            && updates.is_archived.is_none() {
            return Err("No revertable fields in previous version".to_string());
        }

        Self::update_medical_record(app_handle, db, record_id, updates).await
    }
}
