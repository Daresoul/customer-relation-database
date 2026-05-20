use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Breed {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    #[ts(type = "number")]
    pub species_id: i64,
    pub active: bool,
    #[ts(type = "number")]
    pub display_order: i64,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct CreateBreedInput {
    pub name: String,
    #[ts(type = "number")]
    pub species_id: i64,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct UpdateBreedInput {
    pub name: Option<String>,
    #[ts(type = "number | null")]
    pub species_id: Option<i64>,
    pub active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BreedFilter {
    pub species_id: Option<i64>,
    pub active_only: Option<bool>,
}
