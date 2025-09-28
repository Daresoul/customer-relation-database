use sqlx::{SqlitePool, Row};
use crate::models::{
    Room, CreateRoomInput, UpdateRoomInput, RoomFilter,
    RoomAvailability, RoomAppointmentSlot
};
use chrono::{DateTime, Utc};

pub struct RoomService;

impl RoomService {
    pub async fn get_rooms(
        pool: &SqlitePool,
        filter: RoomFilter,
    ) -> Result<Vec<Room>, String> {
        let mut query = String::from("SELECT * FROM rooms WHERE 1=1");

        if filter.active_only {
            query.push_str(" AND is_active = 1");
        }

        query.push_str(" ORDER BY name ASC");

        sqlx::query_as::<_, Room>(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch rooms: {}", e))
    }

    pub async fn get_room_by_id(
        pool: &SqlitePool,
        id: i64,
    ) -> Result<Room, String> {
        sqlx::query_as::<_, Room>(
            "SELECT * FROM rooms WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch room: {}", e))?
        .ok_or_else(|| "Room not found".to_string())
    }

    pub async fn create_room(
        pool: &SqlitePool,
        input: CreateRoomInput,
    ) -> Result<Room, String> {
        // Validate input
        input.validate()?;

        // Check for duplicate name
        let existing = sqlx::query("SELECT id FROM rooms WHERE name = ?")
            .bind(&input.name)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to check room name: {}", e))?;

        if existing.is_some() {
            return Err("Room with this name already exists".to_string());
        }

        // Insert room
        let result = sqlx::query(
            r#"
            INSERT INTO rooms (name, description, capacity, color, is_active)
            VALUES (?, ?, ?, ?, 1)
            "#
        )
        .bind(&input.name)
        .bind(&input.description)
        .bind(input.capacity.unwrap_or(1))
        .bind(input.color.as_deref().unwrap_or("#1890ff"))
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create room: {}", e))?;

        let room_id = result.last_insert_rowid();
        Self::get_room_by_id(pool, room_id).await
    }

    pub async fn update_room(
        pool: &SqlitePool,
        id: i64,
        input: UpdateRoomInput,
    ) -> Result<Room, String> {
        // Validate input
        input.validate()?;

        // Check if room exists
        let existing = Self::get_room_by_id(pool, id).await?;

        // Check for duplicate name if name is being updated
        if let Some(ref name) = input.name {
            let duplicate = sqlx::query("SELECT id FROM rooms WHERE name = ? AND id != ?")
                .bind(name)
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Failed to check room name: {}", e))?;

            if duplicate.is_some() {
                return Err("Room with this name already exists".to_string());
            }
        }

        if input.name.is_none() && input.description.is_none()
            && input.capacity.is_none() && input.color.is_none() && input.is_active.is_none() {
            return Ok(existing);
        }

        // Update room with individual field updates
        let mut query = sqlx::query(
            r#"
            UPDATE rooms
            SET name = CASE WHEN ? IS NOT NULL THEN ? ELSE name END,
                description = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
                capacity = CASE WHEN ? IS NOT NULL THEN ? ELSE capacity END,
                color = CASE WHEN ? IS NOT NULL THEN ? ELSE color END,
                is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#
        );

        query = query
            .bind(&input.name)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.description)
            .bind(&input.capacity)
            .bind(&input.capacity)
            .bind(&input.color)
            .bind(&input.color)
            .bind(&input.is_active)
            .bind(&input.is_active)
            .bind(id);

        query
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update room: {}", e))?;

        Self::get_room_by_id(pool, id).await
    }

    pub async fn get_room_availability(
        pool: &SqlitePool,
        room_id: i64,
        check_time: DateTime<Utc>,
    ) -> Result<RoomAvailability, String> {
        let room = Self::get_room_by_id(pool, room_id).await?;

        // Get current appointments for this room around the check time
        let appointments = sqlx::query_as::<_, RoomAppointmentSlot>(
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
            "#
        )
        .bind(room_id)
        .bind(check_time)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch room appointments: {}", e))?;

        // Check if room is available at the specific time
        let is_occupied = sqlx::query(
            r#"
            SELECT COUNT(*) as count
            FROM appointments
            WHERE room_id = ?
                AND deleted_at IS NULL
                AND status IN ('scheduled', 'in_progress')
                AND start_time <= ? AND end_time > ?
            "#
        )
        .bind(room_id)
        .bind(check_time)
        .bind(check_time)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to check availability: {}", e))?
        .try_get::<i32, _>("count")
        .unwrap_or(0);

        let is_available = is_occupied < room.capacity;

        // Find next available time if not available
        let next_available = if !is_available {
            sqlx::query(
                r#"
                SELECT MIN(end_time) as next_time
                FROM appointments
                WHERE room_id = ?
                    AND deleted_at IS NULL
                    AND status IN ('scheduled', 'in_progress')
                    AND end_time > ?
                "#
            )
            .bind(room_id)
            .bind(check_time)
            .fetch_one(pool)
            .await
            .ok()
            .and_then(|row| row.try_get::<DateTime<Utc>, _>("next_time").ok())
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
        pool: &SqlitePool,
        id: i64,
    ) -> Result<(), String> {
        // Check if room has any appointments
        let has_appointments = sqlx::query(
            "SELECT COUNT(*) as count FROM appointments WHERE room_id = ? AND deleted_at IS NULL"
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to check appointments: {}", e))?
        .try_get::<i32, _>("count")
        .unwrap_or(0) > 0;

        if has_appointments {
            return Err("Cannot delete room with existing appointments".to_string());
        }

        // Delete room
        sqlx::query("DELETE FROM rooms WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete room: {}", e))?;

        Ok(())
    }
}