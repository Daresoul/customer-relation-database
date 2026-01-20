//! End-to-end contract tests
//!
//! These tests simulate the full flow from frontend JSON payload
//! through validation to database operations.
//!
//! Flow: Frontend JSON → Parse → Validate → Service → Database → Response

use serde_json::{json, Value};
use crate::test_utils::*;
use crate::models::{
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter, AppointmentStatus,
    CreateRoomInput, UpdateRoomInput, RoomFilter,
};
use crate::services::appointments::AppointmentService;
use crate::services::rooms::RoomService;

/// Helper to simulate what Tauri receives after ApiService transformation
fn parse_json<T: serde::de::DeserializeOwned>(json: Value) -> Result<T, String> {
    serde_json::from_value(json).map_err(|e| e.to_string())
}

mod appointment_e2e {
    use super::*;

    #[tokio::test]
    async fn create_appointment_from_frontend_json() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        // Simulate frontend payload (after camelCase → snake_case transformation)
        let json = json!({
            "patient_id": patient_id,
            "title": "Annual Checkup",
            "description": "Routine examination",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "room_id": room_id
        });

        // Parse JSON (as Tauri does)
        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        // Validate (as service does)
        input.validate().expect("Should validate");

        // Execute service operation
        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_ok(), "Should create appointment: {:?}", result.err());

        let appointment = result.unwrap();
        assert_eq!(appointment.title, "Annual Checkup");
        assert_eq!(appointment.patient_id, patient_id);
        assert_eq!(appointment.room_id, Some(room_id));
    }

    #[tokio::test]
    async fn create_appointment_frontend_validation_failure() {
        // Frontend sends invalid time interval
        let json = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T10:07:00Z",  // Not on 15-min boundary
            "end_time": "2024-06-15T10:30:00Z"
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        // Validation should catch the invalid time
        let result = input.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("15-minute"));
    }

    #[tokio::test]
    async fn create_appointment_title_too_long() {
        let long_title = "A".repeat(201);
        let json = json!({
            "patient_id": 1,
            "title": long_title,
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        let result = input.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("200 characters"));
    }

    #[tokio::test]
    async fn create_appointment_end_before_start() {
        let json = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T11:00:00Z",
            "end_time": "2024-06-15T10:00:00Z"  // Before start
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        let result = input.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("after start"));
    }

    #[tokio::test]
    async fn create_appointment_too_short() {
        let json = json!({
            "patient_id": 1,
            "title": "Test",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:00:00Z"  // Same time (0 duration)
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        let result = input.validate();
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn create_appointment_too_long() {
        let json = json!({
            "patient_id": 1,
            "title": "Very Long Procedure",
            "start_time": "2024-06-15T08:00:00Z",
            "end_time": "2024-06-15T17:00:00Z"  // 9 hours, max is 8
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");

        let result = input.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("8 hours"));
    }

    #[tokio::test]
    async fn create_appointment_nonexistent_patient() {
        let db = create_test_db().await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        let json = json!({
            "patient_id": 99999,  // Doesn't exist
            "title": "Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "room_id": room_id
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");
        input.validate().expect("Input is valid");

        // Service should reject due to FK constraint
        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_err(), "Should reject nonexistent patient");
    }

    #[tokio::test]
    async fn create_appointment_nonexistent_room() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let json = json!({
            "patient_id": patient_id,
            "title": "Checkup",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z",
            "room_id": 99999  // Doesn't exist
        });

        let input: CreateAppointmentInput = parse_json(json).expect("Should parse");
        input.validate().expect("Input is valid");

        // Service should reject due to FK constraint
        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_err(), "Should reject nonexistent room");
    }

    #[tokio::test]
    async fn update_appointment_from_frontend_json() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Create an appointment first
        let create_json = json!({
            "patient_id": patient_id,
            "title": "Original Title",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });
        let create_input: CreateAppointmentInput = parse_json(create_json).unwrap();
        let appointment = AppointmentService::create_appointment(&db, create_input, "user".to_string())
            .await.unwrap();

        // Update from frontend
        let update_json = json!({
            "title": "Updated Title",
            "status": "in_progress"
        });
        let update_input: UpdateAppointmentInput = parse_json(update_json).expect("Should parse");
        update_input.validate().expect("Should validate");

        let result = AppointmentService::update_appointment(
            &db,
            appointment.id,
            update_input,
            "user".to_string()
        ).await;

        assert!(result.is_ok());
        let updated = result.unwrap();
        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.status, AppointmentStatus::InProgress);
    }

    #[tokio::test]
    async fn filter_appointments_from_frontend_json() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Create some appointments
        for i in 0..3 {
            let json = json!({
                "patient_id": patient_id,
                "title": format!("Appointment {}", i),
                "start_time": format!("2024-06-{}T10:00:00Z", 15 + i),
                "end_time": format!("2024-06-{}T10:30:00Z", 15 + i)
            });
            let input: CreateAppointmentInput = parse_json(json).unwrap();
            AppointmentService::create_appointment(&db, input, "user".to_string()).await.unwrap();
        }

        // Filter from frontend (empty filter - get all)
        let filter_json = json!({});
        let filter: AppointmentFilter = parse_json(filter_json).expect("Should parse empty filter");

        let result = AppointmentService::get_appointments(&db, filter, 10, 0).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().appointments.len(), 3);
    }

    #[tokio::test]
    async fn filter_appointments_by_date_range() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Create appointments on different days
        for i in 0..5 {
            let json = json!({
                "patient_id": patient_id,
                "title": format!("Appointment {}", i),
                "start_time": format!("2024-06-{}T10:00:00Z", 10 + i),
                "end_time": format!("2024-06-{}T10:30:00Z", 10 + i)
            });
            let input: CreateAppointmentInput = parse_json(json).unwrap();
            AppointmentService::create_appointment(&db, input, "user".to_string()).await.unwrap();
        }

        // Filter by date range (only 11th and 12th)
        let filter_json = json!({
            "start_date": "2024-06-11T00:00:00Z",
            "end_date": "2024-06-12T23:59:59Z"
        });
        let filter: AppointmentFilter = parse_json(filter_json).expect("Should parse filter");

        let result = AppointmentService::get_appointments(&db, filter, 10, 0).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().appointments.len(), 2);
    }

    #[tokio::test]
    async fn conflict_detection_from_frontend() {
        use crate::models::ConflictCheckInput;

        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room").await;

        // Create first appointment
        let json = json!({
            "patient_id": patient_id,
            "title": "First",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T11:00:00Z",
            "room_id": room_id
        });
        let input: CreateAppointmentInput = parse_json(json).unwrap();
        AppointmentService::create_appointment(&db, input, "user".to_string()).await.unwrap();

        // Frontend would call check_conflicts before creating
        // to show the user a warning
        let conflict_check_json = json!({
            "start_time": "2024-06-15T10:30:00Z",
            "end_time": "2024-06-15T11:30:00Z",
            "room_id": room_id
        });
        let conflict_input: ConflictCheckInput = parse_json(conflict_check_json).unwrap();
        let conflict_result = AppointmentService::check_conflicts(&db, conflict_input).await;

        assert!(conflict_result.is_ok());
        let response = conflict_result.unwrap();
        assert!(response.has_conflicts, "Should detect conflict");
        assert_eq!(response.conflicts.len(), 1);
        assert_eq!(response.conflicts[0].title, "First");
    }
}

