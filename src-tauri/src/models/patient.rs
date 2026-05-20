use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, NaiveDate, Utc};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
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
}