//! Lab inbox: every result a machine sent, one `file_access_history` row each,
//! with a state of `waiting`, `attached` or `discarded`. Also attaching a
//! result to an existing record and moving one to another patient.

use crate::commands::device_input::resolve_patient;
use crate::services::device_parser::{DeviceParserService, EXIGO_PDF_ANALYTE_KEYS};
use crate::services::device_pdf_service::DeviceTestData;
use crate::services::medical_record::{MedicalRecordService, PdfEnv, PdfStatus};
use chrono::Utc;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait, Value};
use serde::Serialize;
use std::path::Path;

/// Reasons a result can be discarded with.
pub const DISCARD_REASONS: [&str; 4] = ["qc", "test", "duplicate", "other"];

/// Keys the parsers add next to the analytes that describe the sample, not a value.
const METADATA_KEYS: [&str; 20] = [
    "sample_id", "test_datetime", "patient_name", "patient_id", "patient_id_internal", "gender",
    "gender_alt", "sample_type", "species", "birth_date", "birth_date_alt", "test_code",
    "sending_application", "sending_facility", "message_datetime", "message_type", "hl7_version",
    "ID2", "SNO", "DATE",
];

/// Suffixes the HL7 parser uses for an analyte's extra fields.
const FIELD_SUFFIXES: [&str; 7] = ["_unit", "_range", "_flag", "_sample_type", "_curve", "_threshold", "_lot"];

