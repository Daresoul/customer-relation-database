//! Lab values stored one per row (`lab_results`): one row per analyte per
//! lab attachment, with unit, reference range and an H/L flag. Written when a
//! result is attached to a record, re-pointed when it is moved, hidden when
//! its attachment is deleted, and backfilled at start for older attachments.
//! `lab_result_imports` notes which attachments were read, so each is read once.

use crate::services::device_parser::DeviceParserService;
use crate::services::java_pdf_service::JavaPdfService;
use crate::services::lab_inbox::is_analyte_key;
use crate::services::lab_reference::{self, Reference, Species};
use chrono::{DateTime, Local, NaiveDateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, QueryResult, Statement, TransactionTrait, Value};
use serde::Serialize;
use std::path::{Path, PathBuf};

/// One analyte read from a parsed result.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyteValue {
    pub code: String,
    pub name: String,
    pub position: i64,
    pub value_text: String,
    pub value_num: Option<f64>,
    pub unit: Option<String>,
    pub ref_low: Option<f64>,
    pub ref_high: Option<f64>,
    pub range_text: Option<String>,
    /// "H", "L", "N" (inside the range) or "U" (unknown).
    pub flag: String,
}

/// A stored lab value.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabResultRow {
    pub id: i64,
    pub patient_id: i64,
    pub medical_record_id: i64,
    pub record_name: Option<String>,
    pub attachment_id: i64,
    pub source_file_id: Option<String>,
    pub device_type: String,
    pub device_name: Option<String>,
    /// Local wall time, `YYYY-MM-DDTHH:MM:SS`: the machine's clock when it
    /// sent one, else when the result was received or attached.
    pub sample_at: String,
    pub code: String,
    pub name: String,
    pub position: i64,
    pub value_text: String,
    pub value_num: Option<f64>,
    pub unit: Option<String>,
    pub ref_low: Option<f64>,
    pub ref_high: Option<f64>,
    pub range_text: Option<String>,
    pub flag: String,
}

/// The same analyte's value in the patient's sample before this one.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviousValue {
    pub value_text: String,
    pub value_num: Option<f64>,
    pub flag: String,
    pub sample_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordLabValue {
    #[serde(flatten)]
    pub value: LabResultRow,
    pub previous: Option<PreviousValue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BackfillReport {
    pub indexed: usize,
    pub failed: usize,
}

/// Unknown analytes sort after the known ones, in key order.
const UNKNOWN_POSITION: i64 = 1000;

fn plain_number(s: &str) -> Option<f64> {
    let n: f64 = s.trim().replace(',', ".").parse().ok()?;
    n.is_finite().then_some(n)
}

/// Splits a leading `<`, `>`, `<=` or `>=` off a value.
fn comparator(text: &str) -> (Option<char>, &str) {
    let s = text.trim();
    match s.chars().next() {
        Some(c @ ('<' | '>')) => (Some(c), s[1..].strip_prefix('=').unwrap_or(&s[1..])),
        _ => (None, s),
    }
}

/// The number in a value as the machine printed it: "1,5" is 1.5 and
/// "<0.5" is 0.5. None for text such as "---" or "NoCt".
pub fn parse_value(text: &str) -> Option<f64> {
    plain_number(comparator(text).1)
}

/// "H", "L", "N" or "U" for a value against a range, as the lab PDF does
/// (`ResultClassifier`): "<0.5" is only low when 0.5 is at or below the low end.
pub fn classify(text: &str, low: Option<f64>, high: Option<f64>) -> &'static str {
    let (sign, rest) = comparator(text);
    let (Some(v), Some(low), Some(high)) = (plain_number(rest), low, high) else { return "U" };
    match sign {
        Some('>') if v >= high => "H",
        Some('<') if v <= low => "L",
        Some(_) => "U",
        None if v < low => "L",
        None if v > high => "H",
        None => "N",
    }
}

/// "low-high" as the machine sends it; none for "0-0" or anything else.
pub(crate) fn parse_range(range: &str) -> Option<(f64, f64)> {
    let r = range.trim().replace('–', "-");
    let dash = r.get(1..)?.find('-')? + 1;
    let (low, high) = (plain_number(&r[..dash])?, plain_number(&r[dash + 1..])?);
    (!(low == 0.0 && high == 0.0)).then_some((low, high))
}

