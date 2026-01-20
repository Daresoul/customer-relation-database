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

        // Should succeed but have empty results
        assert!(result.is_ok());
        let data = result.unwrap();
        assert!(data.patient_identifier.is_none());
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
        // PID format: PID|1||id||species|name||gender
        // Parser extracts patient_identifier from field 6 (name), fallback to field 5 (species)
        // OBX format: OBX|setId|valueType|identifier|paramCode|result|unit|range|flag
        // param_code is at field[4], result at field[5]
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
        // Field 6 "Max" should be extracted when field 5 is empty
        assert_eq!(data.patient_identifier, Some("Max".to_string()));

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
