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
    /// Missing: unchanged; null: no currency.
    #[serde(default)]
    #[ts(type = "number | null")]
    pub currency_id: crate::models::dto::MaybeNull<i64>,
    pub theme: Option<String>,
    pub date_format: Option<String>,
}

/// The clinic's own details, printed on the letterhead of every PDF. A
/// blank field keeps the text baked into the PDF template.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ClinicProfile {
    pub name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    /// ЕДБ
    pub tax_number: Option<String>,
    /// ЕМБС
    pub registration_number: Option<String>,
    pub bank_account: Option<String>,
    pub bank_name: Option<String>,
    /// The logo file in the app's data folder.
    pub logo_path: Option<String>,
    /// Whether entered prices already include VAT (gross).
    pub prices_include_vat: bool,
}

impl Default for ClinicProfile {
    fn default() -> Self {
        Self {
            name: None,
            address: None,
            city: None,
            phone: None,
            email: None,
            tax_number: None,
            registration_number: None,
            bank_account: None,
            bank_name: None,
            logo_path: None,
            prices_include_vat: true,
        }
    }
}

/// The profile form: every text field is sent; empty or missing clears it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateClinicProfileInput {
    pub name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub tax_number: Option<String>,
    pub registration_number: Option<String>,
    pub bank_account: Option<String>,
    pub bank_name: Option<String>,
    /// Missing: unchanged.
    pub prices_include_vat: Option<bool>,
}

/// A VAT rate offered for line items.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct TaxRate {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub percent: f64,
    /// Starts new custom lines and new templates.
    pub is_default: bool,
    pub is_active: bool,
    #[ts(type = "number")]
    pub display_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateTaxRateInput {
    pub name: String,
    pub percent: f64,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaxRateInput {
    pub name: Option<String>,
    pub percent: Option<f64>,
    pub is_default: Option<bool>,
    pub is_active: Option<bool>,
}