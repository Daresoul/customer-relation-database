//! Lab values stored one per row (`lab_results`): one row per analyte per
//! lab attachment, with unit, reference range and an H/L flag. Written when a
//! result is attached to a record, re-pointed when it is moved, hidden when
//! its attachment is deleted, and backfilled at start for older attachments.

use sea_orm::{ConnectionTrait, DatabaseConnection};
use serde::Serialize;
use std::path::Path;

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

/// The number in a value as the machine printed it: "1,5" is 1.5 and
/// "<0.5" is 0.5. None for text such as "---" or "NoCt".
pub fn parse_value(_text: &str) -> Option<f64> {
    None
}

/// "H", "L", "N" or "U" for a value against a range, as the lab PDF does.
pub fn classify(_text: &str, _low: Option<f64>, _high: Option<f64>) -> &'static str {
    "U"
}

pub fn extract_values(_device_type: &str, _results: &serde_json::Value, _species: Option<&str>) -> Vec<AnalyteValue> {
    Vec::new()
}

pub async fn index_attachment(_db: &DatabaseConnection, _storage_dir: &Path, _attachment_id: i64) -> Result<usize, String> {
    Err("not implemented".to_string())
}

pub async fn repoint<C: ConnectionTrait>(_db: &C, _from_attachment: i64, _to_attachment: i64, _to_record: i64) -> Result<(), String> {
    Ok(())
}

pub async fn backfill(_db: &DatabaseConnection, _storage_dir: &Path) -> Result<BackfillReport, String> {
    Ok(BackfillReport::default())
}

pub async fn patient_lab_results(_db: &DatabaseConnection, _patient_id: i64) -> Result<Vec<LabResultRow>, String> {
    Ok(Vec::new())
}

pub async fn record_lab_values(_db: &DatabaseConnection, _record_id: i64) -> Result<Vec<RecordLabValue>, String> {
    Ok(Vec::new())
}
