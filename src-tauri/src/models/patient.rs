use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, NaiveDate, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Patient {
    pub id: i64,
    pub name: String,
    pub species: String,
    pub breed: Option<String>,
    pub gender: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub color: Option<String>,
    pub weight: Option<f64>,
    pub microchip_id: Option<String>,
    pub medical_notes: Option<String>,
    pub is_active: bool,
    pub household_id: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}