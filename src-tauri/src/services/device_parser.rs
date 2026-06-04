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
    /// Parse Exigo Eos Vet XML file (hematology analyzer).
    ///
    /// Handles two distinct on-the-wire formats:
    ///
    /// 1. **Real Exigo Eos Vet output** (what actual production machines produce):
    ///    ```xml
    ///    <ExigoResult>
    ///      <Header>
    ///        <SampleId>...</SampleId>
    ///        <DateTime>...</DateTime>
    ///      </Header>
    ///      <Results>
    ///        <Parameter>
    ///          <Code>WBC</Code>
    ///          <Value>12.5</Value>
    ///          <RefRange>5.5-16.9</RefRange>
    ///          ...
    ///        </Parameter>
    ///        ...
    ///      </Results>
    ///    </ExigoResult>
    ///    ```
    ///    Each `<Parameter>` contributes `Code → Value` to the results map, plus
    ///    `Code_L` / `Code_H` parsed from the `<RefRange>` "low-high" string so
    ///    Java's PDF renderer can show the reference range and low/normal/high
    ///    indicators. Patient identifier comes from `<SampleId>`.
    ///
    /// 2. **Synthetic compact format** (used by our own test fixtures and the
    ///    older test-data path):
    ///    ```xml
    ///    <results>
    ///      <sample ID2="123456789" RBC="5.4" RBC_L="5.0" RBC_H="8.5" .../>
    ///    </results>
    ///    ```
    ///    All `<sample>` attributes become results entries; `ID2` is the patient
    ///    identifier.
    ///
    /// Both shapes coexist in the wild (real machines + our test fixtures)
    /// and a single file uses exactly one of them, so the parser branches
    /// based on which elements/attributes it actually sees rather than
    /// trying to detect the format ahead of time.
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

        // Real-Exigo-format state: while we're inside a <Parameter> block,
        // accumulate Code/Value/RefRange and emit them at the closing tag.
        // Without this, the text-element fallback below would overwrite
        // results["Code"] / results["Value"] on every iteration and only
        // the last parameter would survive (and Java would find none of the
        // expected RBC/WBC/HGB/... keys, rendering an empty PDF table).
        let mut in_parameter = false;
        let mut current_param_code: Option<String> = None;
        let mut current_param_value: Option<String> = None;
        let mut current_param_ref_range: Option<String> = None;

        loop {
            match reader.read_event() {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                    let element_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    current_element = element_name.clone();

                    // Synthetic format: <sample ID2="..." RBC="..." .../>
                    if element_name.eq_ignore_ascii_case("sample") {
                        for attr_result in e.attributes() {
                            if let Ok(attr) = attr_result {
                                let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                let value = String::from_utf8_lossy(&attr.value).to_string();

                                if key == "ID2" && patient_id.is_none() {
                                    patient_id = Some(value.clone());
                                }

                                results.insert(key, value);
                            }
                        }
                    }

                    // Real Exigo format: enter a <Parameter> block. Clear the
                    // per-parameter accumulators so the previous parameter's
                    // values can't leak into this one (would happen on a
                    // malformed file missing one of Code/Value/RefRange).
                    if element_name == "Parameter" {
                        in_parameter = true;
                        current_param_code = None;
                        current_param_value = None;
                        current_param_ref_range = None;
                    }
                }
                Ok(Event::Text(e)) => {
                    let text = e.unescape().unwrap_or_default().to_string();
                    if text.trim().is_empty() {
                        continue;
                    }
                    let text = text.trim().to_string();

                    if in_parameter {
                        // Inside <Parameter> — route text to the current sub-element.
                        // Other sub-elements (Unit, Flag, …) are ignored: the PDF
                        // renderer carries its own unit table for the canonical
                        // parameter set and doesn't need them.
                        match current_element.as_str() {
                            "Code" => current_param_code = Some(text),
                            "Value" => current_param_value = Some(text),
                            "RefRange" => current_param_ref_range = Some(text),
                            _ => {}
                        }
                    } else {
                        // Header-level or other top-level text. Apply the
                        // patient-identifier heuristic (first ID-bearing element
                        // wins — SampleId beats OperatorId on document order)
                        // and fall through to the generic text-element bucket
                        // so the test format's <PatientID>/<MicrochipID>/... still
                        // populate the map.
                        if current_element.to_lowercase().contains("patient")
                            || current_element.to_lowercase().contains("microchip")
                            || current_element.eq_ignore_ascii_case("sampleid")
                            || current_element.to_lowercase().contains("id")
                        {
                            if patient_id.is_none() {
                                patient_id = Some(text.clone());
                            }
                        }
                        results.insert(current_element.clone(), text);
                    }
                }
                Ok(Event::End(e)) => {
                    let element_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    if element_name == "Parameter" {
                        // Flush the accumulated parameter into the results map.
                        // Skip silently if Code or Value is missing — the source
                        // file is malformed and there's nothing useful to record.
                        if let (Some(code), Some(value)) =
                            (current_param_code.take(), current_param_value.take())
                        {
                            // RefRange splits as "<low>-<high>". Real Exigo
                            // ranges look like "5.5-16.9" (decimal-dash-decimal),
                            // which `split_once('-')` handles cleanly. If a
                            // future firmware uses negative bounds (e.g.
                            // "-2.0-5.0") this naive split would mis-parse the
                            // sign — not a known case today, would need a real
                            // sample to design against.
                            if let Some(range) = current_param_ref_range.take() {
                                if let Some((low, high)) = range.split_once('-') {
                                    let low = low.trim();
                                    let high = high.trim();
                                    if !low.is_empty() {
                                        results.insert(format!("{}_L", code), low.to_string());
                                    }
                                    if !high.is_empty() {
                                        results.insert(format!("{}_H", code), high.to_string());
                                    }
                                }
                            }
                            // Insert the value last so an accidental "Value" key
                            // in extras can't shadow it.
                            results.insert(code, value);
                        }
                        in_parameter = false;
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    log::warn!("XML parse error at position {}: {}", reader.buffer_position(), e);
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
    ///
    /// Captures ALL non-empty fields from each message.
    pub fn parse_healvet_serial(
        device_name: &str,
        serial_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(serial_data).to_string();

        // Strip the trailing EE marker
        let data_str = data_str.strip_suffix("EE")
            .or_else(|| data_str.strip_suffix("&EE"))
            .unwrap_or(&data_str);

        // Split by #AFS1000 to get individual parameter messages
        // Each message is: #AFS1000&SAMPLE_ID&RESULT&DATETIME&&PARAM_CODE&PATIENT_ID&&GENDER&SAMPLE_TYPE
        let messages: Vec<&str> = data_str.split("#AFS1000")
            .filter(|s| !s.trim().is_empty())
            .collect();

        if messages.is_empty() {
            return Err("No valid Healvet messages found in data".to_string());
        }

        // Parse all parameters into a flat HashMap
        let mut test_results: HashMap<String, String> = HashMap::new();
        let mut patient_id: Option<String> = None;

        for (_idx, message) in messages.iter().enumerate() {
            // Split by & to get fields
            let fields: Vec<&str> = message.split('&').collect();

            if fields.len() < 6 {
                continue;
            }

            // Extract all fields according to Healvet protocol
            // Fields: [0]="", [1]=SAMPLE_ID, [2]=RESULT, [3]=DATETIME, [4]="", [5]=PARAM_CODE, [6]=PATIENT_ID, [7]="", [8]=GENDER, [9]=SAMPLE_TYPE
            for (idx, field) in fields.iter().enumerate() {
                let value = field.trim();
                if !value.is_empty() {
                    let key = match idx {
                        1 => "sample_id".to_string(),
                        3 => "test_datetime".to_string(),
                        5 => continue, // param_code - handled separately as key
                        6 => "patient_name".to_string(),
                        8 => "gender".to_string(),
                        9 => "sample_type".to_string(),
                        _ => {
                            // Capture any other non-empty fields
                            if idx > 9 {
                                format!("field_{}", idx)
                            } else {
                                continue; // Skip empty placeholder fields (0, 4, 7)
                            }
                        }
                    };

                    // Only insert metadata once (first occurrence)
                    if !test_results.contains_key(&key) {
                        test_results.insert(key.clone(), value.to_string());
                    }

                    // Set patient_id for filename generation
                    if idx == 6 && patient_id.is_none() {
                        patient_id = Some(value.to_string());
                    }
                }
            }

            // Add parameter result as direct key-value pair
            let param_code = fields.get(5).map(|s| s.trim()).unwrap_or("");
            let result = fields.get(2).map(|s| s.trim()).unwrap_or("");

            if !param_code.is_empty() && !result.is_empty() {
                test_results.insert(param_code.to_string(), result.to_string());
            }
        }

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

    /// Generic HL7 v2.x parser for any HL7-compatible device
    /// Protocol: HL7 v2.x with pipe-delimited messages
    /// Format:
    ///   MSH|...  (Message Header)
    ///   PID|...|sampleId|...|patient|...|gender|...  (Patient Identification)
    ///   OBR|...|dateTime|...|sampleType|...|testType|...  (Observation Request)
    ///   OBX|examinedItemNum|...|paramCode|result|unit|ranges|indicator|...  (Results)
    ///   \r\r (Two consecutive carriage returns signal end)
    ///
    /// Captures ALL non-empty fields from each segment type.
    pub fn parse_hl7_data(
        device_type: &str,
        device_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        let data_str = String::from_utf8_lossy(file_data).to_string();

        // Strip trailing end markers (MLLP framing: 0x0B prefix, 0x1C 0x0D suffix, or \r\r)
        let data_str = data_str
            .trim_start_matches('\x0B')
            .trim_end_matches('\x0D')
            .trim_end_matches('\x1C')
            .trim_end_matches('\r')
            .trim();

        // Parse HL7 message line by line
        let mut test_results: HashMap<String, String> = HashMap::new();
        let mut patient_id: Option<String> = None;

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

            let segment_type = fields[0].trim();

            match segment_type {
                "MSH" => {
                    // Message Header - capture all non-empty fields
                    for (idx, field) in fields.iter().enumerate().skip(1) {
                        let value = field.trim();
                        if !value.is_empty() {
                            let key = match idx {
                                2 => "sending_application".to_string(),
                                3 => "sending_facility".to_string(),
                                6 => "message_datetime".to_string(),
                                8 => "message_type".to_string(),
                                11 => "hl7_version".to_string(),
                                _ => format!("MSH_{}", idx),
                            };
                            test_results.insert(key, value.to_string());
                        }
                    }
                }
                "PID" => {
                    // Patient Identification - capture all non-empty fields
                    for (idx, field) in fields.iter().enumerate().skip(1) {
                        let value = field.trim();
                        if !value.is_empty() {
                            let key = match idx {
                                3 => "patient_id_internal".to_string(),
                                5 => "species".to_string(),
                                6 => "patient_name".to_string(),
                                7 => "birth_date".to_string(),
                                8 => "gender".to_string(),
                                // Some devices use different field positions
                                9 => "birth_date_alt".to_string(),
                                10 => "gender_alt".to_string(),
                                _ => format!("PID_{}", idx),
                            };
                            test_results.insert(key, value.to_string());

                            // Set patient_id for filename generation
                            // Priority: field 3 (patient_id) > field 6 (patient_name) > field 5 (species)
                            match idx {
                                3 => patient_id = Some(value.to_string()),
                                6 if patient_id.is_none() => patient_id = Some(value.to_string()),
                                5 if patient_id.is_none() => patient_id = Some(value.to_string()),
                                _ => {}
                            }
                        }
                    }
                }
                "OBR" => {
                    // Observation Request - capture all non-empty fields
                    for (idx, field) in fields.iter().enumerate().skip(1) {
                        let value = field.trim();
                        if !value.is_empty() {
                            let key = match idx {
                                4 => "test_code".to_string(),
                                7 => "test_datetime".to_string(),
                                15 => "sample_type".to_string(),
                                _ => format!("OBR_{}", idx),
                            };
                            test_results.insert(key, value.to_string());
                        }
                    }
                }
                "OBX" => {
                    // Observation Result - capture param code and result
                    // Fields: [0]OBX | [1]setId | [2]valueType | [3]identifier | [4]paramCode | [5]result | [6]unit | [7]range | [8]flag
                    // PCR-specific fields (from MNCHIP_PCR.log):
                    // [11]sample_type | [12]curve_data | [13]Ct_result | [14]timestamp | [15]cycles | [16]lot_number
                    let param_code = fields.get(4).map(|s| s.trim()).unwrap_or("");
                    let result = fields.get(5).map(|s| s.trim()).unwrap_or("");
                    let unit = fields.get(6).map(|s| s.trim()).unwrap_or("");
                    let range = fields.get(7).map(|s| s.trim()).unwrap_or("");
                    let flag = fields.get(8).map(|s| s.trim()).unwrap_or("");

                    // PCR-specific fields
                    let sample_type = fields.get(11).map(|s| s.trim()).unwrap_or("");
                    let curve_data = fields.get(12).map(|s| s.trim()).unwrap_or("");
                    let lot_number = fields.get(16).map(|s| s.trim()).unwrap_or("");

                    if !param_code.is_empty() && !result.is_empty() {
                        test_results.insert(param_code.to_string(), result.to_string());

                        // Also store unit, range, and flag if present
                        if !unit.is_empty() {
                            test_results.insert(format!("{}_unit", param_code), unit.to_string());
                        }
                        if !range.is_empty() {
                            test_results.insert(format!("{}_range", param_code), range.to_string());
                        }
                        if !flag.is_empty() {
                            test_results.insert(format!("{}_flag", param_code), flag.to_string());
                        }

                        // Store PCR-specific fields if present
                        if !sample_type.is_empty() {
                            test_results.insert(format!("{}_sample_type", param_code), sample_type.to_string());
                        }
                        if !curve_data.is_empty() {
                            test_results.insert(format!("{}_curve", param_code), curve_data.to_string());
                        }
                        if !lot_number.is_empty() {
                            test_results.insert(format!("{}_lot", param_code), lot_number.to_string());
                        }
                    }
                }
                _ => {
                    // Unknown segment - capture all fields with segment prefix
                    for (idx, field) in fields.iter().enumerate().skip(1) {
                        let value = field.trim();
                        if !value.is_empty() {
                            test_results.insert(format!("{}_{}", segment_type, idx), value.to_string());
                        }
                    }
                }
            }
        }

        // Generate filename based on device type
        let patient_label = patient_id.as_ref().map(|s| s.as_str()).unwrap_or("Unknown");
        let file_name = format!("{}_{}_{}.json", device_type, patient_label, Utc::now().timestamp());

        // Serialize test_results to JSON for file storage
        let json_value = serde_json::to_value(&test_results)
            .map_err(|e| format!("Failed to serialize test results: {}", e))?;
        let json_string = serde_json::to_string_pretty(&json_value)
            .map_err(|e| format!("Failed to stringify test results: {}", e))?;

        Ok(DeviceData {
            device_type: device_type.to_string(),
            device_name: device_name.to_string(),
            connection_method: connection_method.to_string(),
            patient_identifier: patient_id,
            test_results: json_value,
            original_file_name: file_name.clone(),
            file_data: json_string.into_bytes(),
            mime_type: "application/json".to_string(),
            detected_at: Utc::now(),
        })
    }

    /// Parse MNCHIP HL7 data (chemistry or PCR analyzer)
    /// Wrapper around generic HL7 parser for backwards compatibility
    pub fn parse_mnchip_data(
        device_type: &str,
        device_name: &str,
        _file_name: &str,
        file_data: &[u8],
        connection_method: &str,
    ) -> Result<DeviceData, String> {
        Self::parse_hl7_data(device_type, device_name, file_data, connection_method)
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

        // Parse as JSON
        let json_value: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // The stored JSON is a flat HashMap of param -> value
        let test_results = if json_value.as_object().is_some() {
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
            // MNCHIP devices - both use HL7 protocol
            "mnchip_pointcare_chemistry" | "mnchip_pcr_analyzer" | "mnchip_pointcare_pcr_v1" => {
                // Check if file is stored JSON or raw HL7 data
                let data_str = String::from_utf8_lossy(file_data);
                if data_str.trim().starts_with('{') {
                    // Stored JSON format
                    Self::parse_stored_json(device_type, device_name, file_name, file_data, connection_method)
                } else {
                    // Raw HL7 format - use generic HL7 parser
                    Self::parse_hl7_data(device_type, device_name, file_data, connection_method)
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

    /// Real Exigo Eos Vet machines output `<ExigoResult>` with nested
    /// `<Parameter><Code>/...<Value>/...<RefRange>/...</Parameter>` blocks.
    /// This test exercises the production code path — without it, the
    /// PDF parameter table renders empty because none of the expected
    /// Code keys reach the results map (they all get overwritten by the
    /// generic text-element fallback). See `parse_exigo_xml` doc comment.
    #[test]
    fn test_parse_exigo_xml_real_exigo_result_format() {
        let xml_data = r#"<?xml version="1.0" encoding="UTF-8"?>
            <ExigoResult>
              <Header>
                <SampleId>TEST-10210</SampleId>
                <DateTime>2026-05-24T23:27:49</DateTime>
                <DeviceType>Exigo Eos Vet</DeviceType>
                <OperatorId>TEST</OperatorId>
              </Header>
              <Results>
                <Parameter>
                  <Code>WBC</Code>
                  <Value>12.5</Value>
                  <Unit>10^9/L</Unit>
                  <RefRange>5.5-16.9</RefRange>
                  <Flag>N</Flag>
                </Parameter>
                <Parameter>
                  <Code>RBC</Code>
                  <Value>7.2</Value>
                  <Unit>10^12/L</Unit>
                  <RefRange>5.5-8.5</RefRange>
                  <Flag>N</Flag>
                </Parameter>
                <Parameter>
                  <Code>HGB</Code>
                  <Value>15.8</Value>
                  <Unit>g/dL</Unit>
                  <RefRange>12-18</RefRange>
                  <Flag>N</Flag>
                </Parameter>
                <Parameter>
                  <Code>PLT</Code>
                  <Value>285</Value>
                  <Unit>10^9/L</Unit>
                  <RefRange>175-500</RefRange>
                  <Flag>N</Flag>
                </Parameter>
              </Results>
            </ExigoResult>"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Exigo Device",
            "real_exigo.xml",
            xml_data.as_bytes(),
            "file_watch",
        );
        assert!(result.is_ok());
        let device_data = result.unwrap();

        // SampleId is the patient identifier in the real format — it must
        // win over OperatorId (also contains "id" in lowercased form) by
        // virtue of appearing first in document order.
        assert_eq!(device_data.patient_identifier, Some("TEST-10210".to_string()));

        let results = device_data.test_results.as_object().unwrap();

        // Every Parameter's Code → Value made it into the map.
        assert_eq!(results.get("WBC").unwrap().as_str().unwrap(), "12.5");
        assert_eq!(results.get("RBC").unwrap().as_str().unwrap(), "7.2");
        assert_eq!(results.get("HGB").unwrap().as_str().unwrap(), "15.8");
        assert_eq!(results.get("PLT").unwrap().as_str().unwrap(), "285");

        // RefRange "5.5-16.9" decomposed into Code_L / Code_H — the Java
        // PDF renderer reads these to draw the reference range column and
        // low/normal/high indicators on each row.
        assert_eq!(results.get("WBC_L").unwrap().as_str().unwrap(), "5.5");
        assert_eq!(results.get("WBC_H").unwrap().as_str().unwrap(), "16.9");
        assert_eq!(results.get("RBC_L").unwrap().as_str().unwrap(), "5.5");
        assert_eq!(results.get("RBC_H").unwrap().as_str().unwrap(), "8.5");
        assert_eq!(results.get("PLT_L").unwrap().as_str().unwrap(), "175");
        assert_eq!(results.get("PLT_H").unwrap().as_str().unwrap(), "500");

        // Header fields (SampleId, DateTime, DeviceType, OperatorId)
        // land in the map via the generic text-element fallback. They
        // don't drive the PDF renderer but they make the diagnostic
        // info available when the user opens the saved file.
        assert_eq!(results.get("SampleId").unwrap().as_str().unwrap(), "TEST-10210");

        // Regression guard against the old behavior: with the buggy
        // parser, `Code` and `Value` would each carry just the LAST
        // parameter's text (overwritten on every iteration). The fix
        // is for Code/Value to NOT appear as standalone keys at all —
        // they're consumed by the Parameter close-tag handler.
        assert!(results.get("Code").is_none(), "Code must not be a standalone key");
        assert!(results.get("Value").is_none(), "Value must not be a standalone key");
    }

    /// Belt-and-suspenders: a Parameter block missing either Code or Value
    /// shouldn't poison subsequent parameters or panic. We expect malformed
    /// blocks to be silently skipped.
    #[test]
    fn test_parse_exigo_xml_real_format_skips_incomplete_parameter() {
        let xml_data = r#"<?xml version="1.0"?>
            <ExigoResult>
              <Header><SampleId>S1</SampleId></Header>
              <Results>
                <Parameter><Code>WBC</Code></Parameter>
                <Parameter><Code>RBC</Code><Value>5.4</Value></Parameter>
              </Results>
            </ExigoResult>"#;
        let result = DeviceParserService::parse_exigo_xml(
            "Exigo Device",
            "malformed.xml",
            xml_data.as_bytes(),
            "file_watch",
        );
        assert!(result.is_ok());
        let device_data = result.unwrap();
        let results = device_data.test_results.as_object().unwrap();

        // The incomplete WBC block is skipped …
        assert!(results.get("WBC").is_none());
        // … and the well-formed RBC block still lands as expected.
        assert_eq!(results.get("RBC").unwrap().as_str().unwrap(), "5.4");
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
            "mnchip_pointcare_chemistry",
            "Test MNCHIP",
            "test.json",
            json_data.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let device_data = result.unwrap();
        assert_eq!(device_data.device_type, "mnchip_pointcare_chemistry");
        // Note: patient_identifier is extracted from PID segment field 6, not from JSON content
        // This test passes empty HL7 data, so patient_identifier will be None
    }
}