/// The machine's own mark, read as the lab PDF reads it.
fn device_flag(flag: Option<String>) -> Option<&'static str> {
    let f = flag?.trim().to_uppercase();
    match f.chars().next()? {
        'H' | '>' => Some("H"),
        'L' | '<' => Some("L"),
        'N' => Some("N"),
        _ => None,
    }
}

fn range_text(low: Option<f64>, high: Option<f64>) -> Option<String> {
    Some(format!("{} - {}", low?, high?))
}

fn is_pointcare(device_type: &str) -> bool {
    device_type.contains("pointcare") && !device_type.contains("pcr")
}

pub fn extract_values(device_type: &str, results: &serde_json::Value, species: Option<&str>) -> Vec<AnalyteValue> {
    let Some(map) = results.as_object() else { return Vec::new() };
    let get = |k: &str| -> Option<String> {
        match map.get(k)? {
            serde_json::Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            serde_json::Value::Number(n) => Some(n.to_string()),
            _ => None,
        }
    };

    if device_type == "exigo_eos_vet" {
        return lab_reference::EXIGO
            .iter()
            .enumerate()
            .filter_map(|(i, reference)| {
                let code = reference.code;
                let value = get(code)?;
                let low_text = get(&format!("{}_L", code));
                let high_text = get(&format!("{}_H", code));
                let low = low_text.as_deref().and_then(plain_number);
                let high = high_text.as_deref().and_then(plain_number);
                let flag = device_flag(get(&format!("{}_F", code))).unwrap_or_else(|| classify(&value, low, high));
                Some(AnalyteValue {
                    code: code.to_string(),
                    name: reference.name.to_string(),
                    position: i as i64,
                    value_num: parse_value(&value),
                    unit: reference.unit.map(str::to_string),
                    ref_low: low,
                    ref_high: high,
                    range_text: low_text.zip(high_text).map(|(l, h)| format!("{} - {}", l, h)),
                    flag: flag.to_string(),
                    value_text: value,
                })
            })
            .collect();
    }

    let healvet = device_type.starts_with("healvet");
    let species = Species::from_name(species);
    let mut unknown = UNKNOWN_POSITION;
    let mut values: Vec<AnalyteValue> = map
        .keys()
        .filter(|k| is_analyte_key(k))
        .filter_map(|key| {
            let value = get(key)?;
            let known: Option<(usize, &Reference)> = if healvet {
                // Another species borrows only the dog entry's name, unit and order.
                lab_reference::healvet(key, if species == Species::Other { Species::Dog } else { species })
            } else if is_pointcare(device_type) {
                lab_reference::pointcare(key)
            } else {
                None
            };
            let position = known.map(|(i, _)| i as i64).unwrap_or_else(|| {
                unknown += 1;
                unknown
            });
            let reference = known.map(|(_, r)| r);
            let device_range = get(&format!("{}_range", key));
            let (low, high) = match device_range.as_deref().and_then(parse_range) {
                Some((l, h)) => (Some(l), Some(h)),
                None if healvet && species == Species::Other => (None, None),
                None => (reference.and_then(|r| r.low), reference.and_then(|r| r.high)),
            };
            let flag = device_flag(get(&format!("{}_flag", key))).unwrap_or_else(|| classify(&value, low, high));
            Some(AnalyteValue {
                code: reference.map(|r| r.code).unwrap_or(key).to_string(),
                name: reference.map(|r| r.name).unwrap_or(key).to_string(),
                position,
                value_num: parse_value(&value),
                unit: get(&format!("{}_unit", key)).or_else(|| reference.and_then(|r| r.unit).map(str::to_string)),
                ref_low: low,
                ref_high: high,
                range_text: device_range.or_else(|| range_text(low, high)),
                flag: flag.to_string(),
                value_text: value,
            })
        })
        .collect();
    values.sort_by_key(|v| v.position);
    values
}

/// A stored UTC time ("2026-10-23T08:00:00+00:00" or SQLite's
/// "2026-10-23 08:00:00") as local wall time.
fn local_time(stored: &str) -> Option<NaiveDateTime> {
    let utc = DateTime::parse_from_rfc3339(stored.trim())
        .map(|t| t.with_timezone(&Utc))
        .or_else(|_| NaiveDateTime::parse_from_str(stored.trim(), "%Y-%m-%d %H:%M:%S").map(|t| t.and_utc()))
        .ok()?;
    Some(utc.with_timezone(&Local).naive_local())
}