/// One analyte as the machine reported it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabValue {
    pub code: String,
    pub value: String,
    pub unit: Option<String>,
    pub range: Option<String>,
    /// "H" above the range, "L" below it, None inside or unknown.
    pub flag: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabInboxItem {
    pub file_id: String,
    pub original_name: String,
    pub device_type: String,
    pub device_name: String,
    pub received_at: String,
    /// "ok", or "failed" when the bytes couldn't be read.
    pub status: String,
    pub error: Option<String>,
    pub state: String,
    pub discard_reason: Option<String>,
    pub discard_note: Option<String>,
    pub discarded_at: Option<String>,
    pub attached_record_id: Option<i64>,
    pub attached_record_name: Option<String>,
    pub attached_patient_id: Option<i64>,
    pub attached_patient_name: Option<String>,
    pub attached_at: Option<String>,
    /// The live lab attachment made from this result, if any.
    pub attachment_id: Option<i64>,
    /// What the machine said the patient was (chip, name or ID).
    pub machine_patient_id: Option<String>,
    /// "microchip" | "name" | "none"
    pub match_method: String,
    pub match_ambiguous: bool,
    pub match_candidates: u32,
    pub matched_patient_id: Option<i64>,
    pub matched_patient_name: Option<String>,
    pub values: Vec<LabValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveOutcome {
    pub attachment_id: i64,
    pub from_record_id: i64,
    pub to_record_id: i64,
    pub pdfs: Vec<PdfStatus>,
}

fn number(s: &str) -> Option<f64> {
    s.trim().replace(',', ".").parse().ok()
}

fn flag_from_range(value: &str, low: Option<&str>, high: Option<&str>) -> Option<String> {
    let v = number(value)?;
    if low.and_then(number).is_some_and(|l| v < l) {
        return Some("L".to_string());
    }
    if high.and_then(number).is_some_and(|h| v > h) {
        return Some("H".to_string());
    }
    None
}

fn split_range(range: &str) -> (Option<&str>, Option<&str>) {
    let range = range.trim();
    // Skip a leading sign so "-2-5" splits after the first number.
    let start = usize::from(range.starts_with('-'));
    match range[start..].find(['-', '–']) {
        Some(i) => {
            let at = start + i;
            let dash_len = range[at..].chars().next().map(char::len_utf8).unwrap_or(1);
            (Some(range[..at].trim()), Some(range[at + dash_len..].trim()))
        }
        None => (None, None),
    }
}

/// The machine's own H/L mark, read as "H", "L" or none.
fn normalize_flag(flag: &str) -> Option<String> {
    let f = flag.trim().to_ascii_uppercase();
    if f.starts_with('H') || f.contains('↑') || f == ">" {
        Some("H".to_string())
    } else if f.starts_with('L') || f.contains('↓') || f == "<" {
        Some("L".to_string())
    } else {
        None
    }
}

fn is_segment_field(key: &str) -> bool {
    let mut parts = key.splitn(2, '_');
    let (Some(seg), Some(idx)) = (parts.next(), parts.next()) else { return false };
    seg.len() == 3 && seg.chars().all(|c| c.is_ascii_uppercase()) && idx.chars().all(|c| c.is_ascii_digit())
}

pub(crate) fn is_analyte_key(key: &str) -> bool {
    !METADATA_KEYS.contains(&key)
        && !FIELD_SUFFIXES.iter().any(|s| key.ends_with(s))
        && !key.starts_with("field_")
        && !is_segment_field(key)
}

/// The analytes in a parsed result, with unit, range and H/L flag.
/// The machine dated the result more than 10 minutes after it arrived.
pub fn machine_clock_ahead(_machine: chrono::NaiveDateTime, _received: chrono::DateTime<Utc>) -> bool {
    false
}

pub fn lab_values(device_type: &str, test_results: &serde_json::Value) -> Vec<LabValue> {
    let Some(map) = test_results.as_object() else { return Vec::new() };
    let get = |k: &str| -> Option<String> {
        match map.get(k)? {
            serde_json::Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            serde_json::Value::Number(n) => Some(n.to_string()),
            _ => None,
        }
    };

    if device_type == "exigo_eos_vet" {
        return EXIGO_PDF_ANALYTE_KEYS
            .iter()
            .filter_map(|code| {
                let value = get(code)?;
                let low = get(&format!("{}_L", code));
                let high = get(&format!("{}_H", code));
                let range = match (&low, &high) {
                    (Some(l), Some(h)) => Some(format!("{}–{}", l, h)),
                    _ => None,
                };
                Some(LabValue {
                    code: code.to_string(),
                    flag: flag_from_range(&value, low.as_deref(), high.as_deref()),
                    unit: crate::services::lab_reference::exigo(code).and_then(|(_, r)| r.unit).map(str::to_string),
                    range,
                    value,
                })
            })
            .collect();
    }

    map.keys()
        .filter(|k| is_analyte_key(k))
        .filter_map(|code| {
            let value = get(code)?;
            let range = get(&format!("{}_range", code));
            let flag = match get(&format!("{}_flag", code)) {
                Some(f) => normalize_flag(&f),
                None => range.as_deref().and_then(|r| {
                    let (low, high) = split_range(r);
                    flag_from_range(&value, low, high)
                }),
            };
            Some(LabValue { code: code.clone(), unit: get(&format!("{}_unit", code)), range, flag, value })
        })
        .collect()
}

/// What the machine said the patient was.
fn machine_patient_id(identifier: Option<String>, results: &serde_json::Value) -> Option<String> {
    identifier.filter(|s| !s.trim().is_empty()).or_else(|| {
        ["patient_id_internal", "patient_name", "ID2"]
            .iter()
            .find_map(|k| results.get(k).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()).map(str::to_string))
    })
}

