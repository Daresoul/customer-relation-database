//! Medical record contract tests
//!
//! Tests the medical record DTOs and their parsing from frontend JSON.

use serde_json::{json, Value};
use crate::models::medical::{
    CreateMedicalRecordInput, UpdateMedicalRecordInput, MedicalRecordFilter,
    CreateRecordTemplateInput, UpdateRecordTemplateInput, DeviceDataInput,
};
use crate::models::dto::MaybeNull;

/// Helper to parse JSON into a type
fn parse_json<T: serde::de::DeserializeOwned>(json: Value) -> Result<T, String> {
    serde_json::from_value(json).map_err(|e| e.to_string())
}

mod create_medical_record {
    use super::*;

    #[test]
    fn parse_minimal_record() {
        // Note: medical models use camelCase in serde
        let json = json!({
            "patientId": 1,
            "recordType": "examination",
            "name": "Annual Checkup",
            "description": "Routine examination"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok(), "Failed: {:?}", result.err());

        let input = result.unwrap();
        assert_eq!(input.patient_id, 1);
        assert_eq!(input.record_type, "examination");
        assert_eq!(input.name, "Annual Checkup");
    }

    #[test]
    fn parse_record_with_price() {
        let json = json!({
            "patientId": 42,
            "recordType": "procedure",
            "name": "Vaccination",
            "procedureName": "Rabies Vaccine",
            "description": "Annual rabies vaccination",
            "price": 45.50,
            "currencyId": 1
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.price, Some(45.50));
        assert_eq!(input.currency_id, Some(1));
        assert_eq!(input.procedure_name, Some("Rabies Vaccine".to_string()));
    }

    #[test]
    fn parse_record_with_device_data() {
        let json = json!({
            "patientId": 1,
            "recordType": "lab_result",
            "name": "Blood Work",
            "description": "CBC results from Exigo",
            "deviceTestData": {
                "WBC": "7.5",
                "RBC": "6.2",
                "HGB": "14.5"
            },
            "deviceType": "exigo_eos_vet",
            "deviceName": "Hematology Analyzer"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.device_test_data.is_some());
        assert_eq!(input.device_type, Some("exigo_eos_vet".to_string()));
    }

    #[test]
    fn parse_record_with_multiple_devices() {
        let json = json!({
            "patientId": 1,
            "recordType": "lab_result",
            "name": "Full Panel",
            "description": "Combined lab results",
            "deviceDataList": [
                {
                    "deviceTestData": {"WBC": "7.5"},
                    "deviceType": "exigo_eos_vet",
                    "deviceName": "Hematology"
                },
                {
                    "deviceTestData": {"GLU": "95"},
                    "deviceType": "mnchip_pointcare_chemistry",
                    "deviceName": "Chemistry"
                }
            ]
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.device_data_list.is_some());
        let devices = input.device_data_list.unwrap();
        assert_eq!(devices.len(), 2);
    }

    #[test]
    fn parse_record_null_optional_fields() {
        let json = json!({
            "patientId": 1,
            "recordType": "note",
            "name": "Observation",
            "description": "General notes",
            "procedureName": null,
            "price": null,
            "currencyId": null,
            "deviceTestData": null,
            "deviceType": null,
            "deviceName": null
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.procedure_name.is_none());
        assert!(input.price.is_none());
        assert!(input.device_test_data.is_none());
    }

    #[test]
    fn parse_record_missing_required_field() {
        // Missing description
        let json = json!({
            "patientId": 1,
            "recordType": "examination",
            "name": "Test"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn parse_record_wrong_type_patient_id() {
        let json = json!({
            "patientId": "one",  // String instead of number
            "recordType": "examination",
            "name": "Test",
            "description": "Test"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn parse_record_price_as_integer() {
        // Frontend might send integer instead of float
        let json = json!({
            "patientId": 1,
            "recordType": "procedure",
            "name": "Test",
            "description": "Test",
            "price": 50  // Integer
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().price, Some(50.0));
    }

    #[test]
    fn parse_record_negative_price() {
        let json = json!({
            "patientId": 1,
            "recordType": "procedure",
            "name": "Discount",
            "description": "Credit applied",
            "price": -25.00
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        // Serde accepts negative, validation would catch if needed
        assert!(result.is_ok());
    }
}

mod update_medical_record {
    use super::*;

    #[test]
    fn parse_empty_update() {
        let json = json!({});

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.name.is_none());
        assert!(input.is_archived.is_none());
    }

    #[test]
    fn parse_partial_update() {
        let json = json!({
            "name": "Updated Name",
            "description": "Updated description"
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.name, Some("Updated Name".to_string()));
        assert_eq!(input.description, Some("Updated description".to_string()));
        assert!(input.procedure_name.is_none());
    }

    #[test]
    fn parse_archive_update() {
        let json = json!({
            "isArchived": true
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().is_archived, Some(true));
    }

    #[test]
    fn parse_maybe_null_price_set_value() {
        let json = json!({
            "price": 75.50
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        match input.price {
            MaybeNull::Value(v) => assert_eq!(v, 75.50),
            _ => panic!("Expected MaybeNull::Value"),
        }
    }

    #[test]
    fn parse_maybe_null_price_set_null() {
        let json = json!({
            "price": null
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        match input.price {
            MaybeNull::Null => {}
            _ => panic!("Expected MaybeNull::Null"),
        }
    }

    #[test]
    fn parse_maybe_null_price_undefined() {
        let json = json!({
            "name": "Test"
            // price field not present
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        match input.price {
            MaybeNull::Undefined => {}
            _ => panic!("Expected MaybeNull::Undefined"),
        }
    }

    #[test]
    fn parse_maybe_null_currency_id() {
        // Set to null to clear currency
        let json = json!({
            "currencyId": null
        });

        let result: Result<UpdateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        match input.currency_id {
            MaybeNull::Null => {}
            _ => panic!("Expected MaybeNull::Null for currency_id"),
        }
    }
}

mod medical_record_filter {
    use super::*;

    #[test]
    fn parse_empty_filter() {
        let json = json!({});

        let result: Result<MedicalRecordFilter, _> = parse_json(json);
        assert!(result.is_ok());

        let filter = result.unwrap();
        assert!(filter.record_type.is_none());
        assert!(filter.is_archived.is_none());
        assert!(filter.search_term.is_none());
    }

    #[test]
    fn parse_filter_by_type() {
        let json = json!({
            "recordType": "examination"
        });

        let result: Result<MedicalRecordFilter, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().record_type, Some("examination".to_string()));
    }

    #[test]
    fn parse_filter_archived() {
        let json = json!({
            "isArchived": false
        });

        let result: Result<MedicalRecordFilter, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().is_archived, Some(false));
    }

    #[test]
    fn parse_filter_search() {
        let json = json!({
            "searchTerm": "vaccination"
        });

        let result: Result<MedicalRecordFilter, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().search_term, Some("vaccination".to_string()));
    }

    #[test]
    fn parse_combined_filter() {
        let json = json!({
            "recordType": "procedure",
            "isArchived": false,
            "searchTerm": "vaccine"
        });

        let result: Result<MedicalRecordFilter, _> = parse_json(json);
        assert!(result.is_ok());

        let filter = result.unwrap();
        assert_eq!(filter.record_type, Some("procedure".to_string()));
        assert_eq!(filter.is_archived, Some(false));
        assert_eq!(filter.search_term, Some("vaccine".to_string()));
    }
}

mod record_template {
    use super::*;

    #[test]
    fn parse_create_template() {
        let json = json!({
            "recordType": "examination",
            "title": "Annual Physical",
            "description": "Complete physical examination checklist",
            "price": 75.00,
            "currencyId": 1
        });

        let result: Result<CreateRecordTemplateInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.record_type, "examination");
        assert_eq!(input.title, "Annual Physical");
        assert_eq!(input.price, Some(75.00));
    }

    #[test]
    fn parse_create_template_minimal() {
        let json = json!({
            "recordType": "note",
            "title": "Quick Note",
            "description": "Template for quick notes"
        });

        let result: Result<CreateRecordTemplateInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.price.is_none());
        assert!(input.currency_id.is_none());
    }

    #[test]
    fn parse_update_template() {
        let json = json!({
            "title": "Updated Title",
            "price": 80.00
        });

        let result: Result<UpdateRecordTemplateInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.title, Some("Updated Title".to_string()));
        assert_eq!(input.price, Some(80.00));
        assert!(input.description.is_none());
    }
}

mod device_data_input {
    use super::*;

    #[test]
    fn parse_device_data() {
        let json = json!({
            "deviceTestData": {
                "WBC": "7.5",
                "RBC": "6.2"
            },
            "deviceType": "exigo_eos_vet",
            "deviceName": "Hematology Analyzer"
        });

        let result: Result<DeviceDataInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.device_type, "exigo_eos_vet");
        assert!(input.device_test_data.is_object());
    }

    #[test]
    fn parse_device_data_complex_results() {
        let json = json!({
            "deviceTestData": {
                "parameters": [
                    {"name": "WBC", "value": 7.5, "unit": "10^9/L"},
                    {"name": "RBC", "value": 6.2, "unit": "10^12/L"}
                ],
                "metadata": {
                    "sampleId": "123",
                    "timestamp": "2025-01-14T10:30:00Z"
                }
            },
            "deviceType": "mnchip_pointcare_chemistry",
            "deviceName": "Chemistry Analyzer"
        });

        let result: Result<DeviceDataInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.device_test_data["parameters"].is_array());
    }
}

mod edge_cases {
    use super::*;

    #[test]
    fn unicode_in_description() {
        let json = json!({
            "patientId": 1,
            "recordType": "note",
            "name": "Observation",
            "description": "Patient показал признаки улучшения 🐕 après le traitement"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn very_long_description() {
        let long_desc = "A".repeat(50000);
        let json = json!({
            "patientId": 1,
            "recordType": "note",
            "name": "Detailed Notes",
            "description": long_desc
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn html_in_description() {
        let json = json!({
            "patientId": 1,
            "recordType": "note",
            "name": "Test",
            "description": "<p>Notes with <strong>HTML</strong> formatting</p>"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn special_chars_in_name() {
        let json = json!({
            "patientId": 1,
            "recordType": "procedure",
            "name": "Procedure - O'Brien's Cat (Follow-up)",
            "description": "Test"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn large_device_test_data() {
        // Simulate 62 parameters from Exigo
        let mut params = serde_json::Map::new();
        for i in 0..62 {
            params.insert(format!("PARAM{}", i), json!(i as f64 * 0.1));
        }

        let json = json!({
            "patientId": 1,
            "recordType": "lab_result",
            "name": "Full Panel",
            "description": "Complete blood work",
            "deviceTestData": params,
            "deviceType": "exigo_eos_vet",
            "deviceName": "Exigo"
        });

        let result: Result<CreateMedicalRecordInput, _> = parse_json(json);
        assert!(result.is_ok());
    }
}
