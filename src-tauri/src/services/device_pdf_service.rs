use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde_json::Value;
use crate::services::pdf_report_generator::{PdfReportGenerator, PatientInfo as GenericPatientInfo, DeviceReportData};
use crate::services::exigo_pdf_generator::{ExigoPdfGenerator, parse_exigo_sample_data, PatientInfo as ExigoPatientInfo};

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
/// This ensures both file watcher and regenerate use the exact same logic
pub struct DevicePdfService;

impl DevicePdfService {
    /// Generate a PDF report from device data
    /// This is the single source of truth for PDF generation
    pub fn generate_pdf(
        output_path: &str,
        patient: PatientData,
        device_data: DeviceTestData,
    ) -> Result<(), String> {
        // Route to the appropriate generator based on device type
        match device_data.device_type.as_str() {
            "exigo_eos_vet" => {
                Self::generate_exigo_pdf(output_path, patient, device_data)
            }
            _ => {
                Self::generate_generic_pdf(output_path, patient, device_data)
            }
        }
    }

    /// Generate Exigo PDF with full color and styling
    fn generate_exigo_pdf(
        output_path: &str,
        patient: PatientData,
        device_data: DeviceTestData,
    ) -> Result<(), String> {
        println!("🎨 Generating Exigo PDF with colors and proper design");

        // Extract sample ID from results
        let sample_id = device_data.test_results.get("SNO")
            .or_else(|| device_data.test_results.get("ID1"))
            .and_then(|v| v.as_str())
            .unwrap_or("N/A");

        let default_patient_id = "N/A".to_string();
        let patient_id_str = device_data.patient_identifier
            .as_ref()
            .unwrap_or(&default_patient_id);

        // Parse Exigo sample data with correct parameter ordering
        let exigo_sample = parse_exigo_sample_data(
            &device_data.test_results,
            sample_id,
            patient_id_str,
            device_data.detected_at,
        )?;

        // Convert to Exigo patient info
        let exigo_patient = ExigoPatientInfo {
            name: patient.name,
            owner: patient.owner,
            species: patient.species,
            microchip_id: patient.microchip_id,
            gender: patient.gender,
            date_of_birth: patient.date_of_birth,
        };

        // Generate PDF using Exigo-specific generator
        let exigo_generator = ExigoPdfGenerator::with_default_clinic();
        exigo_generator.generate_report(output_path, exigo_patient, exigo_sample)?;

        println!("✅ Exigo PDF generated successfully with colors");
        Ok(())
    }

    /// Generate generic PDF for other device types
    fn generate_generic_pdf(
        output_path: &str,
        patient: PatientData,
        device_data: DeviceTestData,
    ) -> Result<(), String> {
        println!("📄 Generating generic PDF for device type: {}", device_data.device_type);

        // Convert test results to HashMap
        let results: HashMap<String, String> = if let Some(obj) = device_data.test_results.as_object() {
            obj.iter()
                .map(|(k, v)| {
                    let value_str = match v {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => v.to_string(),
                    };
                    (k.clone(), value_str)
                })
                .collect()
        } else {
            HashMap::new()
        };

        let report_data = vec![DeviceReportData {
            device_name: device_data.device_name,
            device_type: device_data.device_type,
            test_date: device_data.detected_at,
            results,
        }];

        // Convert to generic patient info
        let generic_patient = GenericPatientInfo {
            name: patient.name,
            owner: patient.owner,
            species: patient.species,
            breed: None,
            microchip_id: patient.microchip_id,
            gender: patient.gender,
            date_of_birth: patient.date_of_birth,
        };

        // Generate PDF using generic generator
        let generator = PdfReportGenerator::with_default_template();
        generator.generate_report(output_path, generic_patient, report_data)?;

        println!("✅ Generic PDF generated successfully");
        Ok(())
    }
}
