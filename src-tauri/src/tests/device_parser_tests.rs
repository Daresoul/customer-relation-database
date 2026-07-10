//! Device parser contract tests
//!
//! Tests parsing of external device data formats:
//! - Exigo Eos Vet (XML hematology)
//! - Healvet HV-FIA 3000 (serial chemistry)
//! - MNCHIP PointCare (HL7 v2.x chemistry/PCR)
//!
//! These tests are high-value because they handle untrusted external data.

use crate::services::device_parser::DeviceParserService;

mod exigo_xml_parsing {
    use super::*;

    #[test]
    fn parse_real_exigo_format_with_sample_attributes() {
        let xml = r#"<?xml version="1.0"?>
<results>
    <sample ID2="MICROCHIP123" SNO="EXIGO-001" DATE="2025-01-14 14:30:00"
            RBC="5.4" RBC_L="5.0" RBC_H="8.5"
            WBC="7.2" WBC_L="6.0" WBC_H="17.0"
            HGB="14.2" HGB_L="12.0" HGB_H="18.0"
            HCT="42.1" PLT="250" />
</results>"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Exigo Device",
            "test.xml",
            xml.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok(), "Failed: {:?}", result.err());
        let data = result.unwrap();

        assert_eq!(data.device_type, "exigo_eos_vet");
        assert_eq!(data.patient_identifier, Some("MICROCHIP123".to_string()));

        let results = data.test_results.as_object().unwrap();
        assert_eq!(results.get("RBC").unwrap(), "5.4");
        assert_eq!(results.get("WBC").unwrap(), "7.2");
        assert_eq!(results.get("HGB").unwrap(), "14.2");
    }

    #[test]
    fn parse_child_element_format() {
        let xml = r#"<?xml version="1.0"?>
<TestResult>
    <PatientID>DOG-456</PatientID>
    <MicrochipID>ABC123XYZ</MicrochipID>
    <WBC>8.5</WBC>
    <RBC>6.2</RBC>
    <HGB>15.0</HGB>
    <PLT>300</PLT>
</TestResult>"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Test Device",
            "child_format.xml",
            xml.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let data = result.unwrap();

        // Patient ID should be extracted from child elements
        assert!(data.patient_identifier.is_some());

        let results = data.test_results.as_object().unwrap();
        assert_eq!(results.get("WBC").unwrap(), "8.5");
    }

    #[test]
    fn parse_empty_xml_file() {
        let xml = "";

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "empty.xml",
            xml.as_bytes(),
            "file_watch",
        );

        // A parse that yields no data must be an Err. (It used to be Ok with
        // an empty map, which flowed into the PDF as a header-only, silently
        // empty hematology table — see the exigo_daily_file tests.)
        assert!(result.is_err());
    }

    #[test]
    fn parse_malformed_xml() {
        let xml = r#"<?xml version="1.0"?>
<results>
    <sample RBC="5.4"
    <!-- Missing closing tag -->"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "malformed.xml",
            xml.as_bytes(),
            "file_watch",
        );

        // Parser should handle gracefully (partial results)
        assert!(result.is_ok());
    }

    #[test]
    fn parse_xml_with_unicode_values() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<results>
    <sample ID2="Müller's Cat 愛猫" RBC="5.4" Notes="Здоровый 🐱" />
