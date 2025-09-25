use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};
use crate::models::Currency;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub id: i64,
    pub user_id: String,
    pub language: String,
    pub currency_id: Option<i64>,
    pub theme: String,
    pub date_format: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub settings: AppSettings,
    pub currency: Option<Currency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsRequest {
    pub language: Option<String>,
    pub currency_id: Option<i64>,
    pub theme: Option<String>,
    pub date_format: Option<String>,
}