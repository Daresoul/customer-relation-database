use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use ts_rs::TS;

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
}

fn default_quantity() -> i32 {
    1
}
