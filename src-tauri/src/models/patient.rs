use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, NaiveDate, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Patient {
    pub id: i64,
    pub name: String,
    pub species: String,
    pub breed: Option<String>,
    pub date_of_birth: Option<NaiveDate>,
    pub weight: Option<f64>,
    pub medical_notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatientWithOwners {
    #[serde(flatten)]
    pub patient: Patient,
    pub owners: Vec<super::owner::Owner>,
    pub primary_owner: Option<super::owner::Owner>,
}