</results>"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "unicode.xml",
            xml.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(data.patient_identifier.unwrap().contains("Müller"));
    }

    #[test]
    fn parse_xml_with_special_chars_in_values() {
        let xml = r#"<?xml version="1.0"?>
<results>
    <sample ID2="Test&amp;Patient" RBC="&lt;5.0" Notes="Value &gt; Normal" />
</results>"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "special.xml",
            xml.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        // Note: quick-xml's attr.value returns raw bytes, entities are NOT unescaped
        // This documents current behavior - entities remain escaped in attribute values
        assert_eq!(data.patient_identifier, Some("Test&amp;Patient".to_string()));
    }

    #[test]
    fn parse_large_xml_file() {
        // Simulate large file with many parameters (62 params like real Exigo)
        let mut xml = String::from(r#"<?xml version="1.0"?><results><sample ID2="LARGE_TEST""#);
        for i in 0..62 {
            xml.push_str(&format!(r#" PARAM{}="{}""#, i, i as f64 * 0.1));
        }
        xml.push_str(" /></results>");

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "large.xml",
            xml.as_bytes(),
            "file_watch",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();
        assert!(results.len() >= 62);
    }

    #[test]
    fn parse_invalid_utf8() {
        // Invalid UTF-8 bytes
        let invalid_bytes: &[u8] = &[0xFF, 0xFE, 0x00, 0x3C, 0x78, 0x6D, 0x6C];

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "invalid.xml",
            invalid_bytes,
            "file_watch",
        );

        // Should fail gracefully
        assert!(result.is_err() || result.unwrap().test_results.as_object().unwrap().is_empty());
    }
}

mod healvet_serial_parsing {
    use super::*;

    #[test]
    fn parse_single_parameter() {
        let serial = b"#AFS1000&&15.5&2025-01-14 10:30:00&&T4-1&Max the Dog&&Male&Serum&EE";

        let result = DeviceParserService::parse_healvet_serial(
            "Healvet Device",
            serial,
            "serial_port",
        );

        assert!(result.is_ok(), "Failed: {:?}", result.err());
        let data = result.unwrap();

        assert_eq!(data.device_type, "healvet_hv_fia_3000");
        assert_eq!(data.patient_identifier, Some("Max the Dog".to_string()));

        let results = data.test_results.as_object().unwrap();
        assert_eq!(results.get("T4-1").unwrap(), "15.5");
        assert_eq!(results.get("patient_name").unwrap(), "Max the Dog");
    }

    #[test]
    fn parse_full_chemistry_panel() {
        // Full panel with 6 parameters like real Healvet
        let serial = b"#AFS1000&&15.5&2025-01-14 10:30:00&&T4-1&Fluffy&&Female&Serum\
#AFS1000&&0.8&2025-01-14 10:30:00&&TSH-1&Fluffy&&Female&Serum\
#AFS1000&&12.3&2025-01-14 10:30:00&&Cortisol-1&Fluffy&&Female&Serum\
#AFS1000&&5.2&2025-01-14 10:30:00&&cCRP&Fluffy&&Female&Serum\
#AFS1000&&0.15&2025-01-14 10:30:00&&D-Dimer&Fluffy&&Female&Serum\
#AFS1000&&8.7&2025-01-14 10:30:00&&SAA&Fluffy&&Female&SeruEE";

        let result = DeviceParserService::parse_healvet_serial(
            "Healvet Device",
            serial,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();

        let results = data.test_results.as_object().unwrap();
        assert_eq!(results.get("T4-1").unwrap(), "15.5");
        assert_eq!(results.get("TSH-1").unwrap(), "0.8");
        assert_eq!(results.get("Cortisol-1").unwrap(), "12.3");
        assert_eq!(results.get("cCRP").unwrap(), "5.2");
        assert_eq!(results.get("D-Dimer").unwrap(), "0.15");
        assert_eq!(results.get("SAA").unwrap(), "8.7");
    }

    #[test]
    fn parse_empty_healvet_data() {
        let serial = b"";

        let result = DeviceParserService::parse_healvet_serial(
            "Device",
            serial,
            "serial_port",
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No valid"));
    }

    #[test]
    fn parse_incomplete_healvet_message() {
        // Message without enough fields
        let serial = b"#AFS1000&incomplete&EE";

        let result = DeviceParserService::parse_healvet_serial(
            "Device",
            serial,
            "serial_port",
        );

        // Should handle gracefully
        assert!(result.is_ok());
    }

    #[test]
    fn parse_healvet_with_missing_ee_marker() {
        let serial = b"#AFS1000&&15.5&2025-01-14 10:30:00&&T4-1&Max&&Male&Serum";

        let result = DeviceParserService::parse_healvet_serial(
            "Device",
            serial,
            "serial_port",
        );

        // Should still parse without EE marker
        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();
        assert!(results.contains_key("T4-1"));
    }

    #[test]
    fn parse_healvet_unicode_patient_name() {
        let serial = "FS1000&&15.5&2025-01-14&&T4-1&Мурка 🐱&&Female&SerumEE".as_bytes();

        let result = DeviceParserService::parse_healvet_serial(
            "Device",
            serial,
            "serial_port",
        );

        assert!(result.is_ok());
    }
}

mod hl7_parsing {
    use super::*;

    #[test]
    fn parse_mnchip_hl7_message() {
        // PID layout: PID|1||<id>||<species>|<name>||<gender>
        // The parser uses HL7 priority: field 3 (the official patient ID) wins
        // over field 6 (name) and field 5 (species). See device_parser.rs:293-299.
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit|range|flag
        let hl7 = b"MSH|^~\\&|MNCHIP|VETLAB|APP|CLINIC|20250114103000||ORU^R01|1234|P|2.5\r\
PID|1||12345|||Max||M\r\
OBR|1||CBC|||20250114103000\r\
OBX|1|NM||WBC|7.5|10^9/L|6-17|N\r\
OBX|2|NM||RBC|6.2|10^12/L|5.5-8.5|N\r\
OBX|3|NM||HGB|14.5|g/dL|12-18|N\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "MNCHIP Device",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok(), "Failed: {:?}", result.err());
        let data = result.unwrap();

        assert_eq!(data.device_type, "mnchip_pointcare_chemistry");
        // Field 3 ("12345") is the official HL7 PID — it takes precedence over
        // field 6 ("Max", the pet's name). Both end up in test_results.
        assert_eq!(data.patient_identifier, Some("12345".to_string()));
        let map = data.test_results.as_object().unwrap();
        assert_eq!(map.get("patient_id_internal").map(|v| v.as_str().unwrap()), Some("12345"));
        assert_eq!(map.get("patient_name").map(|v| v.as_str().unwrap()), Some("Max"));

        let results = data.test_results.as_object().unwrap();
        assert_eq!(results.get("WBC").unwrap(), "7.5");
        assert_eq!(results.get("RBC").unwrap(), "6.2");
        assert_eq!(results.get("HGB").unwrap(), "14.5");
        assert_eq!(results.get("WBC_unit").unwrap(), "10^9/L");
        assert_eq!(results.get("WBC_range").unwrap(), "6-17");
    }

    #[test]
    fn parse_hl7_with_mllp_framing() {
        // MLLP framing: 0x0B prefix, 0x1C 0x0D suffix
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit|range|flag
        // The paramCode is at field index 4, result at index 5
        let mut hl7 = vec![0x0B];
        hl7.extend_from_slice(b"MSH|^~\\&|TEST|LAB|APP|CLI|20250114||ORU^R01|1|P|2.5\r\
PID|1||1|||Whiskers\r\
OBX|1|NM||GLU|95|mg/dL\r");
        hl7.push(0x1C);
        hl7.push(0x0D);

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            &hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();
        assert!(results.contains_key("GLU"), "Results: {:?}", results);
    }

    #[test]
    fn parse_hl7_full_chemistry_panel() {
        // 16-24 parameters like real MNCHIP
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit|range|flag
        let hl7 = b"MSH|^~\\&|MNCHIP|LAB|||20250114||ORU^R01|1|P|2.5\r\
PID|1||ID001||DOG|Buddy||M\r\
OBR|1||CHEM|||20250114\r\
OBX|1|NM||ALT|45|U/L|10-125|N\r\
OBX|2|NM||AST|32|U/L|10-50|N\r\
OBX|3|NM||ALP|85|U/L|23-212|N\r\
OBX|4|NM||BUN|18|mg/dL|7-27|N\r\
OBX|5|NM||CRE|1.2|mg/dL|0.5-1.8|N\r\
OBX|6|NM||GLU|95|mg/dL|74-143|N\r\
OBX|7|NM||TP|6.8|g/dL|5.2-8.2|N\r\
OBX|8|NM||ALB|3.5|g/dL|2.3-4.0|N\r\
OBX|9|NM||GLOB|3.3|g/dL|2.5-4.5|N\r\
OBX|10|NM||TBIL|0.3|mg/dL|0.0-0.9|N\r\
OBX|11|NM||CHOL|220|mg/dL|110-320|N\r\
OBX|12|NM||TRIG|85|mg/dL|50-150|N\r\
OBX|13|NM||Na|145|mmol/L|144-160|N\r\
OBX|14|NM||K|4.5|mmol/L|3.5-5.8|N\r\
OBX|15|NM||Cl|110|mmol/L|109-122|N\r\
OBX|16|NM||Ca|10.2|mg/dL|7.9-12.0|N\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "MNCHIP",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();

        // Verify all 16 parameters
        assert!(results.contains_key("ALT"));
        assert!(results.contains_key("AST"));
        assert!(results.contains_key("BUN"));
        assert!(results.contains_key("CRE"));
        assert!(results.contains_key("GLU"));
        assert!(results.contains_key("Na"));
        assert!(results.contains_key("K"));
        assert!(results.contains_key("Ca"));
    }

    #[test]
    fn parse_hl7_maps_obr44_to_sample_id() {
        // OBR-44 carries the analyzer's readable run/sample id on both MNCHIP
        // devices (confirmed from real captures). Without this it fell back to
        // "AUTO-GEN" on every report. Field 44 = 44 pipes after "OBR".
        let obr = format!("OBR{}{}", "|".repeat(44), "0C1231-3-0015");
        let hl7 = format!(
            "MSH|^~\\&|MNCHIP|LAB|||20250114||ORU^R01|1|P|2.5\r\
PID|1||555||DOG|doli||M\r\
{}\r\
OBX|1|NM||GLU|95|mg/dL|74-143|N\r\r",
            obr
        );

        let data = DeviceParserService::parse_hl7_data(
            "mnchip_pcr_analyzer",
            "MNCHIP",
            hl7.as_bytes(),
            "serial_port",
        )
        .unwrap();
        let results = data.test_results.as_object().unwrap();
        assert_eq!(
            results.get("sample_id").and_then(|v| v.as_str()),
            Some("0C1231-3-0015")
        );
    }

    #[test]
    fn real_pcr_clinic_capture_extracts_sample_id_and_patient() {
        // REAL MLLP-framed HL7 message captured from the clinic PCR on COM13.
        const RAW: &[u8] = include_bytes!("../../tests/fixtures/real_pcr_com13.bin");
        let data = DeviceParserService::parse_hl7_data(
            "mnchip_pcr_analyzer",
            "MNCHIP",
            RAW,
            "serial_port",
        )
        .unwrap();
        let r = data.test_results.as_object().unwrap();
        // OBR-44 -> readable run id (was AUTO-GEN before the fix).
        assert_eq!(r.get("sample_id").and_then(|v| v.as_str()), Some("0C1231-4-0015"));
        // Patient name comes from PID-6.
        assert_eq!(r.get("patient_name").and_then(|v| v.as_str()), Some("olav"));
    }

    #[test]
    fn real_chem_clinic_capture_carries_device_units_ranges_flags() {
        // REAL MLLP-framed HL7 chemistry message captured from the clinic PointCare.
        // Validates the data the PDF fix depends on: the device's own unit/range/flag
        // are captured (the PDF now renders these instead of a hardcoded US table).
        const RAW: &[u8] = include_bytes!("../../tests/fixtures/real_chem_pcv.bin");
        let data = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "MNCHIP",
            RAW,
            "serial_port",
        )
        .unwrap();
        let r = data.test_results.as_object().unwrap();

        // Real values + device-supplied metadata:
        assert_eq!(r.get("CRE").and_then(|v| v.as_str()), Some("0.86"));
        assert_eq!(r.get("CRE_unit").and_then(|v| v.as_str()), Some("mg/dL"));
        assert_eq!(r.get("CRE_range").and_then(|v| v.as_str()), Some("0.3-1.7"));

        // GLU: device range (70-142) differs from the OLD hardcoded table (70-110)
        // — proof the hardcoded ranges were wrong even for a mg/dL machine.
        assert_eq!(r.get("GLU").and_then(|v| v.as_str()), Some("159"));
        assert_eq!(r.get("GLU_range").and_then(|v| v.as_str()), Some("70-142"));
        assert_eq!(r.get("GLU_flag").and_then(|v| v.as_str()), Some("H"));

        // Sample id from OBR-44 (leading space trimmed).
        assert_eq!(
            r.get("sample_id").and_then(|v| v.as_str()),
            Some("45512-10-0150-0227-97-250752-821")
        );
    }

    #[test]
    fn parse_hl7_empty_message() {
        let hl7 = b"";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(data.patient_identifier.is_none());
    }

    #[test]
    fn parse_hl7_with_abnormal_flags() {
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit|range|flag
        let hl7 = b"MSH|^~\\&|TEST|||20250114||ORU^R01|1|P|2.5\r\
PID|1||1||DOG|Max\r\
OBX|1|NM||GLU|250|mg/dL|74-143|H\r\
OBX|2|NM||BUN|5|mg/dL|7-27|L\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();

        // Verify flags are captured
        assert_eq!(results.get("GLU_flag").unwrap(), "H"); // High
        assert_eq!(results.get("BUN_flag").unwrap(), "L"); // Low
    }

    #[test]
    fn parse_hl7_unknown_segments_captured() {
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit
        let hl7 = b"MSH|^~\\&|TEST|||20250114||ORU^R01|1|P|2.5\r\
PID|1||1||DOG|Max\r\
ZCU|CustomField1|CustomValue|ExtraData\r\
OBX|1|NM||GLU|95|mg/dL\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        let results = data.test_results.as_object().unwrap();

        // Unknown ZCU segment fields should be captured
        assert!(results.contains_key("ZCU_1"));
    }
}

mod device_router {
    use super::*;

    #[test]
    fn route_to_exigo_parser() {
        let xml = b"<?xml version=\"1.0\"?><sample RBC=\"5.4\"/>";

        let result = DeviceParserService::parse_device_data(
            "exigo_eos_vet",
            "Device",
            "test.xml",
            xml,
            "file_watch",
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap().device_type, "exigo_eos_vet");
    }

    #[test]
    fn route_healvet_raw_serial() {
        let serial = b"#AFS1000&&15.5&2025-01-14&&T4-1&Max&&M&SerumEE";

        let result = DeviceParserService::parse_device_data(
            "healvet_hv_fia_3000",
            "Device",
            "healvet.bin",
            serial,
            "serial_port",
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap().device_type, "healvet_hv_fia_3000");
    }

    #[test]
    fn route_healvet_stored_json() {
        let json = br#"{"T4-1": "15.5", "patient_name": "Max"}"#;

        let result = DeviceParserService::parse_device_data(
            "healvet_hv_fia_3000",
            "Device",
            "healvet.json",
            json,
            "file_watch",
        );

        assert!(result.is_ok());
        let data = result.unwrap();
        assert_eq!(data.device_type, "healvet_hv_fia_3000");
        assert_eq!(data.mime_type, "application/json");
    }

    #[test]
    fn route_mnchip_raw_hl7() {
        // OBX format: OBX|setId|valueType|identifier|paramCode|result
        let hl7 = b"MSH|^~\\&|TEST\rPID|1||1||DOG|Max\rOBX|1|NM||GLU|95\r\r";

        let result = DeviceParserService::parse_device_data(
            "mnchip_pointcare_chemistry",
            "Device",
            "pointcare.hl7",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap().device_type, "mnchip_pointcare_chemistry");
    }

    #[test]
    fn route_mnchip_stored_json() {
        let json = br#"{"GLU": "95", "patient_name": "Max"}"#;

        let result = DeviceParserService::parse_device_data(
            "mnchip_pointcare_chemistry",
            "Device",
            "pointcare.json",
            json,
            "file_watch",
        );

        assert!(result.is_ok());
    }

    #[test]
    fn route_unknown_device_fails() {
        let result = DeviceParserService::parse_device_data(
            "unknown_device_type",
            "Device",
            "data.bin",
            b"some data",
            "file_watch",
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown device type"));
    }

    #[test]
    fn route_pcr_analyzer() {
        // OBX format: OBX|setId|valueType|identifier|paramCode|result
        let hl7 = b"MSH|^~\\&|PCR\rPID|1||1||CAT|Whiskers\rOBX|1|ST||FeLV|Negative\r\r";

        let result = DeviceParserService::parse_device_data(
            "mnchip_pcr_analyzer",
            "PCR Device",
            "pcr.hl7",
            hl7,
            "serial_port",
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap().device_type, "mnchip_pcr_analyzer");
    }
}

mod security {
    use super::*;

    #[test]
    fn xml_billion_laughs_attack_prevention() {
        // XXE / Billion Laughs attack attempt
        let malicious_xml = br#"<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<sample ID2="&lol3;" />"#;

        let result = DeviceParserService::parse_exigo_xml(
            "Device",
            "attack.xml",
            malicious_xml,
            "file_watch",
        );

        // quick-xml doesn't expand entities by default, so this should be safe
        assert!(result.is_ok());
    }

    #[test]
    fn hl7_injection_in_patient_name() {
        // Attempt to inject extra segments via patient name
        // OBX format: OBX|setId|valueType|identifier|paramCode|result
        let hl7 = b"MSH|^~\\&|TEST\r\
PID|1||1||DOG|Max\rOBX|INJECTED|Fake\r\
OBX|1|NM||GLU|95\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            hl7,
            "serial_port",
        );

        // Parser handles line-by-line, injection attempt becomes malformed segment
        assert!(result.is_ok());
    }

    #[test]
    fn null_bytes_in_data() {
        // OBX format: OBX|setId|valueType|identifier|paramCode|result
        let data_with_nulls = b"MSH|^~\\&|TEST\x00HIDDEN\rPID|1||1||DOG|Max\x00SECRET\rOBX|1|NM||GLU|95\r\r";

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            data_with_nulls,
            "serial_port",
        );

        // Should handle null bytes without crashing
        assert!(result.is_ok());
    }

    #[test]
    fn extremely_long_field_values() {
        let long_value = "A".repeat(100_000);
        // OBX format: OBX|setId|valueType|identifier|paramCode|result
        let hl7 = format!(
            "MSH|^~\\&|TEST\rPID|1||1||DOG|{}\rOBX|1|NM||GLU|95\r\r",
            long_value
        );

        let result = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "Device",
            hl7.as_bytes(),
            "serial_port",
        );

        // Should handle without panic
        assert!(result.is_ok());
    }
}

