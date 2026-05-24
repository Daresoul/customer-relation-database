//! Diagnosis "tag" applied to medical records.
//!
//! Diagnoses are stand-alone master data — a single list of terms
//! ("Arthritis", "Otitis externa", "Hyperthyroidism") that the user
//! maintains in Settings. Each medical record can have any number of
//! diagnoses linked via the `medical_record_diagnoses` junction table.
//!
//! The shape mirrors `Species` / `LineItemTemplate` so the surrounding
//! patterns (services, commands, settings UI) stay consistent.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

/// One diagnosis term, e.g. "Arthritis". Soft-deleted via `is_active`
/// rather than a hard DELETE so historical links from medical records
/// stay intact when a term is retired.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    /// Hex color hint (e.g. "#FF5722") for the tag's visual display.
    /// Optional — UI falls back to a default palette when None.
    pub color: Option<String>,
    pub is_active: bool,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateDiagnosisInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateDiagnosisInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub is_active: Option<bool>,
}
