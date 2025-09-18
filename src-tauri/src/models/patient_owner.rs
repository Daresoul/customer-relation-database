use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PatientOwner {
    pub patient_id: i64,
    pub owner_id: i64,
    pub relationship_type: String,
    pub is_primary: bool,
    pub created_at: DateTime<Utc>,
}