/// Regression tests for the clinic's 2026-07-10 "BLEKI" report (Exigo BM800
/// per-day file + PointCare chemistry attached to one record, PDF hematology
/// table empty / wrong). Uses the real per-day file shape: multiple patients'
/// `<sample>` rows accumulated over the clinic day.
mod exigo_daily_file {
    use super::*;
    use crate::services::device_parser::EXIGO_PDF_ANALYTE_KEYS;

    const DAILY: &[u8] = include_bytes!("../../tests/fixtures/exigo_daily_two_samples.xml");

    fn analyte_hits(d: &crate::services::device_parser::DeviceData) -> usize {
        let map = d.test_results.as_object().unwrap();
        EXIGO_PDF_ANALYTE_KEYS
            .iter()
            .filter(|k| map.contains_key(**k))
            .count()
    }

    fn parse(bytes: &[u8]) -> Result<crate::services::device_parser::DeviceData, String> {
        DeviceParserService::parse_exigo_xml("Exigo", "BM-53672_2026-07-10.xml", bytes, "file_watch")
    }

    /// A well-formed daily file must yield the analyte value keys the PDF
    /// renders — this is the contract that keeps the hematology table
    /// populated. (GR intentionally absent from the fixture: real captures
    /// show the BM800 omitting value attributes for some analytes.)
    #[test]
    fn daily_file_yields_pdf_analyte_keys() {
        let d = parse(DAILY).unwrap();
        assert!(
            analyte_hits(&d) >= 15,
            "expected >=15 of the 19 PDF analyte keys, got {}",
            analyte_hits(&d)
        );
    }

