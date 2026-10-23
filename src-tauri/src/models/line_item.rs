use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use ts_rs::TS;
use crate::models::dto::MaybeNull;

// LineItemTemplate model (Settings - reusable templates)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LineItemTemplate {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub default_price: f64,
    #[ts(type = "number")]
    pub currency_id: i64,
    #[ts(type = "number")]
    pub display_order: i64,
    pub is_active: bool,
    /// VAT rate a new line from this template starts with.
    #[ts(type = "number | null")]
    pub default_tax_rate_id: Option<i64>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateLineItemTemplateInput {
    pub name: String,
    pub description: Option<String>,
    pub default_price: f64,
    #[ts(type = "number")]
    pub currency_id: i64,
    #[serde(default)]
    #[ts(optional, type = "number | null")]
    pub default_tax_rate_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateLineItemTemplateInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub default_price: Option<f64>,
    #[ts(type = "number | null")]
    pub currency_id: Option<i64>,
    pub is_active: Option<bool>,
    #[ts(type = "number | null")]
    pub display_order: Option<i64>,
    /// Missing: unchanged; null: no default rate.
    #[serde(default)]
    #[ts(type = "number | null")]
    pub default_tax_rate_id: MaybeNull<i64>,
}

// MedicalRecordLineItem model (Per-record items)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordLineItem {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub medical_record_id: i64,
    #[ts(type = "number | null")]
    pub template_id: Option<i64>,  // None = custom item
    pub name: String,
    pub description: Option<String>,
    pub unit_price: f64,
    #[ts(type = "number")]
    pub currency_id: i64,
    pub quantity: i32,
    /// The VAT rate chosen for the line, and its name and percent as they
    /// were when the line was saved. All null: the line has no rate (0%).
    #[ts(type = "number | null")]
    pub tax_rate_id: Option<i64>,
    pub vat_name: Option<String>,
    pub vat_percent: Option<f64>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

// Input for creating line items when creating/updating a medical record
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateLineItemInput {
    #[ts(type = "number | null")]
    pub template_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub unit_price: f64,
    #[ts(type = "number")]
    pub currency_id: i64,
    #[serde(default = "default_quantity")]
    pub quantity: i32,
    /// Missing: the template's default rate (none for a custom line);
    /// null: no rate.
    #[serde(default)]
    #[ts(type = "number | null")]
    pub tax_rate_id: MaybeNull<i64>,
}

fn default_quantity() -> i32 {
    1
}
