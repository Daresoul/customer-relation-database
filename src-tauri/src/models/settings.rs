use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};
use ts_rs::TS;
use crate::models::Currency;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[ts(type = "number")]
    pub id: i64,
    pub user_id: String,
    pub language: String,
    #[ts(type = "number | null")]
    pub currency_id: Option<i64>,
    pub theme: String,
    pub date_format: String,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub settings: AppSettings,
    pub currency: Option<Currency>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsRequest {
    pub language: Option<String>,
    #[ts(type = "number | null")]
    pub currency_id: Option<i64>,
    pub theme: Option<String>,
    pub date_format: Option<String>,
}