    /// Multi-sample per-day file resolves to ONE coherent sample (the last =
    /// most recently run), never a cross-patient blend. The identifier comes
    /// from THAT sample (not the first), so values and label agree. Choosing
    /// which patient a multi-sample file belongs to is still a follow-up
    /// (per-sample splitting); this only guarantees internal consistency.
    #[test]
    fn daily_file_uses_last_sample_without_blending() {
        let d = parse(DAILY).unwrap();
        let map = d.test_results.as_object().unwrap();
        // Identifier and values both come from the LAST sample (KIRE).
        assert_eq!(d.patient_identifier.as_deref(), Some("KIRE"));
        assert_eq!(map.get("ID2").unwrap(), "KIRE");
        assert_eq!(map.get("HGB").unwrap(), "16.2");
        assert_eq!(map.get("RBC").unwrap(), "6.40");
        assert_eq!(map.get("WBC").unwrap(), "8.9");
        // Nothing from the earlier sample (KOKO) leaks in: KOKO's SEQ was
        // 1219, the coherent result must carry only the last sample's SEQ.
        assert_eq!(map.get("SEQ").unwrap(), "1220");
    }

    /// Windows-encoding robustness: BOM and CRLF must not affect parsing.
    #[test]
    fn tolerates_utf8_bom_and_crlf() {
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(DAILY);
        assert!(analyte_hits(&parse(&bom).unwrap()) >= 15, "UTF-8 BOM broke parsing");

        let crlf = String::from_utf8(DAILY.to_vec()).unwrap().replace('\n', "\r\n");
        assert!(analyte_hits(&parse(crlf.as_bytes()).unwrap()) >= 15, "CRLF broke parsing");
    }

