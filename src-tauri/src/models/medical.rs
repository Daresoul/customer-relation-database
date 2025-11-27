use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

// T023: MedicalRecord model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecord {
    pub id: i64,
    pub patient_id: i64,
    pub record_type: String,
    pub name: String,
    pub procedure_name: Option<String>,
    pub description: String,
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
    pub is_archived: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<MedicalAttachment>>,
}

// T024: MedicalAttachment model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MedicalAttachment {
    pub id: i64,
    pub medical_record_id: i64,
    pub file_id: String,
    pub original_name: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    // T029: Device metadata for PDF regeneration
    pub device_type: Option<String>,
    pub device_name: Option<String>,
    pub connection_method: Option<String>,
    // T030: Attachment type - 'file' (default), 'test_result' (device data), 'generated_pdf'
    pub attachment_type: Option<String>,
}

// T025: MedicalRecordHistory model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordHistory {
    pub id: i64,
    pub medical_record_id: i64,
    pub version: i32,
    pub changed_fields: Option<String>, // JSON string
    pub old_values: Option<String>, // JSON string
    pub new_values: Option<String>, // JSON string
    pub changed_by: Option<String>,
    pub changed_at: DateTime<Utc>,
}

// T026: Currency model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Currency {
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDataInput {
    pub device_test_data: serde_json::Value,
    pub device_type: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMedicalRecordInput {
    pub patient_id: i64,
    pub record_type: String,
    pub name: String,
    pub procedure_name: Option<String>,
    pub description: String,
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
    // Optional device test data for PDF generation (legacy single device)
    pub device_test_data: Option<serde_json::Value>,
    pub device_type: Option<String>,
    pub device_name: Option<String>,
    // New: support for multiple devices
    pub device_data_list: Option<Vec<DeviceDataInput>>,
}

use crate::models::dto::MaybeNull;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMedicalRecordInput {
    pub name: Option<String>,
    pub procedure_name: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub price: MaybeNull<f64>,
    #[serde(default)]
    pub currency_id: MaybeNull<i64>,
    pub is_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordFilter {
    pub record_type: Option<String>,
    pub is_archived: Option<bool>,
    pub search_term: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginationParams {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalRecordsResponse {
    pub records: Vec<MedicalRecord>,
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