/// SQLite's CURRENT_TIMESTAMP is UTC without a zone; say so for the frontend.
fn as_utc(time: String) -> String {
    if time.len() == 19 && time.as_bytes()[10] == b' ' {
        format!("{}T{}Z", &time[..10], &time[11..])
    } else {
        time
    }
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

pub async fn list_inbox(db: &DatabaseConnection, state: Option<&str>) -> Result<Vec<LabInboxItem>, String> {
    let order = if state == Some("waiting") { "ASC" } else { "DESC" };
    let sql = format!(
        "SELECT fah.file_id, fah.original_name, fah.file_path, fah.device_type, fah.device_name, \
                fah.connection_method, fah.received_at, fah.status, fah.error, fah.inbox_state, \
                fah.discard_reason, fah.discard_note, fah.discarded_at, fah.attached_record_id, fah.attached_at, \
                mr.name AS record_name, mr.patient_id AS record_patient_id, p.name AS record_patient_name, \
                (SELECT ma.id FROM medical_attachments ma \
                 WHERE ma.source_file_id = fah.file_id AND ma.medical_record_id = fah.attached_record_id \
                   AND ma.deleted_at IS NULL ORDER BY ma.id DESC LIMIT 1) AS attachment_id \
         FROM file_access_history fah \
         LEFT JOIN medical_records mr ON mr.id = fah.attached_record_id \
         LEFT JOIN patients p ON p.id = mr.patient_id \
         WHERE (? IS NULL OR fah.inbox_state = ?) \
         ORDER BY fah.received_at {order}, fah.id {order} LIMIT 300"
    );
    let state_value = Value::String(state.map(|s| Box::new(s.to_string())));
    let rows = db
        .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, [state_value.clone(), state_value]))
        .await
        .map_err(|e| format!("Failed to load the lab inbox: {}", e))?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten();
        let file_path = text("file_path").unwrap_or_default();
        let device_type = text("device_type").unwrap_or_default();
        let device_name = text("device_name").unwrap_or_default();
        let original_name = text("original_name").unwrap_or_default();
        let status = text("status").unwrap_or_else(|| "ok".to_string());
        let item_state = text("inbox_state").unwrap_or_else(|| "waiting".to_string());

        let parsed = if status == "ok" {
            std::fs::read(&file_path).ok().and_then(|bytes| {
                DeviceParserService::parse_device_data(
                    &device_type,
                    &device_name,
                    &original_name,
                    &bytes,
                    text("connection_method").as_deref().unwrap_or("file_watch"),
                )
                .ok()
            })
        } else {
            None
        };
        let (values, machine_id) = match &parsed {
            Some(data) => (
                lab_values(&device_type, &data.test_results),
                machine_patient_id(data.patient_identifier.clone(), &data.test_results),
            ),
            None => (Vec::new(), None),
        };

        let mut item = LabInboxItem {
            file_id: text("file_id").unwrap_or_default(),
            original_name,
            device_type,
            device_name,
            received_at: as_utc(text("received_at").unwrap_or_default()),
            status,
            error: text("error"),
            state: item_state,
            discard_reason: text("discard_reason"),
            discard_note: text("discard_note"),
            discarded_at: text("discarded_at"),
            attached_record_id: row.try_get::<Option<i64>>("", "attached_record_id").ok().flatten(),
            attached_record_name: text("record_name"),
            attached_patient_id: row.try_get::<Option<i64>>("", "record_patient_id").ok().flatten(),
            attached_patient_name: text("record_patient_name"),
            attached_at: text("attached_at").map(as_utc),
            attachment_id: row.try_get::<Option<i64>>("", "attachment_id").ok().flatten(),
            machine_patient_id: machine_id.clone(),
            match_method: "none".to_string(),
            match_ambiguous: false,
            match_candidates: 0,
            matched_patient_id: None,
            matched_patient_name: None,
            values,
        };
        if item.state == "waiting" {
            if let Some(id) = machine_id {
                match resolve_patient(db, id).await {
                    Ok(m) => {
                        item.match_method = m.method;
                        item.match_ambiguous = m.ambiguous;
                        item.match_candidates = m.candidate_count;
                        if !m.ambiguous {
                            item.matched_patient_id = m.patient.as_ref().map(|p| p.id);
                            item.matched_patient_name = m.patient.and_then(|p| p.name);
                        }
                    }
                    Err(e) => log::warn!("Lab inbox: could not match {}: {}", item.file_id, e),
                }
            }
        }
        items.push(item);
    }
    Ok(items)
}

