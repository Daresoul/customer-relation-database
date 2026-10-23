use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, NaiveDate, Utc};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Patient {
    // i64 → number in TS for FE convenience. Patient ids in this app never
    // exceed Number.MAX_SAFE_INTEGER so the lossy cast is safe.
    #[ts(type = "number")]
    pub id: i64,
    pub name: Option<String>,
    #[ts(type = "number | null")]
    pub species_id: Option<i64>,
    #[ts(type = "number | null")]
    pub breed_id: Option<i64>,
    // These fields are populated via JOINs for backward compatibility
    #[sqlx(default)]
    pub species: Option<String>,
    #[sqlx(default)]
    pub breed: Option<String>,
    pub gender: Option<String>,
    #[ts(type = "string | null")]
    pub date_of_birth: Option<NaiveDate>,
    pub color: Option<String>,
    pub weight: Option<f64>,
    pub microchip_id: Option<String>,
    pub medical_notes: Option<String>,
    pub is_active: bool,
    #[ts(type = "number | null")]
    pub household_id: Option<i64>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
    /// `None` is "not recorded".
    #[sqlx(default)]
    pub neutered: Option<bool>,
    #[sqlx(default)]
    #[ts(type = "string | null")]
    pub deceased_at: Option<NaiveDate>,
    #[sqlx(default)]
    pub deceased_note: Option<String>,
    #[sqlx(default)]
    pub inactive_reason: Option<String>,
    /// Date of the newest weight-log entry, the one `weight` holds.
    #[sqlx(default)]
    #[ts(type = "string | null")]
    pub last_weight_at: Option<NaiveDate>,
    #[sqlx(skip)]
    pub alerts: Vec<PatientAlert>,
}

pub const ALERT_TYPES: &[&str] = &["allergy", "aggressive", "chronic", "other"];

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PatientAlert {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub patient_id: i64,
    /// One of `ALERT_TYPES`.
    pub alert_type: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PatientWeight {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub patient_id: i64,
    pub weight: f64,
    #[ts(type = "string")]
    pub measured_on: NaiveDate,
    #[ts(type = "number | null")]
    pub medical_record_id: Option<i64>,
}