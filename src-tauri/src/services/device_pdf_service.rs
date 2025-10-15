use chrono::{DateTime, Utc};
use serde_json::Value;
use crate::services::java_pdf_service::JavaPdfService;

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

/// Centralized PDF generation service
/// Now exclusively uses Java JAR for all PDF generation
pub struct DevicePdfService;

impl DevicePdfService {
    /// Generate a PDF report from device data using Java iText 5
    /// This is the single source of truth for PDF generation
    pub fn generate_pdf(
        output_path: &str,
        patient: PatientData,
        device_data: DeviceTestData,
    ) -> Result<(), String> {
        println!("☕ Generating PDF using Java JAR (iText 5) for device type: {}", device_data.device_type);

        // All PDF generation now goes through Java JAR
        // This provides:
        // - 100% identical output to original print-app
        // - Font subsetting (small file sizes ~183KB)
        // - Macedonian translations
        // - Logo and social icons
        // - Professional styling with colors
        JavaPdfService::generate_pdf(output_path, &patient, &device_data)
    }
}