mod room_e2e {
    use super::*;

    #[tokio::test]
    async fn create_room_from_frontend_json() {
        let db = create_test_db().await;

        let json = json!({
            "name": "Surgery Suite",
            "description": "Main surgical room",
            "capacity": 4,
            "color": "#ff5733"
        });

        let input: CreateRoomInput = parse_json(json).expect("Should parse");
        input.validate().expect("Should validate");

        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_ok());

        let room = result.unwrap();
        assert_eq!(room.name, "Surgery Suite");
        assert_eq!(room.capacity, 4);
        assert_eq!(room.color, "#ff5733");
    }

    #[tokio::test]
    async fn create_room_minimal_frontend_json() {
        let db = create_test_db().await;

        // Frontend sends only required field
        let json = json!({
            "name": "Basic Room"
        });

        let input: CreateRoomInput = parse_json(json).expect("Should parse");
        input.validate().expect("Should validate");

        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_ok());

        let room = result.unwrap();
        assert_eq!(room.name, "Basic Room");
        assert_eq!(room.capacity, 1); // Default
    }

    #[tokio::test]
    async fn create_room_empty_name_fails_validation() {
        let json = json!({
            "name": ""
        });

        let input: CreateRoomInput = parse_json(json).expect("Should parse");
        let result = input.validate();

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn create_room_name_too_long_fails_validation() {
        let json = json!({
            "name": "A".repeat(101)
        });

        let input: CreateRoomInput = parse_json(json).expect("Should parse");
        let result = input.validate();

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("100 characters"));
    }

    #[tokio::test]
    async fn create_room_zero_capacity_fails_validation() {
        let json = json!({
            "name": "Small Room",
            "capacity": 0
        });

        let input: CreateRoomInput = parse_json(json).expect("Should parse");
        let result = input.validate();

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least 1"));
    }

    #[tokio::test]
    async fn create_duplicate_room_name_fails() {
        let db = create_test_db().await;

        // Create first room
        let json1 = json!({ "name": "Exam Room 1" });
        let input1: CreateRoomInput = parse_json(json1).unwrap();
        RoomService::create_room(&db, input1).await.unwrap();

        // Try to create duplicate
        let json2 = json!({ "name": "Exam Room 1" });
        let input2: CreateRoomInput = parse_json(json2).unwrap();
        let result = RoomService::create_room(&db, input2).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_lowercase().contains("exist"));
    }

    #[tokio::test]
    async fn update_room_from_frontend_json() {
        let db = create_test_db().await;

        // Create room
        let create_json = json!({ "name": "Original" });
        let create_input: CreateRoomInput = parse_json(create_json).unwrap();
        let room = RoomService::create_room(&db, create_input).await.unwrap();

        // Update from frontend
        let update_json = json!({
            "name": "Updated Name",
            "capacity": 5
        });
        let update_input: UpdateRoomInput = parse_json(update_json).expect("Should parse");
        update_input.validate().expect("Should validate");

        let result = RoomService::update_room(&db, room.id, update_input).await;
        assert!(result.is_ok());

        let updated = result.unwrap();
        assert_eq!(updated.name, "Updated Name");
        assert_eq!(updated.capacity, 5);
    }

    #[tokio::test]
    async fn filter_rooms_empty_filter() {
        let db = create_test_db().await;

        // Create some rooms
        for i in 1..=3 {
            let json = json!({ "name": format!("Room {}", i) });
            let input: CreateRoomInput = parse_json(json).unwrap();
            RoomService::create_room(&db, input).await.unwrap();
        }

        // Empty filter from frontend
        let filter_json = json!({});
        let filter: RoomFilter = parse_json(filter_json).expect("Should parse empty filter");

        let result = RoomService::get_rooms(&db, filter).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn filter_rooms_active_only() {
        let db = create_test_db().await;

        // Create rooms
        let json1 = json!({ "name": "Active Room" });
        let input1: CreateRoomInput = parse_json(json1).unwrap();
        let active_room = RoomService::create_room(&db, input1).await.unwrap();

        let json2 = json!({ "name": "Inactive Room" });
        let input2: CreateRoomInput = parse_json(json2).unwrap();
        let inactive_room = RoomService::create_room(&db, input2).await.unwrap();

        // Deactivate one room
        let update_json = json!({ "is_active": false });
        let update_input: UpdateRoomInput = parse_json(update_json).unwrap();
        RoomService::update_room(&db, inactive_room.id, update_input).await.unwrap();

        // Filter active only
        let filter_json = json!({ "active_only": true });
        let filter: RoomFilter = parse_json(filter_json).unwrap();

        let result = RoomService::get_rooms(&db, filter).await;
        assert!(result.is_ok());
        let rooms = result.unwrap();
        assert_eq!(rooms.len(), 1);
        assert_eq!(rooms[0].name, "Active Room");
    }
}

