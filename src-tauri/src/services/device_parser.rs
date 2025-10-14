use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use quick_xml::Reader;
use quick_xml::events::Event;

/// Standardized device data structure that will be sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceData {
    pub device_type: String,
    pub device_name: String,
    pub connection_method: String, // e.g., "file_watch", "serial_port", "hl7_tcp"
    pub patient_identifier: Option<String>, // microchip, name, or other ID
    pub test_results: serde_json::Value,
    pub original_file_name: String,
    pub file_data: Vec<u8>,
    pub mime_type: String,
    pub detected_at: DateTime<Utc>,
}

pub struct DeviceParserService;

impl DeviceParserService {
    /// Parse Exigo Eos Vet XML file (hematology analyzer)
    /// Supports both formats:
    /// 1. Real Exigo format: <sample ID2="..." RBC="..." RBC_L="..." RBC_H="..." />
    /// 2. Test format with child elements: <PatientID>...</PatientID>
    pub fn parse_exigo_xml(
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let xml_str = String::from_utf8(file_data.to_vec())
            .map_err(|e| format!("Invalid UTF-8 in XML file: {}", e))?;

        let mut reader = Reader::from_str(&xml_str);
        reader.trim_text(true);

        let mut results: HashMap<String, String> = HashMap::new();
        let mut current_element = String::new();
        let mut patient_id: Option<String> = None;

        loop {
            match reader.read_event() {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                    let element_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    current_element = element_name.clone();

                    // Check if this is a <sample> element with attributes (real Exigo format)
                    if element_name.eq_ignore_ascii_case("sample") {
                        // Parse all attributes from the sample element
                        for attr_result in e.attributes() {
                            if let Ok(attr) = attr_result {
                                let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                let value = String::from_utf8_lossy(&attr.value).to_string();

                                // ID2 is the patient identifier in real Exigo format
                                if key == "ID2" && patient_id.is_none() {
                                    patient_id = Some(value.clone());
                                }

                                results.insert(key, value);
                            }
                        }
                    }
                }
                Ok(Event::Text(e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    if !text.trim().is_empty() {
                        // Look for patient identifiers in child elements (test format)
                        if current_element.to_lowercase().contains("patient")
                            || current_element.to_lowercase().contains("id")
                            || current_element.to_lowercase().contains("microchip")
                        {
                            if patient_id.is_none() {
                                patient_id = Some(text.trim().to_string());
                            }
                        }
                        results.insert(current_element.clone(), text.trim().to_string());
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    eprintln!("XML parse error at position {}: {}", reader.buffer_position(), e);
                    break;
                }
                _ => {}
            }
        }

        Ok(DeviceData {
            device_type: "exigo_eos_vet".to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: serde_json::to_value(results)
                .map_err(|e| format!("Failed to serialize results: {}", e))?,
            original_file_name: file_name.to_string(),
            file_data: file_data.to_vec(),
            mime_type: "application/xml".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Parse Healvet HV-FIA 3000 serial data (chemistry analyzer)
    pub fn parse_healvet_serial(
        device_name: &str,
        serial_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(serial_data).to_string();

        // Healvet typically sends data in a structured format
        // This is a basic parser - adjust based on actual protocol
        let mut results: HashMap<String, String> = HashMap::new();
        let mut patient_id: Option<String> = None;

        // Parse line by line
        for line in data_str.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Look for key-value pairs (common format: KEY: VALUE or KEY=VALUE)
            if let Some((key, value)) = line.split_once(':').or_else(|| line.split_once('=')) {
                let key_trimmed = key.trim();
                let value_trimmed = value.trim();

                // Check for patient identifiers
                if key_trimmed.to_lowercase().contains("patient")
                    || key_trimmed.to_lowercase().contains("id")
                    || key_trimmed.to_lowercase().contains("microchip")
                {
                    if patient_id.is_none() {
                        patient_id = Some(value_trimmed.to_string());
                    }
                }

                results.insert(key_trimmed.to_string(), value_trimmed.to_string());
            } else {
                // Store unparsed lines with index
                results.insert(format!("line_{}", results.len()), line.to_string());
            }
        }

        // Generate filename based on timestamp
        let file_name = format!("healvet_data_{}.txt", Utc::now().timestamp());

        Ok(DeviceData {
            device_type: "healvet_hv_fia_3000".to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: serde_json::to_value(results)
                .map_err(|e| format!("Failed to serialize results: {}", e))?,
            original_file_name: file_name.clone(),
            file_data: serial_data.to_vec(),
            mime_type: "text/plain".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Parse MNCHIP PointCare PCR V1 data (supports both file and serial)
    pub fn parse_mnchip_data(
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(file_data).to_string();

        // MNCHIP could send JSON, CSV, or custom format
        // Try JSON first
        let (results, patient_id) = if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&data_str) {
            // It's JSON
            let patient_id = json_value.get("patientId")
                .or_else(|| json_value.get("patient_id"))
                .or_else(|| json_value.get("microchip"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            (json_value, patient_id)
        } else {
            // Fall back to line-by-line parsing (similar to Healvet)
            let mut results: HashMap<String, String> = HashMap::new();
            let mut patient_id: Option<String> = None;

            for line in data_str.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                if let Some((key, value)) = line.split_once(':').or_else(|| line.split_once('=')) {
                    let key_trimmed = key.trim();
                    let value_trimmed = value.trim();

                    if key_trimmed.to_lowercase().contains("patient")
                        || key_trimmed.to_lowercase().contains("id")
                        || key_trimmed.to_lowercase().contains("microchip")
                    {
                        if patient_id.is_none() {
                            patient_id = Some(value_trimmed.to_string());
                        }
                    }

                    results.insert(key_trimmed.to_string(), value_trimmed.to_string());
                } else {
                    results.insert(format!("line_{}", results.len()), line.to_string());
                }
            }

            (serde_json::to_value(results)
                .map_err(|e| format!("Failed to serialize results: {}", e))?,
             patient_id)
        };

        // Determine mime type from filename
        let mime_type = if file_name.ends_with(".json") {
            "application/json"
        } else if file_name.ends_with(".csv") {
            "text/csv"
        } else if file_name.ends_with(".xml") {
            "application/xml"
        } else {
            "text/plain"
        };

        Ok(DeviceData {
            device_type: "mnchip_pointcare_pcr_v1".to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: results,
            original_file_name: file_name.to_string(),
            file_data: file_data.to_vec(),
            mime_type: mime_type.to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Route to appropriate parser based on device type
    pub fn parse_device_data(
        device_type: &str,
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        match device_type {
            "exigo_eos_vet" => Self::parse_exigo_xml(device_name, file_name, file_data, connection_method),
            "healvet_hv_fia_3000" => Self::parse_healvet_serial(device_name, file_data, connection_method),
            "mnchip_pointcare_pcr_v1" => Self::parse_mnchip_data(device_name, file_name, file_data, connection_method),
            _ => Err(format!("Unknown device type: {}", device_type)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_exigo_xml_child_elements() {
        let xml_data = r#"
            <?xml version="1.0"?>
            <TestResult>
                <PatientID>12345</PatientID>
                <MicrochipID>ABC123XYZ</MicrochipID>
                <WBC>7.2</WBC>
                <RBC>5.4</RBC>
                <HGB>14.2</HGB>
            </TestResult>
        "#;

        let result = DeviceParserService::parse_exigo_xml(
            "Test Device",
            "test.xml",
            xml_data.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let device_data = result.unwrap();
        assert_eq!(device_data.device_type, "exigo_eos_vet");
        assert!(device_data.patient_identifier.is_some());
    }

    #[test]
    fn test_parse_exigo_xml_real_format() {
        // Real Exigo format with attributes on sample element
        let xml_data = r#"
            <?xml version="1.0"?>
            <results>
                <sample ID2="123456789" SNO="EXIGO-001" DATE="2025-01-14 14:30:00"
                        RBC="5.4" RBC_L="5.0" RBC_H="8.5"
                        WBC="7.2" WBC_L="6.0" WBC_H="17.0"
                        HGB="14.2" HGB_L="12.0" HGB_H="18.0" />
            </results>
        "#;

        let result = DeviceParserService::parse_exigo_xml(
            "Exigo Device",
            "exigo_test.xml",
            xml_data.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let device_data = result.unwrap();
        assert_eq!(device_data.device_type, "exigo_eos_vet");
        assert_eq!(device_data.patient_identifier, Some("123456789".to_string()));

        // Verify test results contain the attributes
        let results_map = device_data.test_results.as_object().unwrap();
        assert_eq!(results_map.get("RBC").unwrap().as_str().unwrap(), "5.4");
        assert_eq!(results_map.get("WBC").unwrap().as_str().unwrap(), "7.2");
        assert_eq!(results_map.get("SNO").unwrap().as_str().unwrap(), "EXIGO-001");
    }

    #[test]
    fn test_parse_healvet_serial() {
        let serial_data = b"Patient ID: DOG-001\nGlucose: 95\nCholesterol: 180\n";

        let result = DeviceParserService::parse_healvet_serial("Test Healvet", serial_data, "serial_port");

        assert!(result.is_ok());
        let device_data = result.unwrap();
        assert_eq!(device_data.device_type, "healvet_hv_fia_3000");
    }

    #[test]
    fn test_parse_mnchip_json() {
        let json_data = r#"{"patientId": "CAT-123", "testType": "PCR", "result": "negative"}"#;

        let result = DeviceParserService::parse_mnchip_data(
            "Test MNCHIP",
            "test.json",
            json_data.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let device_data = result.unwrap();
        assert_eq!(device_data.device_type, "mnchip_pointcare_pcr_v1");
        assert_eq!(device_data.patient_identifier, Some("CAT-123".to_string()));
    }
}