fn text(row: &QueryResult, column: &str) -> Option<String> {
    row.try_get::<Option<String>>("", column).ok().flatten()
}

async fn mark_imported<C: ConnectionTrait>(db: &C, attachment_id: i64, outcome: &Result<usize, String>) -> Result<(), String> {
    let (status, count, error) = match outcome {
        Ok(n) => ("ok", *n as i64, None),
        Err(e) => ("failed", 0, Some(e.clone())),
    };
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT OR REPLACE INTO lab_result_imports (attachment_id, status, analyte_count, error, imported_at) \
         VALUES (?, ?, ?, ?, ?)",
        [
            attachment_id.into(),
            status.into(),
            count.into(),
            Value::String(error.map(Box::new)),
            Utc::now().to_rfc3339().into(),
        ],
    ))
    .await
    .map_err(|e| format!("Failed to note the lab values read: {}", e))?;
    Ok(())
}

/// Read a lab attachment's values into `lab_results`, once. Returns how many
/// analytes it has. A file that can't be read is noted and not tried again.
/// Anything other than a lab result is skipped (0).
pub async fn index_attachment(db: &DatabaseConnection, storage_dir: &Path, attachment_id: i64) -> Result<usize, String> {
    if let Some(done) = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT status, analyte_count, error FROM lab_result_imports WHERE attachment_id = ?",
            [attachment_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the lab values state: {}", e))?
    {
        return match text(&done, "status").as_deref() {
            Some("ok") => Ok(done.try_get::<i64>("", "analyte_count").unwrap_or(0) as usize),
            _ => Err(text(&done, "error").unwrap_or_else(|| "The lab result could not be read".to_string())),
        };
    }

    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT ma.medical_record_id, ma.file_id, ma.original_name, ma.mime_type, ma.device_type, ma.device_name, \
                    ma.connection_method, ma.attachment_type, ma.source_file_id, ma.uploaded_at, \
                    mr.patient_id, s.name AS species_name, \
                    (SELECT fah.received_at FROM file_access_history fah WHERE fah.file_id = ma.source_file_id) AS received_at \
             FROM medical_attachments ma \
             JOIN medical_records mr ON mr.id = ma.medical_record_id \
             JOIN patients p ON p.id = mr.patient_id \
             LEFT JOIN species s ON s.id = p.species_id \
             WHERE ma.id = ?",
            [attachment_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the attachment: {}", e))?
        .ok_or("Attachment not found".to_string())?;

    let (Some(device_type), Some(device_name)) = (text(&row, "device_type"), text(&row, "device_name")) else {
        return Ok(0);
    };
    let attachment_type = text(&row, "attachment_type");
    let is_lab = attachment_type.as_deref() == Some("test_result")
        || (attachment_type.as_deref() != Some("generated_pdf") && text(&row, "mime_type").as_deref() != Some("application/pdf"));
    if !is_lab {
        return Ok(0);
    }

    let parsed = std::fs::read(storage_dir.join(text(&row, "file_id").unwrap_or_default()))
        .map_err(|e| format!("Could not read the stored file: {}", e))
        .and_then(|bytes| {
            DeviceParserService::parse_device_data(
                &device_type,
                &device_name,
                &text(&row, "original_name").unwrap_or_default(),
                &bytes,
                text(&row, "connection_method").as_deref().unwrap_or("unknown"),
            )
        });
    let parsed = match parsed {
        Ok(p) => p,
        Err(e) => {
            let outcome = Err(e);
            mark_imported(db, attachment_id, &outcome).await?;
            return outcome;
        }
    };

    let values = extract_values(&device_type, &parsed.test_results, text(&row, "species_name").as_deref());
    let sample_at = JavaPdfService::device_time(&parsed.test_results)
        .or_else(|| text(&row, "received_at").as_deref().and_then(local_time))
        .or_else(|| text(&row, "uploaded_at").as_deref().and_then(local_time))
        .unwrap_or_else(|| Local::now().naive_local())
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();
    let record_id: i64 = row.try_get("", "medical_record_id").map_err(|e| e.to_string())?;
    let patient_id: i64 = row.try_get("", "patient_id").map_err(|e| e.to_string())?;
    let source_file_id = text(&row, "source_file_id");

    let txn = db.begin().await.map_err(|e| format!("Failed to start saving lab values: {}", e))?;
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM lab_results WHERE attachment_id = ?",
        [attachment_id.into()],
    ))
    .await
    .map_err(|e| format!("Failed to clear old lab values: {}", e))?;
    for v in &values {
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT OR IGNORE INTO lab_results (patient_id, medical_record_id, attachment_id, source_file_id, device_type, \
                 device_name, sample_at, analyte_code, display_name, position, value_text, value_num, unit, ref_low, \
                 ref_high, range_text, flag) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                patient_id.into(),
                record_id.into(),
                attachment_id.into(),
                Value::String(source_file_id.clone().map(Box::new)),
                device_type.clone().into(),
                device_name.clone().into(),
                sample_at.clone().into(),
                v.code.clone().into(),
                v.name.clone().into(),
                v.position.into(),
                v.value_text.clone().into(),
                Value::Double(v.value_num),
                Value::String(v.unit.clone().map(Box::new)),
                Value::Double(v.ref_low),
                Value::Double(v.ref_high),
                Value::String(v.range_text.clone().map(Box::new)),
                v.flag.clone().into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to save a lab value: {}", e))?;
    }
    mark_imported(&txn, attachment_id, &Ok(values.len())).await?;
    txn.commit().await.map_err(|e| format!("Failed to save lab values: {}", e))?;
    Ok(values.len())
}

