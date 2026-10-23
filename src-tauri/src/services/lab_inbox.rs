//! Lab inbox: every result a machine sent, one `file_access_history` row each,
//! with a state of `waiting`, `attached` or `discarded`. Also attaching a
//! result to an existing record and moving one to another patient.

use crate::services::medical_record::{PdfEnv, PdfStatus};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::path::Path;

/// Reasons a result can be discarded with.
pub const DISCARD_REASONS: [&str; 4] = ["qc", "test", "duplicate", "other"];

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

/// The analytes in a parsed result, with unit, range and H/L flag.
pub fn lab_values(_device_type: &str, _test_results: &serde_json::Value) -> Vec<LabValue> {
    Vec::new()
}

pub async fn list_inbox(_db: &DatabaseConnection, _state: Option<&str>) -> Result<Vec<LabInboxItem>, String> {
    Err("not implemented".to_string())
}

pub async fn waiting_count(_db: &DatabaseConnection) -> Result<i64, String> {
    Err("not implemented".to_string())
}

pub async fn discard(
    _db: &DatabaseConnection,
    _file_id: &str,
    _reason: &str,
    _note: Option<String>,
) -> Result<(), String> {
    Err("not implemented".to_string())
}

pub async fn restore(_db: &DatabaseConnection, _file_id: &str) -> Result<(), String> {
    Err("not implemented".to_string())
}

pub async fn mark_attached(
    _db: &DatabaseConnection,
    _file_id: &str,
    _record_id: i64,
    _attachment_id: Option<i64>,
) -> Result<(), String> {
    Err("not implemented".to_string())
}

pub async fn attach_to_record(
    _db: &DatabaseConnection,
    _storage_dir: &Path,
    _file_id: &str,
    _record_id: i64,
) -> Result<i64, String> {
    Err("not implemented".to_string())
}

pub async fn regenerate_lab_report(_env: &PdfEnv, _db: &DatabaseConnection, _record_id: i64) -> Result<i64, String> {
    Err("not implemented".to_string())
}

pub async fn move_result(
    _env: &PdfEnv,
    _db: &DatabaseConnection,
    _attachment_id: i64,
    _target_record_id: i64,
    _moved_by: Option<String>,
) -> Result<MoveOutcome, String> {
    Err("not implemented".to_string())
}
