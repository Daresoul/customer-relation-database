use std::collections::HashMap;
use std::process::{Command, Stdio};
#[allow(unused_imports)]
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};
use serde_json::Value;
use std::path::PathBuf;
use std::fs;

/// Java PDF service - calls the iText 5 JAR for PDF generation
/// This provides 100% identical output to the original print-app
pub struct JavaPdfService;

#[derive(Debug, Serialize, Deserialize)]
struct JavaPdfInput {
    patient: JavaPatient,
    samples: Vec<JavaSample>,
    output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct JavaPatient {
    name: String,
    owner: String,
    species: String,
    microchip_id: Option<String>,
    gender: String,
    date_of_birth: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JavaSample {
    device_type: String,
    sample_id: String,
    patient_id: String,
    detected_at: String,
    test_results: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test_type: Option<String>,
}

impl JavaPdfService {
    /// Generate a PDF using the Java JAR (iText 5) with multiple device samples
    pub fn generate_pdf_multi(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data_list: &[crate::services::device_pdf_service::DeviceTestData],
    ) -> Result<(), String> {
        log::info!("☕ Generating PDF using Java JAR (iText 5) with {} samples...", device_data_list.len());

        // Sort samples in the order Java expects: Exigo, Pointcare, Healvet, PCR
        // PCR samples go last as they are rendered on separate pages
        // This is critical for correct PDF layout (Java PDF code line 273)
        let mut sorted_samples = device_data_list.to_vec();
        sorted_samples.sort_by_key(|device| {
            match device.device_type.as_str() {
                "exigo_eos_vet" => 0,              // Exigo first
                "mnchip_pointcare_chemistry" => 1, // Pointcare chemistry second
                "healvet_hv_fia_3000" => 2,        // Healvet third
                "mnchip_pcr_analyzer" => 3,        // PCR last (separate page)
                _ => 99,                            // Unknown devices last
            }
        });

        log::debug!("   📋 Sorted samples order:");
        for (i, device) in sorted_samples.iter().enumerate() {
            log::debug!("      {}. {} ({})", i + 1, device.device_name, device.device_type);
        }

        // Convert all device data to Java samples
        let java_samples: Vec<JavaSample> = sorted_samples.iter().map(|device_data| {
            let test_results = Self::value_to_hashmap(&device_data.test_results);

            let sample_id = device_data.test_results.get("SNO")
                .or_else(|| device_data.test_results.get("ID1"))
                .or_else(|| device_data.test_results.get("sample_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("AUTO-GEN")
                .to_string();

            let patient_id = device_data.patient_identifier
                .clone()
                .unwrap_or_else(|| "N/A".to_string());

            let java_device_type = Self::map_device_type(&device_data.device_type);

            JavaSample {
                device_type: java_device_type,
                sample_id,
                patient_id,
                detected_at: device_data.detected_at.to_rfc3339(),
                test_results,
                test_type: None,
            }
        }).collect();

        // Create Java patient
        let java_patient = JavaPatient {
            name: patient.name.clone(),
            owner: patient.owner.clone(),
            species: patient.species.clone(),
            microchip_id: patient.microchip_id.clone(),
            gender: patient.gender.clone(),
            date_of_birth: patient.date_of_birth.clone(),
        };

        // Create Java PDF input
        let java_input = JavaPdfInput {
            patient: java_patient,
            samples: java_samples,
            output_path: output_path.to_string(),
        };

        // Create temp JSON file for input
        let temp_dir = std::env::temp_dir();
        let input_json_path = temp_dir.join(format!("pdf_input_{}.json", Utc::now().timestamp()));

        // Write JSON to temp file
        let json_str = serde_json::to_string_pretty(&java_input)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        log::debug!("   🔍 DEBUG - Samples being sent to Java:");
        for (idx, sample) in java_input.samples.iter().enumerate() {
            log::debug!("   Sample #{} ({}): {} test results", idx + 1, sample.device_type, sample.test_results.len());
            for (key, value) in &sample.test_results {
                log::debug!("      {} = {}", key, value);
            }
        }

        fs::write(&input_json_path, json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        log::debug!("   📄 Input JSON created: {:?}", input_json_path);

        // Get JAR path (in pdf-generator-cli/build/libs/)
        let jar_path = Self::get_jar_path(app_handle)?;

        log::info!("   ☕ JAR path: {:?}", jar_path);
        log::info!("   📂 Output path: {}", output_path);

        // Call Java JAR
        let output = Self::create_java_command(&jar_path, &input_json_path)
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;

        // Clean up temp JSON file
        let _ = fs::remove_file(&input_json_path);

        // Check if command was successful
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Java JAR failed:\nSTDOUT: {}\nSTDERR: {}",
                stdout, stderr
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("   ✅ Java output: {}", stdout);

        // Verify PDF was created
        if !PathBuf::from(output_path).exists() {
            return Err(format!("PDF was not created at: {}", output_path));
        }

        log::info!("✅ Java PDF generated successfully");
        Ok(())
    }

    /// Create a Java command configured to prevent macOS focus-stealing.
    /// Sets headless mode flags, redirects stdin to null, and on macOS
    /// creates a new process group to isolate the child process.
    fn create_java_command(jar_path: &PathBuf, input_json_path: &PathBuf) -> Command {
        let mut cmd = Command::new("java");
        cmd.arg("-Djava.awt.headless=true")
            .arg("-Dapple.awt.UIElement=true")
            .arg("-Djava.awt.GraphicsEnvironment=sun.java2d.HeadlessGraphicsEnvironment")
            .arg("-jar")
            .arg(jar_path)
            .arg(input_json_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // On macOS/Linux, create a new process group so the child
        // doesn't inherit the parent's window session
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        // On Windows, prevent a console window from flashing
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd
    }

    /// Get the path to the JAR file
    /// In development: uses relative path to pdf-generator-cli build output
    /// In production: uses Tauri's resource resolver to locate bundled resources
    fn get_jar_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        // In development mode: use relative path to project
        if cfg!(debug_assertions) {
            // Try relative path from src-tauri directory
            let dev_jar = PathBuf::from("../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if dev_jar.exists() {
                log::debug!("   🔧 Using development JAR: {:?}", dev_jar);
                return Ok(dev_jar);
            }

            // Hardcoded fallback for development
            let fallback = PathBuf::from("/Users/tomato/git/customer-relation-database/pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if fallback.exists() {
                log::debug!("   🔧 Using fallback JAR: {:?}", fallback);
                return Ok(fallback);
            }

            return Err("Development JAR not found at pdf-generator-cli/build/libs/".to_string());
        }

        // In production mode: use Tauri's resource resolver
        // This automatically handles platform-specific resource locations:
        // - macOS: Contents/Resources/
        // - Windows: resources/ (handled by Tauri internally)
        // - Linux: resources/
        // Note: "resources/**" in tauri.conf.json bundles src-tauri/resources/* files,
        // so we reference them without the "resources/" prefix
        let resource_path = app_handle
            .path_resolver()
            .resolve_resource("resources/pdf-generator.jar")
            .ok_or_else(|| {
                "Could not resolve pdf-generator.jar resource path. Ensure it's bundled in src-tauri/resources/".to_string()
            })?;

        // On Windows, resolve_resource returns UNC paths (\\?\C:\...) which Java doesn't support
        // Use dunce to convert UNC paths to normal Windows paths (C:\...)
        #[cfg(windows)]
        let normalized_path = dunce::simplified(&resource_path).to_path_buf();

        // On other platforms, use the path as-is
        #[cfg(not(windows))]
        let normalized_path = resource_path;

        if !normalized_path.exists() {
            return Err(format!(
                "pdf-generator.jar not found at resolved path: {:?}. Ensure it's bundled in src-tauri/resources/",
                normalized_path
            ));
        }

        log::info!("   📦 Using production JAR: {:?}", normalized_path);
        Ok(normalized_path)
    }

    /// Convert JSON Value to HashMap<String, String>
    fn value_to_hashmap(value: &Value) -> HashMap<String, String> {
        if let Some(obj) = value.as_object() {
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
        }
    }

    /// Generate a PDF using the Java JAR (iText 5) with a single device sample
    /// Convenience wrapper for generate_pdf_multi
    pub fn generate_pdf(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data: &crate::services::device_pdf_service::DeviceTestData,
    ) -> Result<(), String> {
        Self::generate_pdf_multi(app_handle, output_path, patient, &[device_data.clone()])
    }

    /// Map detailed device type names to Java-expected format
    /// Java expects: "exigo_eos_vet", "healvet", "pointcare", or "pcr"
    /// We use: "exigo_eos_vet", "healvet_hv_fia_3000", "mnchip_pointcare_chemistry", "mnchip_pcr_analyzer"
    fn map_device_type(device_type: &str) -> String {
        match device_type {
            "healvet_hv_fia_3000" => "healvet".to_string(),
            "mnchip_pointcare_chemistry" => "pointcare".to_string(),
            "mnchip_pcr_analyzer" => "pcr".to_string(),
            "exigo_eos_vet" => "exigo_eos_vet".to_string(),
            _ => device_type.to_string(), // Pass through unknown types
        }
    }

    /// Generate a simple PDF report using the template (Rapport.pdf)
    /// This creates a report with title and description overlaid on the clinic letterhead
    pub fn generate_simple_report(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        title: &str,
        description: &str,
        patient_data: Option<&crate::services::device_pdf_service::PatientData>,
    ) -> Result<(), String> {
        log::info!("☕ Generating simple PDF report using Java JAR...");

        // Build JSON input for simple report mode
        let mut json_obj = serde_json::json!({
            "report_type": "simple",
            "title": title,
            "description": description,
            "output_path": output_path
        });

        // Add patient info if provided
        if let Some(patient) = patient_data {
            json_obj["patient"] = serde_json::json!({
                "name": patient.name,
                "owner": patient.owner,
                "species": patient.species,
                "microchip_id": patient.microchip_id,
                "gender": patient.gender,
                "date_of_birth": patient.date_of_birth
            });
        }

        // Create temp JSON file for input
        let temp_dir = std::env::temp_dir();
        let input_json_path = temp_dir.join(format!("simple_report_input_{}.json", Utc::now().timestamp()));

        // Write JSON to temp file
        let json_str = serde_json::to_string_pretty(&json_obj)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        fs::write(&input_json_path, json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        log::debug!("   📄 Simple report input JSON created: {:?}", input_json_path);

        // Get JAR path
        let jar_path = Self::get_jar_path(app_handle)?;

        log::info!("   ☕ JAR path: {:?}", jar_path);
        log::info!("   📂 Output path: {}", output_path);

        // Call Java JAR
        let output = Self::create_java_command(&jar_path, &input_json_path)
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;

        // Clean up temp JSON file
        let _ = fs::remove_file(&input_json_path);

        // Check if command was successful
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Java JAR failed:\nSTDOUT: {}\nSTDERR: {}",
                stdout, stderr
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("   ✅ Java output: {}", stdout);

        // Verify PDF was created
        if !PathBuf::from(output_path).exists() {
            return Err(format!("PDF was not created at: {}", output_path));
        }

        log::info!("✅ Simple report PDF generated successfully");
        Ok(())
    }

    /// Generate an invoice PDF using the invoice.pdf template
    /// Creates an invoice with dynamic line items table, totals, and form fields
    pub fn generate_invoice(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        date: &str,
        invoice_number: &str,
        recipient: &str,
        line_items: &[InvoiceLineItem],
        discount_percent: f64,
        currency: &str,
    ) -> Result<(), String> {
        log::info!("☕ Generating invoice PDF using Java JAR...");

        // Build line items JSON array
        let items_json: Vec<serde_json::Value> = line_items
            .iter()
            .map(|item| {
                serde_json::json!({
                    "name": item.name,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price
                })
            })
            .collect();

        let json_obj = serde_json::json!({
            "report_type": "invoice",
            "date": date,
            "invoice_number": invoice_number,
            "recipient": recipient,
            "line_items": items_json,
            "discount_percent": discount_percent,
            "currency": currency,
            "output_path": output_path
        });

        // Create temp JSON file for input
        let temp_dir = std::env::temp_dir();
        let input_json_path = temp_dir.join(format!("invoice_input_{}.json", Utc::now().timestamp()));

        // Write JSON to temp file
        let json_str = serde_json::to_string_pretty(&json_obj)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        fs::write(&input_json_path, &json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        log::debug!("   📄 Invoice input JSON created: {:?}", input_json_path);

        // Get JAR path
        let jar_path = Self::get_jar_path(app_handle)?;

        log::info!("   ☕ JAR path: {:?}", jar_path);
        log::info!("   📂 Output path: {}", output_path);

        // Call Java JAR
        let output = Self::create_java_command(&jar_path, &input_json_path)
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;

        // Clean up temp JSON file
        let _ = fs::remove_file(&input_json_path);

        // Check if command was successful
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Java JAR failed:\nSTDOUT: {}\nSTDERR: {}",
                stdout, stderr
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("   ✅ Java output: {}", stdout);

        // Verify PDF was created
        if !PathBuf::from(output_path).exists() {
            return Err(format!("PDF was not created at: {}", output_path));
        }

        log::info!("✅ Invoice PDF generated successfully");
        Ok(())
    }

    /// Generate a pharmacy note PDF using the pharmacy_note.pdf template
    /// Overlays prescription text onto the pre-designed template
    pub fn generate_pharmacy_note(
        app_handle: &tauri::AppHandle,
        output_path: &str,
        prescription_text: &str,
    ) -> Result<(), String> {
        log::info!("☕ Generating pharmacy note PDF using Java JAR...");

        let json_obj = serde_json::json!({
            "report_type": "pharmacy_note",
            "prescription_text": prescription_text,
            "output_path": output_path
        });

        // Create temp JSON file for input
        let temp_dir = std::env::temp_dir();
        let input_json_path = temp_dir.join(format!("pharmacy_note_input_{}.json", Utc::now().timestamp()));

        let json_str = serde_json::to_string_pretty(&json_obj)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        fs::write(&input_json_path, &json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        log::debug!("   📄 Pharmacy note input JSON created: {:?}", input_json_path);

        let jar_path = Self::get_jar_path(app_handle)?;

        log::info!("   ☕ JAR path: {:?}", jar_path);
        log::info!("   📂 Output path: {}", output_path);

        let output = Self::create_java_command(&jar_path, &input_json_path)
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;

        let _ = fs::remove_file(&input_json_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!(
                "Java JAR failed:\nSTDOUT: {}\nSTDERR: {}",
                stdout, stderr
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::info!("   ✅ Java output: {}", stdout);

        if !PathBuf::from(output_path).exists() {
            return Err(format!("PDF was not created at: {}", output_path));
        }

        log::info!("✅ Pharmacy note PDF generated successfully");
        Ok(())
    }
}

/// Line item data for invoice generation
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLineItem {
    pub name: String,
    pub quantity: i32,
    pub unit_price: f64,
}
