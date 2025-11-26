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
    /// Format: Multiple #AFS1000&SAMPLE_ID&RESULT&DATETIME&&PARAM_CODE&PATIENT_ID&&GENDER&SAMPLE_TYPE messages ending with EE
    /// The Healvet sends ALL parameters in ONE continuous stream, all ending with a single EE marker
    pub fn parse_healvet_serial(
        device_name: &str,
        serial_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(serial_data).to_string();

        println!("🔍 [DEBUG] Parsing Healvet accumulated data ({} bytes)", serial_data.len());
        println!("🔍 [DEBUG] Raw data: {}", data_str);

        // Strip the trailing EE marker
        let data_str = data_str.strip_suffix("EE")
            .or_else(|| data_str.strip_suffix("&EE"))
            .unwrap_or(&data_str);

        // Split by #AFS1000 to get individual parameter messages
        // Each message is: #AFS1000&SAMPLE_ID&RESULT&DATETIME&&PARAM_CODE&PATIENT_ID&&GENDER&SAMPLE_TYPE
        let messages: Vec<&str> = data_str.split("#AFS1000")
            .filter(|s| !s.trim().is_empty())
            .collect();

        println!("🔍 [DEBUG] Found {} parameter messages", messages.len());

        if messages.is_empty() {
            return Err("No valid Healvet messages found in data".to_string());
        }

        // Parse all parameters into a flat HashMap (like Exigo does)
        let mut test_results: HashMap<String, String> = HashMap::new();
        let mut patient_id: Option<String> = None;
        let mut gender: Option<String> = None;
        let mut sample_type: Option<String> = None;
        let mut datetime: Option<String> = None;

        for (idx, message) in messages.iter().enumerate() {
            println!("🔍 [DEBUG] Parsing message {}: {}", idx + 1, message);

            // Split by & to get fields
            let fields: Vec<&str> = message.split('&').collect();

            if fields.len() < 10 {
                println!("⚠️  [WARN] Message {} has only {} fields, skipping", idx + 1, fields.len());
                continue;
            }

            // Extract fields according to Healvet protocol
            // Fields: [0]="", [1]=SAMPLE_ID, [2]=RESULT, [3]=DATETIME, [4]="", [5]=PARAM_CODE, [6]=PATIENT_ID, [7]="", [8]=GENDER, [9]=SAMPLE_TYPE
            let sample_id = fields.get(1).unwrap_or(&"").trim().to_string();
            let result = fields.get(2).unwrap_or(&"").trim().to_string();
            let msg_datetime = fields.get(3).unwrap_or(&"").trim().to_string();
            let param_code = fields.get(5).unwrap_or(&"").trim().to_string();
            let msg_patient_id = fields.get(6).unwrap_or(&"").trim().to_string();
            let msg_gender = fields.get(8).unwrap_or(&"").trim().to_string();
            let msg_sample_type = fields.get(9).unwrap_or(&"").trim().to_string();

            println!("📋 [DEBUG] Param {}: {} = {} (Patient: {}, Sample: {})",
                idx + 1, param_code, result, msg_patient_id, sample_id);

            // Store first patient_id, gender, sample_type as they should be same for all
            if patient_id.is_none() && !msg_patient_id.is_empty() {
                patient_id = Some(msg_patient_id.clone());
            }
            if gender.is_none() && !msg_gender.is_empty() {
                gender = Some(msg_gender.clone());
            }
            if sample_type.is_none() && !msg_sample_type.is_empty() {
                sample_type = Some(msg_sample_type.clone());
            }
            if datetime.is_none() && !msg_datetime.is_empty() {
                datetime = Some(msg_datetime.clone());
            }

            // Add parameter as direct key-value pair (like Exigo)
            // This is what the Java PDF generator expects
            test_results.insert(param_code.clone(), result.clone());
        }

        println!("✅ [DEBUG] Successfully parsed {} parameters", test_results.len());

        // Generate filename for the chemistry panel
        let patient_label = patient_id.as_ref().map(|s| s.as_str()).unwrap_or("Unknown");
        let file_name = format!("healvet_chemistry_panel_{}_{}.json", patient_label, Utc::now().timestamp());

        // Serialize test_results to JSON for file storage
        let json_value = serde_json::to_value(&test_results)
            .map_err(|e| format!("Failed to serialize test results: {}", e))?;
        let json_string = serde_json::to_string_pretty(&json_value)
            .map_err(|e| format!("Failed to stringify test results: {}", e))?;

        Ok(DeviceData {
            device_type: "healvet_hv_fia_3000".to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: json_value,
            original_file_name: file_name.clone(),
            file_data: json_string.into_bytes(),  // Store JSON, not raw serial data
            mime_type: "application/json".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Parse MNCHIP PointCare PCR V1 HL7 serial data
    /// Protocol: HL7 v2.x with pipe-delimited messages
    /// Format:
    ///   MSH|...  (Message Header)
    ///   PID|...|sampleId|...|patient|...|gender|...  (Patient Identification)
    ///   OBR|...|dateTime|...|sampleType|...|testType|...  (Observation Request)
    ///   OBX|examinedItemNum|...|paramCode|result|unit|ranges|indicator|...  (Results)
    ///   \r\r (Two consecutive carriage returns signal end)
    pub fn parse_mnchip_data(
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(file_data).to_string();

        println!("🔍 [DEBUG] Parsing PointCare HL7 data ({} bytes)", file_data.len());
        println!("🔍 [DEBUG] Raw data preview: {}", &data_str[..data_str.len().min(200)]);

        // Strip trailing end markers (two \r\r)
        let data_str = data_str.trim_end_matches('\r').trim_end();

        // Parse HL7 message line by line
        let mut test_results: HashMap<String, String> = HashMap::new();
        let mut patient_id: Option<String> = None;
        let mut sample_id: Option<String> = None;
        let mut test_type: Option<String> = None;

        for line in data_str.split('\r') {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Split by pipe delimiter
            let fields: Vec<&str> = line.split('|').collect();
            if fields.is_empty() {
                continue;
            }

            let message_type = fields[0].trim();

            match message_type {
                "MSH" => {
                    // Message Header - signals start of new sample
                    println!("📥 [DEBUG] New PointCare HL7 message detected");
                }
                "PID" => {
                    // Patient Identification
                    // Fields: [0]PID | [1]unused | [2]unused | [3]sampleId | ... | [6]patient | ... | [10]gender
                    if let Some(&sid) = fields.get(3) {
                        sample_id = Some(sid.trim().to_string());
                    }
                    if let Some(&pid) = fields.get(6) {
                        patient_id = Some(pid.trim().to_string());
                    }
                    println!("👤 [DEBUG] Patient: {:?}, Sample: {:?}", patient_id, sample_id);
                }
                "OBR" => {
                    // Observation Request
                    // Fields: [0]OBR | ... | [7]dateTime | [15]sampleType | [45]testType
                    if let Some(&ttype) = fields.get(45) {
                        test_type = Some(ttype.trim().to_string());
                    }
                    println!("📋 [DEBUG] Test type: {:?}", test_type);
                }
                "OBX" => {
                    // Observation Result
                    // Fields: [0]OBX | [1]examinedItemNum | ... | [4]paramCode | [5]result | [6]unit | [7]ranges | [8]indicator
                    let param_code = fields.get(4).map(|s| s.trim()).unwrap_or("");
                    let result = fields.get(5).map(|s| s.trim()).unwrap_or("");

                    if !param_code.is_empty() && !result.is_empty() {
                        test_results.insert(param_code.to_string(), result.to_string());
                        println!("   📊 {} = {}", param_code, result);
                    }
                }
                _ => {
                    println!("⚠️  [WARN] Unknown HL7 message type: {}", message_type);
                }
            }
        }

        println!("✅ [DEBUG] Parsed {} parameters", test_results.len());

        // Generate filename for the biochemistry panel
        let patient_label = patient_id.as_ref().map(|s| s.as_str()).unwrap_or("Unknown");
        let file_name = format!("pointcare_biochemistry_{}_{}.json", patient_label, Utc::now().timestamp());

        // Serialize test_results to JSON for file storage
        let json_value = serde_json::to_value(&test_results)
            .map_err(|e| format!("Failed to serialize test results: {}", e))?;
        let json_string = serde_json::to_string_pretty(&json_value)
            .map_err(|e| format!("Failed to stringify test results: {}", e))?;

        Ok(DeviceData {
            device_type: "mnchip_pointcare_pcr_v1".to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: json_value,
            original_file_name: file_name.clone(),
            file_data: json_string.into_bytes(),  // Store JSON, not raw HL7 data
            mime_type: "application/json".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Parse stored JSON file for Healvet or Pointcare devices
    /// When files are stored, they're already converted to JSON format
    /// This parser handles re-reading those stored JSON files
    pub fn parse_stored_json(
        device_type: &str,
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let json_str = String::from_utf8(file_data.to_vec())
            .map_err(|e| format!("Invalid UTF-8 in JSON file: {}", e))?;

        println!("🔍 [DEBUG] Parsing stored JSON for {} ({} bytes)", device_type, file_data.len());
        println!("🔍 [DEBUG] JSON content: {}", &json_str[..json_str.len().min(200)]);

        // Parse as JSON
        let json_value: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // The stored JSON is a flat HashMap of param -> value
        let test_results = if let Some(obj) = json_value.as_object() {
            println!("✅ [DEBUG] Parsed {} parameters from stored JSON", obj.len());
            json_value.clone()
        } else {
            return Err("Stored JSON is not an object".to_string());
        };

        Ok(DeviceData {
            device_type: device_type.to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: None, // Patient ID is not stored in the JSON
            test_results,
            original_file_name: file_name.to_string(),
            file_data: file_data.to_vec(),
            mime_type: "application/json".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Route to appropriate parser based on device type
    /// For Healvet and Pointcare: detects whether file is stored JSON or raw serial/HL7 data
    pub fn parse_device_data(
        device_type: &str,
        device_name: &str,
        file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        match device_type {
            "exigo_eos_vet" => Self::parse_exigo_xml(device_name, file_name, file_data, connection_method),
            "healvet_hv_fia_3000" => {
                // Check if file is stored JSON or raw serial data
                let data_str = String::from_utf8_lossy(file_data);
                if data_str.trim().starts_with('{') {
                    // Stored JSON format
                    Self::parse_stored_json(device_type, device_name, file_name, file_data, connection_method)
                } else {
                    // Raw serial format
                    Self::parse_healvet_serial(device_name, file_data, connection_method)
                }
            },
            "mnchip_pointcare_pcr_v1" => {
                // Check if file is stored JSON or raw HL7 data
                let data_str = String::from_utf8_lossy(file_data);
                if data_str.trim().starts_with('{') {
                    // Stored JSON format
                    Self::parse_stored_json(device_type, device_name, file_name, file_data, connection_method)
                } else {
                    // Raw HL7 format
                    Self::parse_mnchip_data(device_name, file_name, file_data, connection_method)
                }
            },
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