    /// A per-day file that is still being appended has no closing `</samples>`
    /// yet — must still parse.
    #[test]
    fn tolerates_unclosed_root_tag() {
        let unclosed = String::from_utf8(DAILY.to_vec()).unwrap().replace("</samples>\n", "");
        assert!(analyte_hits(&parse(unclosed.as_bytes()).unwrap()) >= 15);
    }

    /// A read that raced the device mid-append keeps every fully-written
    /// sample that precedes the truncation point.
    #[test]
    fn truncation_after_first_sample_keeps_first_sample() {
        let cut = &DAILY[..DAILY.len() * 3 / 4]; // cuts inside sample 2
        let d = parse(cut).unwrap();
        assert!(analyte_hits(&d) >= 15);
        let map = d.test_results.as_object().unwrap();
        assert_eq!(map.get("HGB").unwrap(), "17.4", "should hold sample 1's values");
    }

    /// HARDENING (the silent-empty-table fix): input that yields NO data must
    /// be an Err — not Ok with an empty map, which used to flow into the PDF
    /// as a header-only hematology table on an otherwise successful report.
    #[test]
    fn zero_yield_parses_are_errors_not_empty_results() {
        // Truncated inside the FIRST sample's attribute list.
        let early_cut = &DAILY[..DAILY.len() * 3 / 10];
        assert!(parse(early_cut).is_err(), "early truncation must be an Err");

        // UTF-16LE (Windows wide-char writer) is not decodable as UTF-8.
        let text = String::from_utf8(DAILY.to_vec()).unwrap();
        let mut utf16: Vec<u8> = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        assert!(parse(&utf16).is_err(), "UTF-16 must be an Err");

        // CP1251 Cyrillic in an attribute (Macedonian Windows operator input)
        // is invalid UTF-8.
        let mut cp1251 = text.replace("ID2=\"KOKO\"", "ID2=\"XXXX\"").into_bytes();
        if let Some(pos) = cp1251.windows(4).position(|w| w == b"XXXX") {
            cp1251[pos..pos + 4].copy_from_slice(&[0xCA, 0xCE, 0xCA, 0xCE]); // КОКО
        }
        assert!(parse(&cp1251).is_err(), "CP1251 bytes must be an Err");

        // Empty and garbage inputs.
        assert!(parse(b"").is_err(), "empty file must be an Err");
        assert!(parse(b"not xml at all").is_err(), "non-XML must be an Err");
    }
}

