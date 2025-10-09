use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Species {
    pub id: i64,
    pub name: String,
    pub active: bool,
    pub display_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSpeciesInput {
    pub name: String,
    pub display_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSpeciesInput {
    pub name: Option<String>,
    pub active: Option<bool>,
    pub display_order: Option<i64>,
}