mod security_e2e {
    use super::*;

    #[tokio::test]
    async fn sql_injection_in_title_is_safe() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Attempt SQL injection
        let json = json!({
            "patient_id": patient_id,
            "title": "'; DROP TABLE appointments; --",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let input: CreateAppointmentInput = parse_json(json).unwrap();
        let result = AppointmentService::create_appointment(&db, input, "user".to_string()).await;

        // Should succeed (parameterized queries prevent injection)
        assert!(result.is_ok());

        // Verify table still exists by querying
        let filter_json = json!({});
        let filter: AppointmentFilter = parse_json(filter_json).unwrap();
        let all = AppointmentService::get_appointments(&db, filter, 10, 0).await;
        assert!(all.is_ok());
    }

    #[tokio::test]
    async fn unicode_handling_in_strings() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Various unicode characters
        let json = json!({
            "patient_id": patient_id,
            "title": "Преглед на 愛犬 🐕 für Müller",  // Cyrillic, CJK, emoji, umlauts
            "description": "Notes: ñ, ü, 中文, العربية",
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let input: CreateAppointmentInput = parse_json(json).unwrap();
        let result = AppointmentService::create_appointment(&db, input, "user".to_string()).await;

        assert!(result.is_ok());
        let appointment = result.unwrap();
        assert!(appointment.title.contains("🐕"));
        assert!(appointment.title.contains("愛犬"));
    }

    #[tokio::test]
    async fn very_long_description_handling() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // 10KB description
        let long_desc = "Lorem ipsum dolor sit amet. ".repeat(500);
        let json = json!({
            "patient_id": patient_id,
            "title": "Test",
            "description": long_desc,
            "start_time": "2024-06-15T10:00:00Z",
            "end_time": "2024-06-15T10:30:00Z"
        });

        let input: CreateAppointmentInput = parse_json(json).unwrap();
        let result = AppointmentService::create_appointment(&db, input, "user".to_string()).await;

        // SQLite can handle large TEXT fields
        assert!(result.is_ok());
    }
}