/// End-to-end contract: real Rust parsers -> real Java PDF JAR -> a PDF where
/// EVERY device table has rows. Guards the exact clinic failure (report
/// generates fine but the hematology table is empty). Skips with a note when
/// `java` or the built JAR is unavailable (build with:
/// `cd pdf-generator-cli && ./gradlew build`). Works on macOS/Linux/Windows —
/// the JAR's `PARSED_SAMPLE device=<type> params=<n>` stdout lines are the
/// assertion surface, so no PDF text extraction is needed.
mod pdf_end_to_end {
    use super::*;

    #[test]
    fn exigo_and_pointcare_pdf_renders_rows_for_both_tables() {
        let jar = std::path::Path::new("../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar");
        if !jar.exists() {
            eprintln!("SKIP: JAR not built ({}). Run: cd pdf-generator-cli && ./gradlew build", jar.display());
            return;
        }
        if std::process::Command::new("java").arg("-version").output().is_err() {
            eprintln!("SKIP: no `java` on PATH");
            return;
        }

        let exigo = DeviceParserService::parse_exigo_xml(
            "Exigo",
            "BM-53672_2026-07-10.xml",
            include_bytes!("../../tests/fixtures/exigo_daily_two_samples.xml"),
            "file_watch",
        )
        .unwrap();
        let chem = DeviceParserService::parse_hl7_data(
            "mnchip_pointcare_chemistry",
            "MNCHIP",
            include_bytes!("../../tests/fixtures/real_chem_pcv.bin"),
            "serial_port",
        )
        .unwrap();

        // Build the Java input the same way JavaPdfService::generate_pdf_multi
        // does (device-type mapping, sample_id fallback chain, stringified values).
        let to_string_map = |v: &serde_json::Value| -> serde_json::Map<String, serde_json::Value> {
            v.as_object()
                .map(|o| {
                    o.iter()
                        .map(|(k, val)| {
                            let s = match val {
                                serde_json::Value::String(s) => s.clone(),
                                other => other.to_string(),
                            };
                            (k.clone(), serde_json::Value::String(s))
                        })
                        .collect()
                })
                .unwrap_or_default()
        };

        let out_dir = std::env::temp_dir();
        let pdf_path = out_dir.join("e2e_device_report.pdf");
        let _ = std::fs::remove_file(&pdf_path);
        let input = serde_json::json!({
            "patient": {
                "name": "BLEKI", "owner": "Owner", "species": "Dog",
                "microchip_id": null, "gender": "Male", "date_of_birth": null,
            },
            "samples": [
                {
                    "device_type": "exigo_eos_vet",
                    "sample_id": "53672",
                    "patient_id": "BLEKI",
                    "detected_at": "2026-07-10T15:01:00Z",
                    "test_results": to_string_map(&exigo.test_results),
                },
                {
                    "device_type": "pointcare",
                    "sample_id": "45512",
                    "patient_id": "BLEKI",
                    "detected_at": "2026-07-10T15:01:00Z",
                    "test_results": to_string_map(&chem.test_results),
                },
            ],
            "output_path": pdf_path.to_string_lossy(),
        });
        let input_path = out_dir.join("e2e_pdf_input.json");
        std::fs::write(&input_path, serde_json::to_string(&input).unwrap()).unwrap();

        let output = std::process::Command::new("java")
            .arg("-Djava.awt.headless=true")
            .arg("-jar")
            .arg(jar)
            .arg(&input_path)
            .output()
            .expect("java invocation failed");
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            output.status.success(),
            "JAR failed: {}\n{}",
            stdout,
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(pdf_path.exists(), "PDF not created");

        // Each device table must have rendered rows. params=0 is exactly the
        // clinic bug: report "generates" but a table is silently empty.
        let param_count = |device: &str| -> usize {
            stdout
                .lines()
                .find(|l| l.starts_with(&format!("PARSED_SAMPLE device={}", device)))
                .and_then(|l| l.rsplit("params=").next())
                .and_then(|n| n.trim().parse().ok())
                .unwrap_or_else(|| panic!("no PARSED_SAMPLE line for {}\nstdout: {}", device, stdout))
        };
        let exigo_rows = param_count("exigo_eos_vet");
        let chem_rows = param_count("pointcare");
        assert!(exigo_rows >= 15, "Exigo table rendered only {} rows", exigo_rows);
        assert!(chem_rows >= 10, "PointCare table rendered only {} rows", chem_rows);
    }
}