pub async fn waiting_count(db: &DatabaseConnection) -> Result<i64, String> {
    let row = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS n FROM file_access_history WHERE inbox_state = 'waiting'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to count waiting lab results: {}", e))?;
    Ok(row.and_then(|r| r.try_get::<i64>("", "n").ok()).unwrap_or(0))
}

pub async fn discard(db: &DatabaseConnection, file_id: &str, reason: &str, note: Option<String>) -> Result<(), String> {
    if !DISCARD_REASONS.contains(&reason) {
        return Err(format!("Unknown discard reason: {}", reason));
    }
    let note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE file_access_history SET inbox_state = 'discarded', discard_reason = ?, discard_note = ?, discarded_at = ? \
             WHERE file_id = ? AND inbox_state = 'waiting'",
            [reason.into(), Value::String(note.map(Box::new)), now().into(), file_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to discard the lab result: {}", e))?;
    if result.rows_affected() == 0 {
        return Err("Only a waiting lab result can be discarded".to_string());
    }
    Ok(())
}

pub async fn restore(db: &DatabaseConnection, file_id: &str) -> Result<(), String> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE file_access_history SET inbox_state = 'waiting', discard_reason = NULL, discard_note = NULL, discarded_at = NULL \
             WHERE file_id = ? AND inbox_state = 'discarded'",
            [file_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to restore the lab result: {}", e))?;
    if result.rows_affected() == 0 {
        return Err("Only a discarded lab result can be restored".to_string());
    }
    Ok(())
}

/// Mark a result attached to `record_id`, and link the attachment made from it.
pub async fn mark_attached(
    db: &DatabaseConnection,
    file_id: &str,
    record_id: i64,
    attachment_id: Option<i64>,
) -> Result<(), String> {
    let method = match_method_for(db, file_id, record_id).await;
    set_attached(db, file_id, record_id, attachment_id, &method).await
}

/// How the result reached the record's patient: the matcher's `microchip` or
/// `name` when it matched that patient, else `manual` (a person picked them).
async fn match_method_for(db: &DatabaseConnection, file_id: &str, record_id: i64) -> String {
    const MANUAL: &str = "manual";
    let row = match db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT h.file_path, h.device_type, h.device_name, h.original_name, h.connection_method, h.status, \
                    r.patient_id AS record_patient_id \
             FROM file_access_history h, medical_records r WHERE h.file_id = ? AND r.id = ?",
            [file_id.into(), record_id.into()],
        ))
        .await
    {
        Ok(Some(row)) => row,
        _ => return MANUAL.to_string(),
    };
    let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten().unwrap_or_default();
    let record_patient = row.try_get::<Option<i64>>("", "record_patient_id").ok().flatten();
    if text("status") == "failed" {
        return MANUAL.to_string();
    }
    let Some(parsed) = std::fs::read(text("file_path")).ok().and_then(|bytes| {
        DeviceParserService::parse_device_data(
            &text("device_type"),
            &text("device_name"),
            &text("original_name"),
            &bytes,
            &text("connection_method"),
        )
        .ok()
    }) else {
        return MANUAL.to_string();
    };
    let Some(machine_id) = machine_patient_id(parsed.patient_identifier.clone(), &parsed.test_results) else {
        return MANUAL.to_string();
    };
    match resolve_patient(db, machine_id).await {
        Ok(m) if !m.ambiguous && m.patient.as_ref().map(|p| p.id) == record_patient && record_patient.is_some() => m.method,
        _ => MANUAL.to_string(),
    }
}

