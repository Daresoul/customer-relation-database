use std::collections::HashMap;
use std::process::Command;
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
    /// Generate a PDF using the Java JAR (iText 5)
    pub fn generate_pdf(
        output_path: &str,
        patient: &crate::services::device_pdf_service::PatientData,
        device_data: &crate::services::device_pdf_service::DeviceTestData,
    ) -> Result<(), String> {
        println!("☕ Generating PDF using Java JAR (iText 5)...");

        // Convert test_results Value to HashMap<String, String>
        let test_results = Self::value_to_hashmap(&device_data.test_results);

        // Create sample ID
        let sample_id = device_data.test_results.get("SNO")
            .or_else(|| device_data.test_results.get("ID1"))
            .and_then(|v| v.as_str())
            .unwrap_or("AUTO-GEN")
            .to_string();

        // Create patient ID
        let patient_id = device_data.patient_identifier
            .clone()
            .unwrap_or_else(|| "N/A".to_string());

        // Create Java sample
        let java_sample = JavaSample {
            device_type: device_data.device_type.clone(),
            sample_id,
            patient_id,
            detected_at: device_data.detected_at.to_rfc3339(),
            test_results,
            test_type: None,
        };

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
            samples: vec![java_sample],
            output_path: output_path.to_string(),
        };

        // Create temp JSON file for input
        let temp_dir = std::env::temp_dir();
        let input_json_path = temp_dir.join(format!("pdf_input_{}.json", Utc::now().timestamp()));

        // Write JSON to temp file
        let json_str = serde_json::to_string_pretty(&java_input)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        println!("   🔍 DEBUG - Test results being sent to Java:");
        if let Some(sample) = java_input.samples.first() {
            for (key, value) in &sample.test_results {
                println!("      {} = {}", key, value);
            }
        }

        fs::write(&input_json_path, json_str)
            .map_err(|e| format!("Failed to write temp JSON file: {}", e))?;

        println!("   📄 Input JSON created: {:?}", input_json_path);

        // Get JAR path (in pdf-generator-cli/build/libs/)
        let jar_path = Self::get_jar_path()?;

        println!("   ☕ JAR path: {:?}", jar_path);
        println!("   📂 Output path: {}", output_path);

        // Call Java JAR
        let output = Command::new("java")
            .arg("-jar")
            .arg(&jar_path)
            .arg(&input_json_path)
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
        println!("   ✅ Java output: {}", stdout);

        // Verify PDF was created
        if !PathBuf::from(output_path).exists() {
            return Err(format!("PDF was not created at: {}", output_path));
        }

        println!("✅ Java PDF generated successfully");
        Ok(())
    }

    /// Get the path to the JAR file
    /// In development: uses relative path to pdf-generator-cli build output
    /// In production: uses bundled resource from src-tauri/resources/
    fn get_jar_path() -> Result<PathBuf, String> {
        // In development mode: use relative path to project
        if cfg!(debug_assertions) {
            // Try relative path from src-tauri directory
            let dev_jar = PathBuf::from("../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if dev_jar.exists() {
                println!("   🔧 Using development JAR: {:?}", dev_jar);
                return Ok(dev_jar);
            }

            // Hardcoded fallback for development
            let fallback = PathBuf::from("/Users/tomato/git/customer-relation-database/pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
            if fallback.exists() {
                println!("   🔧 Using fallback JAR: {:?}", fallback);
                return Ok(fallback);
            }

            return Err("Development JAR not found at pdf-generator-cli/build/libs/".to_string());
        }

        // In production mode: look for bundled resource
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // On macOS, resources are in Contents/Resources/ relative to Contents/MacOS/
                #[cfg(target_os = "macos")]
                {
                    let resources_jar = exe_dir.parent()
                        .map(|p| p.join("Resources/pdf-generator.jar"));
                    if let Some(jar_path) = resources_jar {
                        if jar_path.exists() {
                            println!("   📦 Using production JAR (macOS): {:?}", jar_path);
                            return Ok(jar_path);
                        }
                    }
                }

                // On Linux/Windows, resources are next to executable
                #[cfg(not(target_os = "macos"))]
                {
                    let jar_path = exe_dir.join("pdf-generator.jar");
                    if jar_path.exists() {
                        println!("   📦 Using production JAR: {:?}", jar_path);
                        return Ok(jar_path);
                    }
                }
            }
        }

        Err("Could not find pdf-generator.jar - ensure it's bundled in src-tauri/resources/".to_string())
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
}