/// REGRESSION GUARD against the cross-patient blend. A later sample that
/// omits values an earlier one had (error/QC run writing only ranges/flags
/// for some analytes — the BM800 does this, note `_F="ER"`) must NOT let the
/// earlier animal's values leak into the result. The chosen (last) sample's
/// values stand alone; keys it didn't write are simply absent — never filled
/// in from another patient. This is the clinical-safety fix: a report is
/// never a blend of two animals' blood.
#[test]
fn daily_file_no_cross_patient_blend() {
    let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<samples SNO="53672">
<sample SEQ="1" APNA="DOG" ID2="FIRST" WBC="10.4" HGB="17.4" PLT="285" RBC="7.10" />
<sample SEQ="2" APNA="DOG" ID2="SECOND" HGB="16.2" PLT_F="ER" PLT_L="200" PLT_H="500" RBC="6.40" />
</samples>"#;
    let d = DeviceParserService::parse_exigo_xml("Exigo", "BM-53672.xml", xml.as_bytes(), "file_watch").unwrap();
    let m = d.test_results.as_object().unwrap();

    // Everything comes from the last (SECOND) sample, coherently.
    assert_eq!(d.patient_identifier.as_deref(), Some("SECOND"));
    assert_eq!(m.get("HGB").unwrap(), "16.2");
    assert_eq!(m.get("RBC").unwrap(), "6.40");
    // SECOND omitted these values — they must be ABSENT, not leaked from FIRST.
    assert!(m.get("WBC").is_none(), "FIRST's WBC leaked into SECOND's result");
    assert!(m.get("PLT").is_none(), "FIRST's PLT leaked into SECOND's result");
    // SECOND's own range/flag keys are still present.
    assert_eq!(m.get("PLT_L").unwrap(), "200");
}
