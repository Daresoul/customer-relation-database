use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Species {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub active: bool,
    #[ts(type = "number")]
    pub display_order: i64,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct CreateSpeciesInput {
    pub name: String,
    #[ts(type = "number | null")]
    pub display_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct UpdateSpeciesInput {
    pub name: Option<String>,
    pub active: Option<bool>,
    #[ts(type = "number | null")]
    pub display_order: Option<i64>,
}