async fn set_attached<C: ConnectionTrait>(
    db: &C,
    file_id: &str,
    record_id: i64,
    attachment_id: Option<i64>,
    match_method: &str,
) -> Result<(), String> {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE file_access_history SET inbox_state = 'attached', attached_record_id = ?, attached_at = ?, \
             discard_reason = NULL, discard_note = NULL, discarded_at = NULL, match_method = ? \
         WHERE file_id = ?",
        [record_id.into(), now().into(), match_method.into(), file_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to mark the lab result attached: {}", e))?;
    if let Some(id) = attachment_id {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE medical_attachments SET source_file_id = ? WHERE id = ?",
            [file_id.into(), id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to link the lab attachment: {}", e))?;
    }
    Ok(())
}

async fn record_exists(db: &DatabaseConnection, record_id: i64) -> Result<bool, String> {
    Ok(db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id FROM medical_records WHERE id = ?",
            [record_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the record: {}", e))?
        .is_some())
}

fn copy_into_storage(storage_dir: &Path, bytes: &[u8]) -> Result<String, String> {
    std::fs::create_dir_all(storage_dir).map_err(|e| format!("Failed to create the storage folder: {}", e))?;
    let stored_id = uuid::Uuid::new_v4().to_string();
    std::fs::write(storage_dir.join(&stored_id), bytes).map_err(|e| format!("Failed to store the lab result: {}", e))?;
    Ok(stored_id)
}

#[allow(clippy::too_many_arguments)]
async fn insert_lab_attachment<C: ConnectionTrait>(
    db: &C,
    record_id: i64,
    stored_id: &str,
    original_name: &str,
    size: i64,
    mime_type: Option<String>,
    device_type: Option<String>,
    device_name: Option<String>,
    connection_method: Option<String>,
    source_file_id: Option<String>,
) -> Result<i64, String> {
    let result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, \
             device_type, device_name, connection_method, attachment_type, source_file_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'test_result', ?)",
            [
                record_id.into(),
                stored_id.into(),
                original_name.into(),
                size.into(),
                Value::String(Some(Box::new(mime_type.unwrap_or_else(|| "application/octet-stream".to_string())))),
                now().into(),
                Value::String(device_type.map(Box::new)),
                Value::String(device_name.map(Box::new)),
                Value::String(connection_method.map(Box::new)),
                Value::String(source_file_id.map(Box::new)),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to save the lab attachment: {}", e))?;
    Ok(result.last_insert_id() as i64)
}

/// Add a received result to a record as a lab attachment (keeping its device
/// type, so the lab report can be built) and mark it attached.
pub async fn attach_to_record(
    db: &DatabaseConnection,
    storage_dir: &Path,
    file_id: &str,
    record_id: i64,
) -> Result<i64, String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT original_name, file_path, mime_type, device_type, device_name, connection_method, status \
             FROM file_access_history WHERE file_id = ?",
            [file_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the lab result: {}", e))?
        .ok_or("Lab result not found".to_string())?;
    let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten();
    if text("status").as_deref() == Some("failed") {
        return Err("This result could not be read, so it can't be attached as a lab result".to_string());
    }
    if !record_exists(db, record_id).await? {
        return Err("Medical record not found".to_string());
    }
    let bytes = std::fs::read(text("file_path").unwrap_or_default())
        .map_err(|e| format!("Failed to read the stored lab result: {}", e))?;
    let match_method = match_method_for(db, file_id, record_id).await;
    let stored_id = copy_into_storage(storage_dir, &bytes)?;

    let txn = db.begin().await.map_err(|e| format!("Failed to start attaching: {}", e))?;
    let attachment_id = insert_lab_attachment(
        &txn,
        record_id,
        &stored_id,
        &text("original_name").unwrap_or_default(),
        bytes.len() as i64,
        text("mime_type"),
        text("device_type"),
        text("device_name"),
        text("connection_method"),
        Some(file_id.to_string()),
    )
    .await?;
    set_attached(&txn, file_id, record_id, Some(attachment_id), &match_method).await?;
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE file_access_history SET first_attached_to_record_id = COALESCE(first_attached_to_record_id, ?), \
             first_attached_at = COALESCE(first_attached_at, ?), attachment_count = attachment_count + 1, last_accessed_at = ? \
         WHERE file_id = ?",
        [record_id.into(), now().into(), now().into(), file_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to update the file history: {}", e))?;
    txn.commit().await.map_err(|e| format!("Failed to attach the lab result: {}", e))?;
    if let Err(e) = crate::services::lab_results::index_attachment(db, storage_dir, attachment_id).await {
        log::warn!("Lab values of attachment {} not stored: {}", attachment_id, e);
    }
    Ok(attachment_id)
}

const LAB_ATTACHMENTS_SQL: &str = "SELECT id, file_id, original_name, device_type, device_name, connection_method \
     FROM medical_attachments \
     WHERE medical_record_id = ? AND deleted_at IS NULL \
       AND device_type IS NOT NULL AND device_name IS NOT NULL \
       AND (attachment_type = 'test_result' \
            OR (attachment_type != 'generated_pdf' AND mime_type != 'application/pdf'))";

/// Build the record's lab report from all its lab results, and retire the
/// earlier lab reports once the new one is stored. Returns the new report's id.
pub async fn regenerate_lab_report(env: &PdfEnv, db: &DatabaseConnection, record_id: i64) -> Result<i64, String> {
    let rows = db
        .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, LAB_ATTACHMENTS_SQL, [record_id.into()]))
        .await
        .map_err(|e| format!("Failed to read the record's lab results: {}", e))?;
    if rows.is_empty() {
        return Err("No device data attachments found for this medical record.".to_string());
    }
    let patient_row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT patient_id FROM medical_records WHERE id = ?",
            [record_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the record: {}", e))?
        .ok_or("Medical record not found".to_string())?;
    let patient_id: i64 = patient_row.try_get("", "patient_id").map_err(|e| e.to_string())?;
    let patient = MedicalRecordService::get_patient_for_pdf(db, patient_id).await?;
    let detected_at = MedicalRecordService::record_time(db, record_id).await?;
    let identifier = Some(patient.microchip_id.clone().unwrap_or_else(|| patient.name.clone()));

    let mut devices = Vec::new();
    for row in &rows {
        let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten().unwrap_or_default();
        let bytes = match std::fs::read(env.storage_dir.join(text("file_id"))) {
            Ok(b) => b,
            Err(e) => {
                log::warn!("Lab report for record {}: could not read {}: {}", record_id, text("original_name"), e);
                continue;
            }
        };
        let connection = row.try_get::<Option<String>>("", "connection_method").ok().flatten().unwrap_or_else(|| "unknown".to_string());
        match DeviceParserService::parse_device_data(&text("device_type"), &text("device_name"), &text("original_name"), &bytes, &connection) {
            Ok(parsed) => devices.push(DeviceTestData {
                device_type: parsed.device_type,
                device_name: parsed.device_name,
                test_results: parsed.test_results,
                detected_at,
                patient_identifier: identifier.clone(),
            }),
            Err(e) => log::warn!("Lab report for record {}: could not read {}: {}", record_id, text("original_name"), e),
        }
    }
    if devices.is_empty() {
        return Err("Could not parse any device data from test_result attachments.".to_string());
    }

    MedicalRecordService::generate_and_save_pdfs_multi(env, db, record_id, &patient, &devices).await?;
    let newest = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT MAX(id) AS id FROM medical_attachments \
             WHERE medical_record_id = ? AND attachment_type = 'generated_pdf' AND deleted_at IS NULL",
            [record_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to find the new lab report: {}", e))?
        .and_then(|r| r.try_get::<Option<i64>>("", "id").ok().flatten())
        .ok_or("The new lab report was not stored".to_string())?;
    retire_lab_reports(db, record_id, Some(newest)).await?;
    Ok(newest)
}

async fn retire_lab_reports<C: ConnectionTrait>(db: &C, record_id: i64, keep: Option<i64>) -> Result<(), String> {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE medical_attachments SET deleted_at = ? \
         WHERE medical_record_id = ? AND attachment_type = 'generated_pdf' AND deleted_at IS NULL AND id != ?",
        [now().into(), record_id.into(), keep.unwrap_or(-1).into()],
    ))
    .await
    .map_err(|e| format!("Failed to retire the old lab report: {}", e))?;
    Ok(())
}

fn pdf_status(kind: &str, result: Result<i64, String>) -> PdfStatus {
    match result {
        Ok(_) => PdfStatus::ok(kind),
        Err(e) => PdfStatus::failed(kind, e),
    }
}

/// Move a lab result to another record: the old attachment and the old
/// record's lab report are soft-deleted, a copy is attached to the target,
/// the move is logged in `lab_result_moves`, and the lab reports are rebuilt.
/// A failed rebuild leaves the move in place and is reported in `pdfs`.
pub async fn move_result(
    env: &PdfEnv,
    db: &DatabaseConnection,
    attachment_id: i64,
    target_record_id: i64,
    moved_by: Option<String>,
) -> Result<MoveOutcome, String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT medical_record_id, file_id, original_name, mime_type, device_type, device_name, \
                    connection_method, attachment_type, source_file_id \
             FROM medical_attachments WHERE id = ? AND deleted_at IS NULL",
            [attachment_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the attachment: {}", e))?
        .ok_or("Attachment not found".to_string())?;
    let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten();
    let from_record_id: i64 = row.try_get("", "medical_record_id").map_err(|e| e.to_string())?;
    let is_lab = text("device_type").is_some()
        && text("device_name").is_some()
        && (text("attachment_type").as_deref() == Some("test_result")
            || (text("attachment_type").as_deref() != Some("generated_pdf")
                && text("mime_type").as_deref() != Some("application/pdf")));
    if !is_lab {
        return Err("Only a lab result can be moved".to_string());
    }
    if from_record_id == target_record_id {
        return Err("The lab result is already on this record".to_string());
    }
    if !record_exists(db, target_record_id).await? {
        return Err("Medical record not found".to_string());
    }

    let bytes = std::fs::read(env.storage_dir.join(text("file_id").unwrap_or_default()))
        .map_err(|e| format!("Failed to read the lab result: {}", e))?;
    let stored_id = copy_into_storage(&env.storage_dir, &bytes)?;
    let source_file_id = text("source_file_id");
    let moved_at = now();

    let txn = db.begin().await.map_err(|e| format!("Failed to start the move: {}", e))?;
    let new_id = insert_lab_attachment(
        &txn,
        target_record_id,
        &stored_id,
        &text("original_name").unwrap_or_default(),
        bytes.len() as i64,
        text("mime_type"),
        text("device_type"),
        text("device_name"),
        text("connection_method"),
        source_file_id.clone(),
    )
    .await?;
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE medical_attachments SET deleted_at = ? WHERE id = ?",
        [moved_at.clone().into(), attachment_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to detach the lab result: {}", e))?;
    retire_lab_reports(&txn, from_record_id, None).await?;
    crate::services::lab_results::repoint(&txn, attachment_id, new_id, target_record_id).await?;
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO lab_result_moves (file_id, from_attachment_id, to_attachment_id, from_record_id, to_record_id, moved_at, moved_by) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            Value::String(source_file_id.clone().map(Box::new)),
            attachment_id.into(),
            new_id.into(),
            from_record_id.into(),
            target_record_id.into(),
            moved_at.into(),
            Value::String(moved_by.map(Box::new)),
        ],
    ))
    .await
    .map_err(|e| format!("Failed to log the move: {}", e))?;
    if let Some(file_id) = &source_file_id {
        set_attached(&txn, file_id, target_record_id, Some(new_id), "manual").await?;
    }
    txn.commit().await.map_err(|e| format!("Failed to move the lab result: {}", e))?;
    if let Err(e) = crate::services::lab_results::index_attachment(db, &env.storage_dir, new_id).await {
        log::warn!("Lab values of attachment {} not stored: {}", new_id, e);
    }

    let mut pdfs = vec![pdf_status("device_report", regenerate_lab_report(env, db, target_record_id).await)];
    let source_has_results = !db
        .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, LAB_ATTACHMENTS_SQL, [from_record_id.into()]))
        .await
        .map_err(|e| format!("Failed to read the old record's lab results: {}", e))?
        .is_empty();
    if source_has_results {
        pdfs.push(pdf_status("source_device_report", regenerate_lab_report(env, db, from_record_id).await));
    }

    Ok(MoveOutcome { attachment_id: new_id, from_record_id, to_record_id: target_record_id, pdfs })
}

