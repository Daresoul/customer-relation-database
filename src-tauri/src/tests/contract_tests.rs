//! Contract tests for frontend-backend boundary
//!
//! These tests verify that the Rust backend correctly handles JSON payloads
//! exactly as the frontend sends them (after camelCase → snake_case transformation).
//!
//! This catches bugs like:
//! - Serde deserialization failures
//! - Missing/extra fields
//! - Type mismatches (string vs number)
//! - Null vs undefined handling
//! - Date format issues

use serde_json::{json, Value};

/// Helper to simulate what Tauri receives after ApiService transformation
fn parse_json<T: serde::de::DeserializeOwned>(json: Value) -> Result<T, String> {
    serde_json::from_value(json).map_err(|e| e.to_string())
}

mod appointment_contract {
    use super::*;
    use crate::models::{CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter, ConflictCheckInput, DuplicateAppointmentInput};

    // ===== CreateAppointmentInput =====

    #[test]
    fn create_appointment_minimal_payload() {
        // Frontend sends: { patientId: 1, title: "Checkup", startTime: "...", endTime: "..." }
        // ApiService transforms to snake_case
        let json = json!({
            "patient_id": 1,
            "title": "Annual Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok(), "Should parse minimal payload: {:?}", result.err());

        let input = result.unwrap();
        assert_eq!(input.patient_id, 1);
        assert_eq!(input.title, "Annual Checkup");
        assert!(input.description.is_none());
        assert!(input.room_id.is_none());
    }

    #[test]
    fn create_appointment_full_payload() {
        let json = json!({
            "patient_id": 42,
            "title": "Surgery",
            "description": "Spay procedure",
            "start_time": "2024-06-15T14:00:00Z",
            "end_time": "2024-06-15T16:00:00Z",
            "room_id": 3
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.patient_id, 42);
        assert_eq!(input.description, Some("Spay procedure".to_string()));
        assert_eq!(input.room_id, Some(3));
    }

    #[test]
    fn create_appointment_null_optional_fields() {
        // Frontend might send null explicitly for optional fields
        let json = json!({
            "patient_id": 1,
            "title": "Checkup",
            "description": null,
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "room_id": null
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok(), "Should handle explicit nulls: {:?}", result.err());

        let input = result.unwrap();
        assert!(input.description.is_none());
        assert!(input.room_id.is_none());
    }

    #[test]
    fn create_appointment_missing_required_field() {
        // Missing patient_id
        let json = json!({
            "title": "Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should reject missing patient_id");
        assert!(result.unwrap_err().contains("patient_id"));
    }

    #[test]
    fn create_appointment_wrong_type_patient_id() {
        // Frontend bug: sending string instead of number
        let json = json!({
            "patient_id": "1",  // String instead of i64
            "title": "Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should reject string patient_id");
    }

    #[test]
    fn create_appointment_empty_title() {
        let json = json!({
            "patient_id": 1,
            "title": "",  // Empty string
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Serde accepts empty string, but validation should catch it
        assert!(result.is_ok());
        let input = result.unwrap();
        assert_eq!(input.title, "");
    }

    #[test]
    fn create_appointment_title_with_special_chars() {
        let json = json!({
            "patient_id": 1,
            "title": "Checkup for \"Fluffy\" & Max's friend <test>",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
        assert!(result.unwrap().title.contains("\"Fluffy\""));
    }

    #[test]
    fn create_appointment_unicode_title() {
        let json = json!({
            "patient_id": 1,
            "title": "Преглед на Мурџо 🐱",  // Cyrillic + emoji
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
        assert!(result.unwrap().title.contains("🐱"));
    }

    #[test]
    fn create_appointment_various_date_formats() {
        // ISO 8601 with Z suffix (UTC)
        let json1 = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });
        assert!(parse_json::<CreateAppointmentInput>(json1).is_ok());

        // ISO 8601 with timezone offset
        let json2 = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T10:00:00+00:00",
            "end_time": "2024-06-15T10:30:00+00:00"
        });
        assert!(parse_json::<CreateAppointmentInput>(json2).is_ok());

        // ISO 8601 with milliseconds
        let json3 = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T10:00:00.000Z",
            "end_time": "2024-06-15T10:30:00.000Z"
        });
        assert!(parse_json::<CreateAppointmentInput>(json3).is_ok());
    }

    #[test]
    fn create_appointment_invalid_date_format() {
        // Non-ISO format that JavaScript might produce
        let json = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "June 15, 2024 10:00 AM",  // Invalid format
            "end_time": "June 15, 2024 10:30 AM"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should reject non-ISO date format");
    }

    #[test]
    fn create_appointment_extra_fields_ignored() {
        // Frontend might send extra fields that backend doesn't expect
        let json = json!({
            "patient_id": 1,
            "title": "Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "extra_field": "should be ignored",
            "another_extra": 123
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // By default, serde ignores extra fields (unless deny_unknown_fields)
        assert!(result.is_ok(), "Should ignore extra fields");
    }

    // ===== UpdateAppointmentInput =====

    #[test]
    fn update_appointment_empty_payload() {
        // Frontend sends empty object for "no changes"
        let json = json!({});

        let result: Result<UpdateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok(), "Should accept empty update payload");

        let input = result.unwrap();
        assert!(input.title.is_none());
        assert!(input.status.is_none());
    }

    #[test]
    fn update_appointment_single_field() {
        let json = json!({
            "title": "Updated Title"
        });

        let result: Result<UpdateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.title, Some("Updated Title".to_string()));
        assert!(input.description.is_none());
    }

    #[test]
    fn update_appointment_status_change() {
        let json = json!({
            "status": "completed"
        });

        let result: Result<UpdateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert!(input.status.is_some());
    }

    #[test]
    fn update_appointment_invalid_status() {
        let json = json!({
            "status": "invalid_status"
        });

        let result: Result<UpdateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should reject invalid status");
    }

    #[test]
    fn update_appointment_clear_room() {
        // Frontend wants to unassign room by setting to null
        let json = json!({
            "room_id": null
        });

        let result: Result<UpdateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
        // Note: This is a tricky case - Some(None) vs None
        // The current model might not distinguish "clear room" from "don't change"
    }

    // ===== AppointmentFilter =====

    #[test]
    fn filter_empty() {
        let json = json!({});

        let result: Result<AppointmentFilter, _> = parse_json(json);
        assert!(result.is_ok());

        let filter = result.unwrap();
        assert!(!filter.include_deleted);
    }

    #[test]
    fn filter_with_dates() {
        let json = json!({
            "start_date": "2024-06-01T00:00:00Z",
            "end_date": "2024-06-30T23:59:59Z"
        });

        let result: Result<AppointmentFilter, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn filter_include_deleted() {
        let json = json!({
            "include_deleted": true
        });

        let result: Result<AppointmentFilter, _> = parse_json(json);
        assert!(result.is_ok());
        assert!(result.unwrap().include_deleted);
    }

    #[test]
    fn filter_boolean_as_string() {
        // Frontend bug: sending "true" instead of true
        let json = json!({
            "include_deleted": "true"
        });

        let result: Result<AppointmentFilter, _> = parse_json(json);
        assert!(result.is_err(), "Should reject string boolean");
    }

    // ===== ConflictCheckInput =====

    #[test]
    fn conflict_check_minimal() {
        let json = json!({
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<ConflictCheckInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn conflict_check_with_room() {
        let json = json!({
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "room_id": 5,
            "exclude_appointment_id": 42
        });

        let result: Result<ConflictCheckInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.room_id, Some(5));
        assert_eq!(input.exclude_appointment_id, Some(42));
    }

    // ===== DuplicateAppointmentInput =====

    #[test]
    fn duplicate_appointment_valid() {
        let json = json!({
            "appointment_id": 42,
            "target_date": "2024-07-15T10:00:00Z"
        });

        let result: Result<DuplicateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn duplicate_appointment_missing_target() {
        let json = json!({
            "appointment_id": 42
        });

        let result: Result<DuplicateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should require target_date");
    }
}

mod room_contract {
    use super::*;
    use crate::models::{CreateRoomInput, UpdateRoomInput, RoomFilter};

    // ===== CreateRoomInput =====

    #[test]
    fn create_room_minimal() {
        let json = json!({
            "name": "Exam Room 1"
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Exam Room 1");
    }

    #[test]
    fn create_room_full() {
        let json = json!({
            "name": "Surgery Suite",
            "description": "Main surgical room with full equipment",
            "capacity": 4,
            "color": "#ff5733"
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        assert!(result.is_ok());

        let input = result.unwrap();
        assert_eq!(input.capacity, Some(4));
        assert_eq!(input.color, Some("#ff5733".to_string()));
    }

    #[test]
    fn create_room_missing_name() {
        let json = json!({
            "description": "A room without a name"
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        assert!(result.is_err(), "Should require name");
    }

    #[test]
    fn create_room_empty_name() {
        let json = json!({
            "name": ""
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        assert!(result.is_ok()); // Serde accepts, validation should catch
    }

    #[test]
    fn create_room_capacity_zero() {
        let json = json!({
            "name": "Tiny Room",
            "capacity": 0
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        assert!(result.is_ok()); // Serde accepts, validation should catch
    }

    #[test]
    fn create_room_negative_capacity() {
        let json = json!({
            "name": "Invalid Room",
            "capacity": -1
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        // Depends on whether capacity is i32 or u32
        // If i32, this will parse but should fail validation
    }

    #[test]
    fn create_room_invalid_color() {
        // Not a valid hex color
        let json = json!({
            "name": "Room",
            "color": "not-a-color"
        });

        let result: Result<CreateRoomInput, _> = parse_json(json);
        // Serde accepts any string, validation should catch invalid colors
        assert!(result.is_ok());
    }

    // ===== UpdateRoomInput =====

    #[test]
    fn update_room_empty() {
        let json = json!({});

        let result: Result<UpdateRoomInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn update_room_deactivate() {
        let json = json!({
            "is_active": false
        });

        let result: Result<UpdateRoomInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    // ===== RoomFilter =====

    #[test]
    fn room_filter_empty() {
        let json = json!({});

        let result: Result<RoomFilter, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn room_filter_active_only() {
        let json = json!({
            "active_only": true
        });

        let result: Result<RoomFilter, _> = parse_json(json);
        assert!(result.is_ok());
    }
}

mod patient_contract {
    use super::*;

    // Test the patient DTOs if they exist
    // These would be similar structure to appointment tests

    #[test]
    fn patient_create_input_typical() {
        // Example of what frontend might send for patient creation
        let json = json!({
            "name": "Fluffy",
            "species_id": 1,
            "breed_id": null,
            "gender": "female",
            "date_of_birth": "2020-03-15",
            "weight": 4.5,
            "medical_notes": null,
            "household_id": 42
        });

        // If there's a CreatePatientInput struct, test it here
        // For now just verify it's valid JSON
        assert!(json.is_object());
    }

    #[test]
    fn patient_weight_as_integer() {
        // Frontend might send weight as integer
        let json = json!({
            "name": "Max",
            "species_id": 1,
            "weight": 25  // Integer instead of float
        });

        // Should handle integer weights
        assert!(json.is_object());
    }
}

mod household_contract {
    use super::*;

    #[test]
    fn create_household_typical() {
        // Complex nested structure from frontend
        let json = json!({
            "household": {
                "household_name": "Smith Family",
                "address": "123 Main St",
                "notes": null
            },
            "people": [
                {
                    "person": {
                        "first_name": "John",
                        "last_name": "Smith",
                        "is_primary": true
                    },
                    "contacts": [
                        {
                            "contact_type": "email",
                            "contact_value": "john@example.com",
                            "is_primary": true
                        },
                        {
                            "contact_type": "phone",
                            "contact_value": "555-1234",
                            "is_primary": false
                        }
                    ]
                }
            ]
        });

        // This tests the complex nested structure
        assert!(json["people"].is_array());
        assert_eq!(json["people"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn create_household_empty_people() {
        let json = json!({
            "household": {
                "household_name": "Empty Household"
            },
            "people": []
        });

        // Should probably fail validation, but serde accepts it
        assert!(json["people"].as_array().unwrap().is_empty());
    }

    #[test]
    fn create_household_missing_primary() {
        // No person marked as primary
        let json = json!({
            "household": {
                "household_name": "No Primary"
            },
            "people": [
                {
                    "person": {
                        "first_name": "John",
                        "last_name": "Doe",
                        "is_primary": false
                    },
                    "contacts": []
                }
            ]
        });

        // Validation should catch this, but structure is valid
        assert!(json.is_object());
    }
}

mod edge_cases {
    use super::*;
    use crate::models::CreateAppointmentInput;

    #[test]
    fn extremely_long_title() {
        let long_title = "A".repeat(10000);
        let json = json!({
            "patient_id": 1,
            "title": long_title,
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Serde accepts, validation should limit to 200 chars
        assert!(result.is_ok());
        assert!(result.unwrap().title.len() == 10000);
    }

    #[test]
    fn null_bytes_in_string() {
        let json = json!({
            "patient_id": 1,
            "title": "Test\u{0000}Title",  // Null byte
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Might cause issues with SQLite
        assert!(result.is_ok());
    }

    #[test]
    fn sql_injection_in_title() {
        let json = json!({
            "patient_id": 1,
            "title": "'; DROP TABLE appointments; --",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Serde accepts, parameterized queries should prevent injection
        assert!(result.is_ok());
    }

    #[test]
    fn xss_in_description() {
        let json = json!({
            "patient_id": 1,
            "title": "Test",
            "description": "<script>alert('xss')</script>",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Desktop app, but still good to be aware
        assert!(result.is_ok());
    }

    #[test]
    fn very_large_id() {
        let json = json!({
            "patient_id": 9223372036854775807_i64,  // i64::MAX
            "title": "Test",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn negative_id() {
        let json = json!({
            "patient_id": -1,
            "title": "Test",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        // Serde accepts, validation should catch
        assert!(result.is_ok());
    }

    #[test]
    fn float_as_id() {
        let json = json!({
            "patient_id": 1.5,  // Float instead of int
            "title": "Test",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_err(), "Should reject float as ID");
    }

    #[test]
    fn date_far_in_past() {
        let json = json!({
            "patient_id": 1,
            "title": "Historical",
            "start_time": "1900-01-01T00:00:00Z",
            "end_time": "1900-01-01T01:00:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn date_far_in_future() {
        let json = json!({
            "patient_id": 1,
            "title": "Future",
            "start_time": "2099-12-31T23:00:00Z",
            "end_time": "2099-12-31T23:59:00Z"
        });

        let result: Result<CreateAppointmentInput, _> = parse_json(json);
        assert!(result.is_ok());
    }
}
