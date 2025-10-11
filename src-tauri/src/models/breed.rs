use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Breed {
    pub id: i64,
    pub name: String,
    pub species_id: i64,
    pub active: bool,
    pub display_order: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBreedInput {
    pub name: String,
    pub species_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBreedInput {
    pub name: Option<String>,
    pub species_id: Option<i64>,
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BreedFilter {
    pub species_id: Option<i64>,
    pub active_only: Option<bool>,
}