/// When the sample was taken.
pub fn sample_time(machine: Option<chrono::NaiveDateTime>, received: chrono::NaiveDateTime) -> chrono::NaiveDateTime {
    machine.unwrap_or(received)
}

/// Reads the patient's lab results again, after its species changed: ranges
/// and flags depend on it.
pub async fn reindex_patient(db: &DatabaseConnection, storage_dir: &Path, patient_id: i64) -> Result<(), String> {
    let rows = db
        .query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT ma.id FROM medical_attachments ma JOIN medical_records mr ON mr.id = ma.medical_record_id \
             WHERE mr.patient_id = ? AND ma.deleted_at IS NULL AND ma.device_type IS NOT NULL",
            [patient_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the patient's lab results: {}", e))?;
    for row in rows {
        let Ok(id) = row.try_get::<i64>("", "id") else { continue };
        forget(db, id).await?;
        if let Err(e) = index_attachment(db, storage_dir, id).await {
            log::warn!("Lab values of attachment {} not read again: {}", id, e);
        }
    }
    Ok(())
}

/// Drops a result's stored values and its "read" mark, so the next read
/// works them out again (after a move, for the new patient's species).
pub async fn forget<C: ConnectionTrait>(db: &C, attachment_id: i64) -> Result<(), String> {
    for sql in [
        "DELETE FROM lab_results WHERE attachment_id = ?",
        "DELETE FROM lab_result_imports WHERE attachment_id = ?",
    ] {
        db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, [attachment_id.into()]))
            .await
            .map_err(|e| format!("Failed to clear the lab values: {}", e))?;
    }
    Ok(())
}

/// Read every live lab attachment not read before. A file that can't be
/// read is logged, noted and skipped.
pub async fn backfill(db: &DatabaseConnection, storage_dir: &Path) -> Result<BackfillReport, String> {
    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT ma.id FROM medical_attachments ma \
             WHERE ma.deleted_at IS NULL AND ma.device_type IS NOT NULL AND ma.device_name IS NOT NULL \
               AND (ma.attachment_type = 'test_result' \
                    OR (ma.attachment_type != 'generated_pdf' AND ma.mime_type != 'application/pdf')) \
               AND NOT EXISTS (SELECT 1 FROM lab_result_imports li WHERE li.attachment_id = ma.id) \
             ORDER BY ma.id"
                .to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to list lab attachments: {}", e))?;
    let mut report = BackfillReport::default();
    for row in rows {
        let id: i64 = row.try_get("", "id").map_err(|e| e.to_string())?;
        match index_attachment(db, storage_dir, id).await {
            Ok(_) => report.indexed += 1,
            Err(e) => {
                log::warn!("Lab values: skipped attachment {}: {}", id, e);
                report.failed += 1;
            }
        }
    }
    Ok(report)
}

