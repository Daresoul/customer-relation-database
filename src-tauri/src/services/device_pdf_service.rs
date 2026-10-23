use chrono::{DateTime, Utc};
use serde_json::Value;

/// Patient information for PDF generation
#[derive(Debug, Clone)]
pub struct PatientData {
    pub name: String,
    pub owner: String,
    pub species: String,
    pub microchip_id: Option<String>,
    pub gender: String,
    pub date_of_birth: Option<String>,
}

/// Device test results data
#[derive(Debug, Clone)]
pub struct DeviceTestData {
    pub device_type: String,
    pub device_name: String,
    pub test_results: Value,
    pub detected_at: DateTime<Utc>,
    pub patient_identifier: Option<String>,
}