/// The record page's Delete. When the file was a lab result, the record's lab
/// report is rebuilt from the lab results left, or retired when none are
/// left; the returned status says how the rebuild went (None: nothing to build).
pub async fn delete_and_refresh_lab_report(
    env: Result<&PdfEnv, String>,
    db: &DatabaseConnection,
    attachment_id: i64,
) -> Result<Option<PdfStatus>, String> {
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT medical_record_id, device_type, device_name, attachment_type, mime_type \
             FROM medical_attachments WHERE id = ? AND deleted_at IS NULL",
            [attachment_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the attachment: {}", e))?
        .ok_or_else(|| "Attachment not found".to_string())?;
    let text = |c: &str| row.try_get::<Option<String>>("", c).ok().flatten();
    let record_id: i64 = row.try_get("", "medical_record_id").map_err(|e| e.to_string())?;
    let was_lab = text("device_type").is_some()
        && text("device_name").is_some()
        && (text("attachment_type").as_deref() == Some("test_result")
            || (text("attachment_type").as_deref() != Some("generated_pdf")
                && text("mime_type").as_deref() != Some("application/pdf")));

    crate::services::file_storage::FileStorageService::delete_user_attachment(db, attachment_id).await?;
    if !was_lab {
        return Ok(None);
    }
    let left = db
        .query_all(Statement::from_sql_and_values(DbBackend::Sqlite, LAB_ATTACHMENTS_SQL, [record_id.into()]))
        .await
        .map_err(|e| format!("Failed to read the record's lab results: {}", e))?;
    if left.is_empty() {
        retire_lab_reports(db, record_id, None).await?;
        return Ok(None);
    }
    let rebuilt = match env {
        Ok(env) => regenerate_lab_report(env, db, record_id).await,
        Err(e) => Err(e),
    };
    if let Err(e) = &rebuilt {
        log::warn!("Lab report of record {} not rebuilt after a delete: {}", record_id, e);
    }
    Ok(Some(pdf_status("device_report", rebuilt)))
}

/// Soft-delete an attachment (see `FileStorageService::delete_attachment`).
/// When it was the record's copy of a lab result, the result goes back to
/// waiting in the inbox.
pub async fn delete_attachment(db: &DatabaseConnection, attachment_id: i64) -> Result<(), String> {
    let source = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT source_file_id, medical_record_id FROM medical_attachments WHERE id = ?",
            [attachment_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the attachment: {}", e))?;
    crate::services::file_storage::FileStorageService::delete_attachment(db, attachment_id).await?;

    let Some(row) = source else { return Ok(()) };
    let Some(file_id) = row.try_get::<Option<String>>("", "source_file_id").ok().flatten() else { return Ok(()) };
    let record_id: i64 = row.try_get("", "medical_record_id").map_err(|e| e.to_string())?;
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE file_access_history SET inbox_state = 'waiting', attached_record_id = NULL, attached_at = NULL \
         WHERE file_id = ? AND inbox_state = 'attached' AND attached_record_id = ? \
           AND NOT EXISTS (SELECT 1 FROM medical_attachments ma \
                           WHERE ma.source_file_id = ? AND ma.medical_record_id = ? AND ma.deleted_at IS NULL)",
        [file_id.clone().into(), record_id.into(), file_id.into(), record_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to put the lab result back in the inbox: {}", e))?;
    Ok(())
}
