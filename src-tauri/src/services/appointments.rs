use chrono::{DateTime, Utc};
use sqlx::{SqlitePool, Row};
use crate::models::{
    Appointment, AppointmentDetail, PatientInfo,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    AppointmentListResponse, DuplicateAppointmentInput,
    ConflictCheckInput, ConflictCheckResponse, Room
};

pub struct AppointmentService;

impl AppointmentService {
    pub async fn get_appointments(
        pool: &SqlitePool,
        filter: AppointmentFilter,
        limit: i64,
        offset: i64,
    ) -> Result<AppointmentListResponse, String> {
        let mut query = String::from(
            "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE 1=1"
        );

        // Apply filters
        if !filter.include_deleted {
            query.push_str(" AND a.deleted_at IS NULL");
        }

        if let Some(start_date) = filter.start_date {
            query.push_str(&format!(" AND a.start_time >= '{}'", start_date.to_rfc3339()));
        }

        if let Some(end_date) = filter.end_date {
            query.push_str(&format!(" AND a.end_time <= '{}'", end_date.to_rfc3339()));
        }

        if let Some(patient_id) = filter.patient_id {
            query.push_str(&format!(" AND a.patient_id = {}", patient_id));
        }

        if let Some(room_id) = filter.room_id {
            query.push_str(&format!(" AND a.room_id = {}", room_id));
        }

        if let Some(ref status) = filter.status {
            query.push_str(&format!(" AND a.status = '{}'", status));
        }

        // Exclude cancelled appointments by default unless explicitly included
        // or when filtering by cancelled status specifically
        if filter.include_cancelled != Some(true) && filter.status != Some(crate::models::AppointmentStatus::Cancelled) {
            query.push_str(" AND a.status != 'cancelled'");
        }

        // Count total
        let count_query = format!("SELECT COUNT(*) as count FROM ({}) as t", query);
        let total: i64 = sqlx::query(&count_query)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to count appointments: {}", e))?
            .get("count");

        // Add ordering and pagination
        query.push_str(" ORDER BY a.start_time ASC");
        query.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

        // Fetch appointments
        let appointments = sqlx::query_as::<_, Appointment>(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch appointments: {}", e))?;

        let has_more = (offset + limit) < total;

        Ok(AppointmentListResponse {
            appointments,
            total,
            has_more,
        })
    }

    pub async fn get_appointment_by_id(
        pool: &SqlitePool,
        id: i64,
    ) -> Result<AppointmentDetail, String> {
        let appointment = sqlx::query_as::<_, Appointment>(
            "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE a.id = ? AND a.deleted_at IS NULL"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch appointment: {}", e))?
        .ok_or_else(|| "Appointment not found".to_string())?;

        // Fetch patient info
        let patient = sqlx::query_as::<_, PatientInfo>(
            "SELECT id, name, species, breed FROM patients WHERE id = ?"
        )
        .bind(appointment.patient_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        // Fetch room info if applicable
        let room = if let Some(room_id) = appointment.room_id {
            sqlx::query_as::<_, Room>("SELECT * FROM rooms WHERE id = ?")
                .bind(room_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("Failed to fetch room: {}", e))?
        } else {
            None
        };

        Ok(AppointmentDetail {
            appointment,
            patient,
            room,
        })
    }

    pub async fn create_appointment(
        pool: &SqlitePool,
        input: CreateAppointmentInput,
        created_by: String,
    ) -> Result<Appointment, String> {
        // Validate input
        input.validate()?;

        // Note: Conflict checking is handled by the frontend with user confirmation
        // Backend allows overlapping appointments in the same room

        // Insert appointment
        let result = sqlx::query(
            r#"
            INSERT INTO appointments
            (patient_id, title, description, start_time, end_time, room_id, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
            "#
        )
        .bind(input.patient_id)
        .bind(&input.title)
        .bind(&input.description)
        .bind(input.start_time)
        .bind(input.end_time)
        .bind(input.room_id)
        .bind(&created_by)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create appointment: {}", e))?;

        let appointment_id = result.last_insert_rowid();

        // Fetch and return the created appointment
        Self::get_appointment_simple(pool, appointment_id).await
    }

    pub async fn update_appointment(
        pool: &SqlitePool,
        id: i64,
        input: UpdateAppointmentInput,
        _updated_by: String,
    ) -> Result<Appointment, String> {
        // Validate input
        input.validate()?;

        // Check if appointment exists and is not deleted
        let existing = Self::get_appointment_simple(pool, id).await?;
        if existing.deleted_at.is_some() {
            return Err("Cannot update deleted appointment".to_string());
        }

        if input.title.is_none() && input.description.is_none()
            && input.start_time.is_none() && input.end_time.is_none()
            && input.room_id.is_none() && input.status.is_none() {
            return Ok(existing);
        }

        // Note: Conflict checking is handled by the frontend with user confirmation
        // Backend allows overlapping appointments in the same room

        // Update appointment with individual field updates
        let mut query = sqlx::query(
            r#"
            UPDATE appointments
            SET title = CASE WHEN ? IS NOT NULL THEN ? ELSE title END,
                description = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
                start_time = CASE WHEN ? IS NOT NULL THEN ? ELSE start_time END,
                end_time = CASE WHEN ? IS NOT NULL THEN ? ELSE end_time END,
                room_id = CASE WHEN ? IS NOT NULL THEN ? ELSE room_id END,
                status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#
        );

        let status_str1 = input.status.as_ref().map(|s| s.to_string());
        let status_str2 = input.status.as_ref().map(|s| s.to_string());

        query = query
            .bind(&input.title)
            .bind(&input.title)
            .bind(&input.description)
            .bind(&input.description)
            .bind(&input.start_time)
            .bind(&input.start_time)
            .bind(&input.end_time)
            .bind(&input.end_time)
            .bind(&input.room_id)
            .bind(&input.room_id)
            .bind(&status_str1)
            .bind(&status_str2)
            .bind(id);

        query
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update appointment: {}", e))?;

        Self::get_appointment_simple(pool, id).await
    }

    pub async fn delete_appointment(
        pool: &SqlitePool,
        id: i64,
    ) -> Result<(), String> {
        // Check if appointment exists
        let existing = Self::get_appointment_simple(pool, id).await?;
        if existing.deleted_at.is_some() {
            return Err("Appointment is already deleted".to_string());
        }

        // Soft delete
        sqlx::query(
            "UPDATE appointments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete appointment: {}", e))?;

        Ok(())
    }

    pub async fn check_conflicts(
        pool: &SqlitePool,
        input: ConflictCheckInput,
    ) -> Result<ConflictCheckResponse, String> {
        let conflicts = Self::check_conflicts_internal(
            pool,
            input.start_time,
            input.end_time,
            input.room_id,
            input.exclude_appointment_id,
        ).await?;

        Ok(ConflictCheckResponse {
            has_conflicts: !conflicts.is_empty(),
            conflicts,
        })
    }

    pub async fn duplicate_appointment(
        pool: &SqlitePool,
        input: DuplicateAppointmentInput,
        created_by: String,
    ) -> Result<Appointment, String> {
        // Fetch original appointment
        let original = Self::get_appointment_simple(pool, input.appointment_id).await?;
        if original.deleted_at.is_some() {
            return Err("Cannot duplicate deleted appointment".to_string());
        }

        // Calculate new times maintaining the same time of day
        let duration = original.end_time - original.start_time;
        let original_time_of_day = original.start_time.time();
        let new_start = input.target_date.date_naive().and_time(original_time_of_day);
        let new_start = DateTime::<Utc>::from_naive_utc_and_offset(new_start, Utc);
        let new_end = new_start + duration;

        // Create new appointment
        let create_input = CreateAppointmentInput {
            patient_id: original.patient_id,
            title: original.title,
            description: original.description,
            start_time: new_start,
            end_time: new_end,
            room_id: original.room_id,
        };

        Self::create_appointment(pool, create_input, created_by).await
    }

    // Internal helper to check conflicts
    async fn check_conflicts_internal(
        pool: &SqlitePool,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        room_id: Option<i64>,
        exclude_id: Option<i64>,
    ) -> Result<Vec<Appointment>, String> {
        let mut query = String::from(
            "SELECT
                a.id, a.patient_id, a.title, a.description, a.start_time, a.end_time,
                a.room_id, a.status, a.created_at, a.updated_at, a.deleted_at, a.created_by,
                p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             LEFT JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE a.deleted_at IS NULL
             AND a.status NOT IN ('cancelled', 'completed')"
        );

        if let Some(room_id) = room_id {
            query.push_str(&format!(" AND a.room_id = {}", room_id));
        }

        if let Some(exclude_id) = exclude_id {
            query.push_str(&format!(" AND a.id != {}", exclude_id));
        }

        // Add time overlap conditions
        query.push_str(&format!(
            " AND ((a.start_time <= '{}' AND a.end_time > '{}')
               OR (a.start_time < '{}' AND a.end_time >= '{}')
               OR (a.start_time >= '{}' AND a.end_time <= '{}'))",
            start_time.to_rfc3339(), start_time.to_rfc3339(),
            end_time.to_rfc3339(), end_time.to_rfc3339(),
            start_time.to_rfc3339(), end_time.to_rfc3339()
        ));

        sqlx::query_as::<_, Appointment>(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to check conflicts: {}", e))
    }

    // Helper to fetch appointment by ID
    async fn get_appointment_simple(
        pool: &SqlitePool,
        id: i64,
    ) -> Result<Appointment, String> {
        sqlx::query_as::<_, Appointment>(
            "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE a.id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch appointment: {}", e))?
        .ok_or_else(|| "Appointment not found".to_string())
    }
}