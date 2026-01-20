use crate::entities::room::{self, Entity as RoomEntity};
use crate::entities::appointment::{self, Entity as AppointmentEntity};
use crate::models::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter,
    RoomAvailability, RoomAppointmentSlot
};
use crate::models::dto::MaybeNull;
use chrono::{DateTime, Utc};
use sea_orm::*;

pub struct RoomService;

impl RoomService {
    /// Convert a SeaORM room model to the API Room model
    fn to_api_model(model: room::Model) -> Room {
        Room {
            id: model.id,
            name: model.name,
            description: model.description,
            capacity: model.capacity,
            color: model.color,
            is_active: model.is_active,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }

    pub async fn get_rooms(
        db: &DatabaseConnection,
        filter: RoomFilter,
    ) -> Result<Vec<Room>, String> {
        let mut query = RoomEntity::find();

        if filter.active_only {
            query = query.filter(room::Column::IsActive.eq(true));
        }

        let rooms = query
            .order_by_asc(room::Column::Name)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch rooms: {}", e))?;

        Ok(rooms.into_iter().map(Self::to_api_model).collect())
    }

    pub async fn get_room_by_id(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<Room, String> {
        let room = RoomEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch room: {}", e))?
            .ok_or_else(|| "Room not found".to_string())?;

        Ok(Self::to_api_model(room))
    }

    pub async fn create_room(
        db: &DatabaseConnection,
        input: CreateRoomInput,
    ) -> Result<Room, String> {
        // Validate input
        input.validate()?;

        // Check for duplicate name
        let existing = RoomEntity::find()
            .filter(room::Column::Name.eq(&input.name))
            .one(db)
            .await
            .map_err(|e| format!("Failed to check room name: {}", e))?;

        if existing.is_some() {
            return Err("Room with this name already exists".to_string());
        }

        let now = Utc::now();

        // Insert room
        let new_room = room::ActiveModel {
            name: Set(input.name),
            description: Set(input.description),
            capacity: Set(input.capacity.unwrap_or(1)),
            color: Set(input.color.unwrap_or_else(|| "#1890ff".to_string())),
            is_active: Set(true),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let result = RoomEntity::insert(new_room)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create room: {}", e))?;

        Self::get_room_by_id(db, result.last_insert_id).await
    }

    pub async fn update_room(
        db: &DatabaseConnection,
        id: i64,
        input: UpdateRoomInput,
    ) -> Result<Room, String> {
        // Validate input
        input.validate()?;

        // Check if room exists
        let existing = RoomEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch room: {}", e))?
            .ok_or_else(|| "Room not found".to_string())?;

        // Check for duplicate name if name is being updated
        if let Some(ref name) = input.name {
            let duplicate = RoomEntity::find()
                .filter(room::Column::Name.eq(name))
                .filter(room::Column::Id.ne(id))
                .one(db)
                .await
                .map_err(|e| format!("Failed to check room name: {}", e))?;

            if duplicate.is_some() {
                return Err("Room with this name already exists".to_string());
            }
        }

        if !input.has_updates() {
            return Ok(Self::to_api_model(existing));
        }

        let now = Utc::now();
        let mut room_model: room::ActiveModel = existing.into();

        if let Some(name) = input.name {
            room_model.name = Set(name);
        }
        if let Some(description) = input.description {
            room_model.description = Set(Some(description));
        }
        if let Some(capacity) = input.capacity {
            room_model.capacity = Set(capacity);
        }
        match input.color {
            MaybeNull::Undefined => {},
            MaybeNull::Null => { room_model.color = Set("#1890ff".to_string()); }, // Reset to default
            MaybeNull::Value(v) => { room_model.color = Set(v); },
        }
        if let Some(is_active) = input.is_active {
            room_model.is_active = Set(is_active);
        }
        room_model.updated_at = Set(now);

        room_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update room: {}", e))?;

        Self::get_room_by_id(db, id).await
    }

    pub async fn get_room_availability(
        db: &DatabaseConnection,
        room_id: i64,
        check_time: DateTime<Utc>,
    ) -> Result<RoomAvailability, String> {
        let room = Self::get_room_by_id(db, room_id).await?;

        // Get current appointments for this room on the same day
        // Using raw SQL for the complex join query
        let check_date = check_time.format("%Y-%m-%d").to_string();

        let appointments: Vec<RoomAppointmentSlot> = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
                SELECT
                    a.id as appointment_id,
                    p.name as patient_name,
                    a.start_time,
                    a.end_time,
                    a.status
                FROM appointments a
                JOIN patients p ON a.patient_id = p.id
                WHERE a.room_id = ?
                    AND a.deleted_at IS NULL
                    AND a.status IN ('scheduled', 'in_progress')
                    AND DATE(a.start_time) = DATE(?)
                ORDER BY a.start_time ASC
                "#,
                [room_id.into(), check_date.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch room appointments: {}", e))?
            .into_iter()
            .map(|row| {
                RoomAppointmentSlot {
                    appointment_id: row.try_get::<i64>("", "appointment_id").unwrap_or(0),
                    patient_name: row.try_get::<String>("", "patient_name").unwrap_or_default(),
                    start_time: row.try_get::<DateTime<Utc>>("", "start_time").unwrap_or(Utc::now()),
                    end_time: row.try_get::<DateTime<Utc>>("", "end_time").unwrap_or(Utc::now()),
                    status: row.try_get::<String>("", "status").unwrap_or_default(),
                }
            })
            .collect();

        // Check if room is available at the specific time
        let occupied_count = AppointmentEntity::find()
            .filter(appointment::Column::RoomId.eq(room_id))
            .filter(appointment::Column::DeletedAt.is_null())
            .filter(appointment::Column::Status.is_in(["scheduled", "in_progress"]))
            .filter(appointment::Column::StartTime.lte(check_time))
            .filter(appointment::Column::EndTime.gt(check_time))
            .count(db)
            .await
            .map_err(|e| format!("Failed to check availability: {}", e))?;

        let is_available = (occupied_count as i32) < room.capacity;

        // Find next available time if not available
        let next_available = if !is_available {
            AppointmentEntity::find()
                .filter(appointment::Column::RoomId.eq(room_id))
                .filter(appointment::Column::DeletedAt.is_null())
                .filter(appointment::Column::Status.is_in(["scheduled", "in_progress"]))
                .filter(appointment::Column::EndTime.gt(check_time))
                .order_by_asc(appointment::Column::EndTime)
                .one(db)
                .await
                .ok()
                .flatten()
                .map(|a| a.end_time)
        } else {
            None
        };

        Ok(RoomAvailability {
            room,
            is_available,
            next_available,
            current_appointments: appointments,
        })
    }

    pub async fn delete_room(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<(), String> {
        // Check if room has any appointments
        let appointment_count = AppointmentEntity::find()
            .filter(appointment::Column::RoomId.eq(id))
            .filter(appointment::Column::DeletedAt.is_null())
            .count(db)
            .await
            .map_err(|e| format!("Failed to check appointments: {}", e))?;

        if appointment_count > 0 {
            return Err("Cannot delete room with existing appointments".to_string());
        }

        // Delete room
        RoomEntity::delete_by_id(id)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete room: {}", e))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::*;
    use crate::models::{RoomFilter, CreateRoomInput, UpdateRoomInput};
    use crate::models::dto::MaybeNull;

    // ==================== CREATE TESTS ====================

    #[tokio::test]
    async fn test_create_room_success() {
        let db = create_test_db().await;

        let input = CreateRoomInput {
            name: "Exam Room 1".to_string(),
            description: Some("Main exam room".to_string()),
            capacity: Some(2),
            color: Some("#3498db".to_string()),
        };

        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_ok());

        let room = result.unwrap();
        assert_eq!(room.name, "Exam Room 1");
        assert_eq!(room.description, Some("Main exam room".to_string()));
        assert_eq!(room.capacity, 2);
        assert_eq!(room.color, "#3498db");
        assert!(room.is_active);
    }

    #[tokio::test]
    async fn test_create_room_with_defaults() {
        let db = create_test_db().await;

        let input = CreateRoomInput {
            name: "Simple Room".to_string(),
            description: None,
            capacity: None,
            color: None,
        };

        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_ok());

        let room = result.unwrap();
        assert_eq!(room.capacity, 1); // Default capacity
        assert_eq!(room.color, "#1890ff"); // Default color
    }

    #[tokio::test]
    async fn test_create_room_duplicate_name_fails() {
        let db = create_test_db().await;

        let input = CreateRoomInput {
            name: "Exam Room".to_string(),
            description: None,
            capacity: None,
            color: None,
        };

        // Create first room
        RoomService::create_room(&db, input.clone()).await.unwrap();

        // Try to create duplicate
        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[tokio::test]
    async fn test_create_room_validation_error() {
        let db = create_test_db().await;

        let input = CreateRoomInput {
            name: "".to_string(), // Empty name
            description: None,
            capacity: None,
            color: None,
        };

        let result = RoomService::create_room(&db, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    // ==================== GET TESTS ====================

    #[tokio::test]
    async fn test_get_rooms_empty() {
        let db = create_test_db().await;

        let filter = RoomFilter::default();
        let result = RoomService::get_rooms(&db, filter).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_get_rooms_returns_created() {
        let db = create_test_db().await;

        // Create two rooms
        RoomService::create_room(&db, CreateRoomInput {
            name: "Room A".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        RoomService::create_room(&db, CreateRoomInput {
            name: "Room B".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        let filter = RoomFilter::default();
        let rooms = RoomService::get_rooms(&db, filter).await.unwrap();

        assert_eq!(rooms.len(), 2);
        // Should be sorted by name
        assert_eq!(rooms[0].name, "Room A");
        assert_eq!(rooms[1].name, "Room B");
    }

    #[tokio::test]
    async fn test_get_rooms_active_only_filter() {
        let db = create_test_db().await;

        // Create active room
        let room = RoomService::create_room(&db, CreateRoomInput {
            name: "Active Room".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        // Deactivate it
        RoomService::update_room(&db, room.id, UpdateRoomInput {
            name: None,
            description: None,
            capacity: None,
            color: MaybeNull::Undefined,
            is_active: Some(false),
        }).await.unwrap();

        // Create another active room
        RoomService::create_room(&db, CreateRoomInput {
            name: "Still Active".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        // Get only active rooms (default)
        let active_rooms = RoomService::get_rooms(&db, RoomFilter { active_only: true }).await.unwrap();
        assert_eq!(active_rooms.len(), 1);
        assert_eq!(active_rooms[0].name, "Still Active");

        // Get all rooms
        let all_rooms = RoomService::get_rooms(&db, RoomFilter { active_only: false }).await.unwrap();
        assert_eq!(all_rooms.len(), 2);
    }

    #[tokio::test]
    async fn test_get_room_by_id() {
        let db = create_test_db().await;

        let created = RoomService::create_room(&db, CreateRoomInput {
            name: "Test Room".to_string(),
            description: Some("Test description".to_string()),
            capacity: Some(3),
            color: Some("#e74c3c".to_string()),
        }).await.unwrap();

        let fetched = RoomService::get_room_by_id(&db, created.id).await.unwrap();

        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.name, "Test Room");
        assert_eq!(fetched.description, Some("Test description".to_string()));
        assert_eq!(fetched.capacity, 3);
    }

    #[tokio::test]
    async fn test_get_room_by_id_not_found() {
        let db = create_test_db().await;

        let result = RoomService::get_room_by_id(&db, 99999).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ==================== UPDATE TESTS ====================

    #[tokio::test]
    async fn test_update_room_name() {
        let db = create_test_db().await;

        let created = RoomService::create_room(&db, CreateRoomInput {
            name: "Original Name".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        let updated = RoomService::update_room(&db, created.id, UpdateRoomInput {
            name: Some("New Name".to_string()),
            description: None,
            capacity: None,
            color: MaybeNull::Undefined,
            is_active: None,
        }).await.unwrap();

        assert_eq!(updated.name, "New Name");
    }

    #[tokio::test]
    async fn test_update_room_duplicate_name_fails() {
        let db = create_test_db().await;

        RoomService::create_room(&db, CreateRoomInput {
            name: "Room A".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        let room_b = RoomService::create_room(&db, CreateRoomInput {
            name: "Room B".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        // Try to rename Room B to Room A
        let result = RoomService::update_room(&db, room_b.id, UpdateRoomInput {
            name: Some("Room A".to_string()),
            description: None,
            capacity: None,
            color: MaybeNull::Undefined,
            is_active: None,
        }).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[tokio::test]
    async fn test_update_room_deactivate() {
        let db = create_test_db().await;

        let created = RoomService::create_room(&db, CreateRoomInput {
            name: "Test Room".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        assert!(created.is_active);

        let updated = RoomService::update_room(&db, created.id, UpdateRoomInput {
            name: None,
            description: None,
            capacity: None,
            color: MaybeNull::Undefined,
            is_active: Some(false),
        }).await.unwrap();

        assert!(!updated.is_active);
    }

    #[tokio::test]
    async fn test_update_room_color_reset() {
        let db = create_test_db().await;

        let created = RoomService::create_room(&db, CreateRoomInput {
            name: "Test Room".to_string(),
            description: None,
            capacity: None,
            color: Some("#e74c3c".to_string()),
        }).await.unwrap();

        // Reset color to default
        let updated = RoomService::update_room(&db, created.id, UpdateRoomInput {
            name: None,
            description: None,
            capacity: None,
            color: MaybeNull::Null, // Reset
            is_active: None,
        }).await.unwrap();

        assert_eq!(updated.color, "#1890ff"); // Default color
    }

    #[tokio::test]
    async fn test_update_room_not_found() {
        let db = create_test_db().await;

        let result = RoomService::update_room(&db, 99999, UpdateRoomInput {
            name: Some("New Name".to_string()),
            description: None,
            capacity: None,
            color: MaybeNull::Undefined,
            is_active: None,
        }).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ==================== DELETE TESTS ====================

    #[tokio::test]
    async fn test_delete_room_success() {
        let db = create_test_db().await;

        let created = RoomService::create_room(&db, CreateRoomInput {
            name: "To Delete".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        let result = RoomService::delete_room(&db, created.id).await;
        assert!(result.is_ok());

        // Verify it's gone
        let fetch_result = RoomService::get_room_by_id(&db, created.id).await;
        assert!(fetch_result.is_err());
    }

    #[tokio::test]
    async fn test_delete_room_with_appointments_fails() {
        let db = create_test_db().await;

        // Create room
        let room = RoomService::create_room(&db, CreateRoomInput {
            name: "Busy Room".to_string(),
            description: None,
            capacity: None,
            color: None,
        }).await.unwrap();

        // Create patient and appointment for this room
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Insert appointment directly
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO appointments (patient_id, title, start_time, end_time, room_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                patient_id.into(),
                "Checkup".into(),
                test_time_slot(10, 0).to_rfc3339().into(),
                test_time_slot(10, 2).to_rfc3339().into(),
                room.id.into(),
                "scheduled".into(),
                "test".into(),
            ],
        )).await.unwrap();

        // Try to delete room
        let result = RoomService::delete_room(&db, room.id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("existing appointments"));
    }

    // ==================== AVAILABILITY TESTS ====================

    #[tokio::test]
    async fn test_room_availability_empty() {
        let db = create_test_db().await;

        let room = RoomService::create_room(&db, CreateRoomInput {
            name: "Empty Room".to_string(),
            description: None,
            capacity: Some(2),
            color: None,
        }).await.unwrap();

        let availability = RoomService::get_room_availability(&db, room.id, test_time_slot(10, 0)).await.unwrap();

        assert!(availability.is_available);
        assert!(availability.next_available.is_none());
        assert_eq!(availability.current_appointments.len(), 0);
    }

    #[tokio::test]
    async fn test_room_availability_with_appointment() {
        let db = create_test_db().await;

        let room = RoomService::create_room(&db, CreateRoomInput {
            name: "Exam Room".to_string(),
            description: None,
            capacity: Some(1), // Only 1 capacity
            color: None,
        }).await.unwrap();

        // Create patient and appointment
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Insert appointment for 10:00-10:30
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO appointments (patient_id, title, start_time, end_time, room_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                patient_id.into(),
                "Checkup".into(),
                test_time_slot(10, 0).to_rfc3339().into(),
                test_time_slot(10, 2).to_rfc3339().into(),
                room.id.into(),
                "scheduled".into(),
                "test".into(),
            ],
        )).await.unwrap();

        // Check at 10:15 - should be occupied
        let availability = RoomService::get_room_availability(&db, room.id, test_time_slot(10, 1)).await.unwrap();
        assert!(!availability.is_available);
        assert!(availability.next_available.is_some());

        // Check at 11:00 - should be available
        let availability_later = RoomService::get_room_availability(&db, room.id, test_time_slot(11, 0)).await.unwrap();
        assert!(availability_later.is_available);
    }
}
