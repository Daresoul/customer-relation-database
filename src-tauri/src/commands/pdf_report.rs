use crate::services::pdf_report_generator::{
    PdfReportGenerator, PatientInfo, DeviceReportData, ReportTemplate,
};
use crate::database::connection::DatabasePool;
use crate::models::Patient;
use tauri::State;
use sqlx::Row;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDataInput {
    pub device_name: String,
    pub device_type: String,
    pub test_date: String, // ISO 8601 format
    pub results: HashMap<String, String>, // Generic key-value pairs
}

/// Generate a PDF report from device data
#[tauri::command]
pub async fn generate_device_report_pdf(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    device_data: Vec<DeviceDataInput>,
    output_path: String,
) -> Result<String, String> {
    let pool_guard = pool.lock().await;

    // Fetch patient info from database
    let patient_row = sqlx::query(
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.microchip_id, p.household_id,
                s.name as species,
                b.name as breed,
                h.primary_contact_name as owner
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         LEFT JOIN households h ON p.household_id = h.id
         WHERE p.id = ?
         LIMIT 1"
    )
    .bind(patient_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| format!("Patient with ID {} not found", patient_id))?;

    let patient_info = PatientInfo {
        name: patient_row.get("name"),
        owner: patient_row.get::<Option<String>, _>("owner").unwrap_or_else(|| "Unknown".to_string()),
        species: patient_row.get::<Option<String>, _>("species").unwrap_or_else(|| "Unknown".to_string()),
        breed: patient_row.get("breed"),
        microchip_id: patient_row.get("microchip_id"),
        gender: patient_row.get("gender"),
        date_of_birth: patient_row.get("date_of_birth"),
    };

    // Convert device data input to report format
    let report_data: Vec<DeviceReportData> = device_data
        .into_iter()
        .map(|d| {
            let test_date = DateTime::parse_from_rfc3339(&d.test_date)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            DeviceReportData {
                device_name: d.device_name,
                device_type: d.device_type,
                test_date,
                results: d.results,
            }
        })
        .collect();

    // Generate PDF
    let generator = PdfReportGenerator::with_default_template();
    generator
        .generate_report(&output_path, patient_info, report_data)
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    Ok(output_path)
}

/// Generate a PDF report from device data with custom template
#[tauri::command]
pub async fn generate_device_report_pdf_custom(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    device_data: Vec<DeviceDataInput>,
    output_path: String,
    clinic_name: Option<String>,
    clinic_address: Option<String>,
    clinic_phone: Option<String>,
    clinic_email: Option<String>,
    clinic_website: Option<String>,
) -> Result<String, String> {
    let pool_guard = pool.lock().await;

    // Fetch patient info
    let patient_row = sqlx::query(
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.microchip_id, p.household_id,
                s.name as species,
                b.name as breed,
                h.primary_contact_name as owner
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         LEFT JOIN households h ON p.household_id = h.id
         WHERE p.id = ?
         LIMIT 1"
    )
    .bind(patient_id)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| format!("Patient with ID {} not found", patient_id))?;

    let patient_info = PatientInfo {
        name: patient_row.get("name"),
        owner: patient_row.get::<Option<String>, _>("owner").unwrap_or_else(|| "Unknown".to_string()),
        species: patient_row.get::<Option<String>, _>("species").unwrap_or_else(|| "Unknown".to_string()),
        breed: patient_row.get("breed"),
        microchip_id: patient_row.get("microchip_id"),
        gender: patient_row.get("gender"),
        date_of_birth: patient_row.get("date_of_birth"),
    };

    // Convert device data
    let report_data: Vec<DeviceReportData> = device_data
        .into_iter()
        .map(|d| {
            let test_date = DateTime::parse_from_rfc3339(&d.test_date)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            DeviceReportData {
                device_name: d.device_name,
                device_type: d.device_type,
                test_date,
                results: d.results,
            }
        })
        .collect();

    // Create custom template
    let mut template = ReportTemplate::default();
    if let Some(name) = clinic_name {
        template.clinic_name = name;
    }
    if let Some(address) = clinic_address {
        template.clinic_address = address;
    }
    if let Some(phone) = clinic_phone {
        template.clinic_phone = phone;
    }
    if let Some(email) = clinic_email {
        template.clinic_email = email;
    }
    if let Some(website) = clinic_website {
        template.clinic_website = website;
    }

    // Generate PDF
    let generator = PdfReportGenerator::new(template);
    generator
        .generate_report(&output_path, patient_info, report_data)
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    Ok(output_path)
}
