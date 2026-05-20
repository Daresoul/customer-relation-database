use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};
use ts_rs::TS;

use crate::models::line_item::MedicalRecordLineItem;

// T023: MedicalRecord model
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecord {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub patient_id: i64,
    pub record_type: String,
    pub name: String,
    pub procedure_name: Option<String>,
    pub description: String,
    pub prescription_notes: Option<String>,
    pub price: Option<f64>,
    #[ts(type = "number | null")]
    pub currency_id: Option<i64>,
    pub discount_percent: Option<f64>,
    pub manual_total: Option<f64>,
    pub invoice_number: Option<String>,
    pub is_archived: bool,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<MedicalAttachment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_items: Option<Vec<MedicalRecordLineItem>>,
}

// T024: MedicalAttachment model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalAttachment {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub medical_record_id: i64,
    pub file_id: String,
    pub original_name: String,
    #[ts(type = "number | null")]
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    #[ts(type = "string")]
    pub uploaded_at: DateTime<Utc>,
    pub device_type: Option<String>,
    pub device_name: Option<String>,
    pub connection_method: Option<String>,
    pub attachment_type: Option<String>,
}

// T025: MedicalRecordHistory model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordHistory {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub medical_record_id: i64,
    pub version: i32,
    pub changed_fields: Option<String>,
    pub old_values: Option<String>,
    pub new_values: Option<String>,
    pub changed_by: Option<String>,
    #[ts(type = "string")]
    pub changed_at: DateTime<Utc>,
}

// T026: Currency model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Currency {
    #[ts(type = "number")]
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: Option<String>,
}

// T032: FileAccessHistory model - tracks device-generated files for crash protection
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FileAccessHistory {
    pub id: i64,
    pub file_id: String,
    pub original_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub device_type: String,
    pub device_name: String,
    pub connection_method: Option<String>,
    pub received_at: DateTime<Utc>,
    pub first_attached_to_record_id: Option<i64>,
    pub first_attached_at: Option<DateTime<Utc>>,
    pub attachment_count: i32,
    pub last_accessed_at: DateTime<Utc>,
}

// File access history with medical record details
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAccessHistoryWithRecord {
    #[serde(flatten)]
    pub file_history: FileAccessHistory,
    pub patient_name: Option<String>,
    pub record_name: Option<String>,
}

// DTOs for creating and updating records

/// Device data for PDF generation
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DeviceDataInput {
    #[ts(type = "Record<string, unknown>")]
    pub device_test_data: serde_json::Value,
    pub device_type: String,
    pub device_name: String,
}

use crate::models::line_item::CreateLineItemInput;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateMedicalRecordInput {
    #[ts(type = "number")]
    pub patient_id: i64,
    pub record_type: String,
    pub name: String,
    pub procedure_name: Option<String>,
    pub description: String,
    pub prescription_notes: Option<String>,
    pub price: Option<f64>,
    #[ts(type = "number | null")]
    pub currency_id: Option<i64>,
    pub discount_percent: Option<f64>,
    pub manual_total: Option<f64>,
    #[ts(type = "Record<string, unknown> | null")]
    pub device_test_data: Option<serde_json::Value>,
    pub device_type: Option<String>,
    pub device_name: Option<String>,
    pub device_data_list: Option<Vec<DeviceDataInput>>,
    pub line_items: Option<Vec<CreateLineItemInput>>,
}

use crate::models::dto::MaybeNull;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateMedicalRecordInput {
    pub name: Option<String>,
    pub procedure_name: Option<String>,
    pub description: Option<String>,
    pub prescription_notes: Option<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub price: MaybeNull<f64>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub currency_id: MaybeNull<i64>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub discount_percent: MaybeNull<f64>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub manual_total: MaybeNull<f64>,
    pub is_archived: Option<bool>,
    pub line_items: Option<Vec<CreateLineItemInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordFilter {
    pub record_type: Option<String>,
    pub is_archived: Option<bool>,
    pub search_term: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PaginationParams {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordsResponse {
    pub records: Vec<MedicalRecord>,
    #[ts(type = "number")]
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordDetail {
    pub record: MedicalRecord,
    pub attachments: Vec<MedicalAttachment>,
    pub history: Option<Vec<MedicalRecordHistory>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMedicalRecordsResponse {
    pub records: Vec<MedicalRecord>,
    pub match_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentData {
    pub file_name: String,
    pub file_data: Vec<u8>,
    pub mime_type: String,
}

// T033: RecordTemplate model for medical record templates
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RecordTemplate {
    pub id: i64,
    pub record_type: String,
    pub title: String,
    pub description: String,
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRecordTemplateInput {
    pub record_type: String,
    pub title: String,
    pub description: String,
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecordTemplateInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
}

/// Patient overrides for configurable PDF report generation
/// All fields are optional - only provided fields override the DB values
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientOverrides {
    pub owner: Option<String>,
    pub patient_name: Option<String>,
    pub species: Option<String>,
    pub gender: Option<String>,
    pub date_of_birth: Option<String>,
    pub microchip_id: Option<String>,
}