/// The start-up backfill, run in the background.
pub async fn run_backfill(storage_dir: PathBuf, db: std::sync::Arc<DatabaseConnection>) {
    match backfill(&db, &storage_dir).await {
        Ok(r) if r.indexed + r.failed > 0 => {
            log::info!("Lab values: read {} older lab results, {} could not be read", r.indexed, r.failed)
        }
        Ok(_) => {}
        Err(e) => log::warn!("Lab values: backfill failed: {}", e),
    }
}

const ROW_SQL: &str = "SELECT lr.id, lr.patient_id, lr.medical_record_id, mr.name AS record_name, lr.attachment_id, \
            lr.source_file_id, lr.device_type, lr.device_name, lr.sample_at, lr.analyte_code, lr.display_name, \
            lr.position, lr.value_text, lr.value_num, lr.unit, lr.ref_low, lr.ref_high, lr.range_text, lr.flag \
     FROM lab_results lr \
     JOIN medical_attachments ma ON ma.id = lr.attachment_id AND ma.deleted_at IS NULL \
     LEFT JOIN medical_records mr ON mr.id = lr.medical_record_id \
     WHERE lr.patient_id = ? \
     ORDER BY lr.sample_at DESC, lr.attachment_id DESC, lr.position ASC";

fn lab_row(row: &QueryResult) -> Result<LabResultRow, String> {
    let int = |c: &str| row.try_get::<i64>("", c).map_err(|e| format!("{}: {}", c, e));
    let real = |c: &str| row.try_get::<Option<f64>>("", c).ok().flatten();
    Ok(LabResultRow {
        id: int("id")?,
        patient_id: int("patient_id")?,
        medical_record_id: int("medical_record_id")?,
        record_name: text(row, "record_name"),
        attachment_id: int("attachment_id")?,
        source_file_id: text(row, "source_file_id"),
        device_type: text(row, "device_type").unwrap_or_default(),
        device_name: text(row, "device_name"),
        sample_at: text(row, "sample_at").unwrap_or_default(),
        code: text(row, "analyte_code").unwrap_or_default(),
        name: text(row, "display_name").unwrap_or_default(),
        position: int("position")?,
        value_text: text(row, "value_text").unwrap_or_default(),
        value_num: real("value_num"),
        unit: text(row, "unit"),
        ref_low: real("ref_low"),
        ref_high: real("ref_high"),
        range_text: text(row, "range_text"),
        flag: text(row, "flag").unwrap_or_else(|| "U".to_string()),
    })
}

/// Every live lab value of the patient, newest sample first.
pub async fn patient_lab_results(db: &DatabaseConnection, patient_id: i64) -> Result<Vec<LabResultRow>, String> {
    db.query_all(Statement::from_sql_and_values(DbBackend::Sqlite, ROW_SQL, [patient_id.into()]))
        .await
        .map_err(|e| format!("Failed to load the lab values: {}", e))?
        .iter()
        .map(lab_row)
        .collect()
}

/// The record's lab values, each with the same analyte's value from the
/// patient's sample before it (same machine type).
pub async fn record_lab_values(db: &DatabaseConnection, record_id: i64) -> Result<Vec<RecordLabValue>, String> {
    let Some(patient_id) = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT patient_id FROM medical_records WHERE id = ?",
            [record_id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to read the record: {}", e))?
        .and_then(|r| r.try_get::<i64>("", "patient_id").ok())
    else {
        return Ok(Vec::new());
    };
    let all = patient_lab_results(db, patient_id).await?;
    let older = |a: &LabResultRow, b: &LabResultRow| (a.sample_at.as_str(), a.attachment_id) < (b.sample_at.as_str(), b.attachment_id);
    Ok(all
        .iter()
        .filter(|v| v.medical_record_id == record_id)
        .map(|v| RecordLabValue {
            previous: all
                .iter()
                .find(|p| p.device_type == v.device_type && p.code == v.code && older(p, v))
                .map(|p| PreviousValue {
                    value_text: p.value_text.clone(),
                    value_num: p.value_num,
                    flag: p.flag.clone(),
                    sample_at: p.sample_at.clone(),
                }),
            value: v.clone(),
        })
        .collect())
}
