use chrono::{DateTime, Utc};
use sea_orm::*;
use crate::entities::appointment::{self, Entity as AppointmentEntity};
use crate::entities::room::Entity as RoomEntity;
use crate::models::{
    Appointment, AppointmentDetail, PatientInfo,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    AppointmentListResponse, DuplicateAppointmentInput,
    ConflictCheckInput, ConflictCheckResponse, Room
};
use crate::models::dto::MaybeNull;
use crate::models::AppointmentStatus;

pub struct AppointmentService;

/// The status the app shows, from the stored status and the arrival columns
/// (see `AppointmentService::stored_status`).
const EFFECTIVE_STATUS_SQL: &str = "(CASE \
    WHEN a.status = 'cancelled' AND a.no_show_at IS NOT NULL THEN 'no_show' \
    WHEN a.status = 'scheduled' AND a.checked_in_at IS NOT NULL THEN 'checked_in' \
    ELSE a.status END)";

impl AppointmentService {
    pub async fn get_appointments(
        db: &DatabaseConnection,
        filter: AppointmentFilter,
        limit: i64,
        offset: i64,
    ) -> Result<AppointmentListResponse, String> {
        // Build the main query with joins
        let mut sql = String::from(
            "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE 1=1"
        );
        let mut count_sql = String::from(
            "SELECT COUNT(*) as count FROM appointments a WHERE 1=1"
        );

        let mut params: Vec<Value> = Vec::new();
        let mut count_params: Vec<Value> = Vec::new();

        // Apply filters
        if !filter.include_deleted {
            sql.push_str(" AND a.deleted_at IS NULL");
            count_sql.push_str(" AND a.deleted_at IS NULL");
        }

        if let Some(start_date) = filter.start_date {
            sql.push_str(" AND a.start_time >= ?");
            count_sql.push_str(" AND a.start_time >= ?");
            params.push(start_date.to_rfc3339().into());
            count_params.push(start_date.to_rfc3339().into());
        }

        if let Some(end_date) = filter.end_date {
            sql.push_str(" AND a.end_time <= ?");
            count_sql.push_str(" AND a.end_time <= ?");
            params.push(end_date.to_rfc3339().into());
            count_params.push(end_date.to_rfc3339().into());
        }

        if let Some(patient_id) = filter.patient_id {
            sql.push_str(" AND a.patient_id = ?");
            count_sql.push_str(" AND a.patient_id = ?");
            params.push(patient_id.into());
            count_params.push(patient_id.into());
        }

        if let Some(room_id) = filter.room_id {
            sql.push_str(" AND a.room_id = ?");
            count_sql.push_str(" AND a.room_id = ?");
            params.push(room_id.into());
            count_params.push(room_id.into());
        }

        if let Some(ref status) = filter.status {
            let clause = format!(" AND {} = ?", EFFECTIVE_STATUS_SQL);
            sql.push_str(&clause);
            count_sql.push_str(&clause);
            params.push(status.to_string().into());
            count_params.push(status.to_string().into());
        }

        // Cancelled and no-show (stored as cancelled) stay out unless asked for.
        let asks_for_cancelled = matches!(
            filter.status,
            Some(AppointmentStatus::Cancelled) | Some(AppointmentStatus::NoShow)
        );
        if filter.include_cancelled != Some(true) && !asks_for_cancelled {
            sql.push_str(" AND a.status != 'cancelled'");
            count_sql.push_str(" AND a.status != 'cancelled'");
        }

        // Get total count
        let count_result = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &count_sql,
                count_params,
            ))
            .await
            .map_err(|e| format!("Failed to count appointments: {}", e))?
            .ok_or_else(|| "Failed to get count".to_string())?;

        let total: i64 = count_result.try_get("", "count").unwrap_or(0);

        // Add ordering and pagination
        sql.push_str(" ORDER BY a.start_time ASC LIMIT ? OFFSET ?");
        params.push(limit.into());
        params.push(offset.into());

        // Fetch appointments
        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                params,
            ))
            .await
            .map_err(|e| format!("Failed to fetch appointments: {}", e))?;

        let appointments = Self::readable_appointments(rows);

        let has_more = (offset + limit) < total;

        Ok(AppointmentListResponse {
            appointments,
            total,
            has_more,
        })
    }

    pub async fn get_appointment_by_id(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<AppointmentDetail, String> {
        let appointment = Self::get_appointment_simple(db, id).await?;

        // Fetch patient info using raw SQL for the joined fields
        let patient_row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT p.id, p.name, s.name as species, b.name as breed
                 FROM patients p
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 WHERE p.id = ?",
                [appointment.patient_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        let patient = patient_row.map(|row| PatientInfo {
            id: row.try_get("", "id").unwrap_or(0),
            name: row.try_get("", "name").unwrap_or_default(),
            species: row.try_get("", "species").ok(),
            breed: row.try_get("", "breed").ok(),
        });

        // Fetch room info if applicable
        let room = if let Some(room_id) = appointment.room_id {
            RoomEntity::find_by_id(room_id)
                .one(db)
                .await
                .map_err(|e| format!("Failed to fetch room: {}", e))?
                .map(|r| Room {
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    capacity: r.capacity,
                    color: r.color,
                    is_active: r.is_active,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
        } else {
            None
        };

        let (google_sync_state, google_synced_at) = Self::google_state(db, id).await?;

        Ok(AppointmentDetail {
            appointment,
            patient,
            room,
            google_sync_state,
            google_synced_at,
        })
    }

    pub async fn create_appointment(
        db: &DatabaseConnection,
        input: CreateAppointmentInput,
        created_by: String,
    ) -> Result<Appointment, String> {
        // Validate input
        input.validate()?;

        Self::refuse_deceased(db, input.patient_id).await?;

        let now = Utc::now();

        // Insert appointment using SeaORM
        let new_appointment = appointment::ActiveModel {
            patient_id: Set(input.patient_id),
            title: Set(input.title),
            description: Set(input.description),
            start_time: Set(input.start_time),
            end_time: Set(input.end_time),
            room_id: Set(input.room_id),
            status: Set("scheduled".to_string()),
            created_by: Set(created_by),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
            ..Default::default()
        };

        let result = AppointmentEntity::insert(new_appointment)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create appointment: {}", e))?;

        Self::get_appointment_simple(db, result.last_insert_id).await
    }

    pub async fn update_appointment(
        db: &DatabaseConnection,
        id: i64,
        input: UpdateAppointmentInput,
        _updated_by: String,
    ) -> Result<Appointment, String> {
        // Validate input
        input.validate()?;

        // Check if appointment exists and is not deleted
        let existing = AppointmentEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch appointment: {}", e))?
            .ok_or_else(|| "Appointment not found".to_string())?;

        if existing.deleted_at.is_some() {
            return Err("Cannot update deleted appointment".to_string());
        }

        if input.patient_id.is_none() && input.title.is_none() && input.description.is_none()
            && input.start_time.is_none() && input.end_time.is_none()
            && matches!(input.room_id, MaybeNull::Undefined) && input.status.is_none()
            && input.medical_record_id.is_none() {
            return Self::get_appointment_simple(db, id).await;
        }

        if let Some(patient_id) = input.patient_id {
            if patient_id != existing.patient_id {
                Self::refuse_deceased(db, patient_id).await?;
            }
        }

        let now = Utc::now();
        let was_checked_in_at = existing.checked_in_at;
        let mut model: appointment::ActiveModel = existing.into();

        if let Some(patient_id) = input.patient_id {
            model.patient_id = Set(patient_id);
        }
        if let Some(title) = input.title {
            model.title = Set(title);
        }
        if let Some(description) = input.description {
            model.description = Set(Some(description));
        }
        if let Some(start_time) = input.start_time {
            model.start_time = Set(start_time);
        }
        if let Some(end_time) = input.end_time {
            model.end_time = Set(end_time);
        }
        match input.room_id {
            MaybeNull::Value(room_id) => model.room_id = Set(Some(room_id)),
            MaybeNull::Null => model.room_id = Set(None),
            MaybeNull::Undefined => {}
        }
        if let Some(status) = input.status {
            let (stored, checked_in_at, no_show_at) = Self::stored_status(&status, was_checked_in_at, now);
            model.status = Set(stored.to_string());
            model.checked_in_at = Set(checked_in_at);
            model.no_show_at = Set(no_show_at);
        }
        if let Some(record_id) = input.medical_record_id {
            model.medical_record_id = Set(Some(record_id));
        }
        model.updated_at = Set(now);

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update appointment: {}", e))?;

        Self::get_appointment_simple(db, id).await
    }

    /// How a status is stored: the status column keeps its four original
    /// values (its CHECK predates the arrival statuses), so a check-in is
    /// `scheduled` + arrival time and a no-show is `cancelled` + `no_show_at`.
    /// A repeated check-in keeps the first arrival time.
    fn stored_status(
        status: &AppointmentStatus,
        checked_in_at: Option<DateTime<Utc>>,
        now: DateTime<Utc>,
    ) -> (&'static str, Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
        match status {
            AppointmentStatus::Scheduled => ("scheduled", None, None),
            AppointmentStatus::CheckedIn => ("scheduled", checked_in_at.or(Some(now)), None),
            AppointmentStatus::InProgress => ("in_progress", checked_in_at, None),
            AppointmentStatus::Completed => ("completed", checked_in_at, None),
            AppointmentStatus::Cancelled => ("cancelled", checked_in_at, None),
            AppointmentStatus::NoShow => ("cancelled", None, Some(now)),
        }
    }

    async fn refuse_deceased(db: &DatabaseConnection, patient_id: i64) -> Result<(), String> {
        let deceased = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT deceased_at FROM patients WHERE id = ? AND deceased_at IS NOT NULL",
                [patient_id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to check the patient: {}", e))?;
        if deceased.is_some() {
            return Err("PATIENT_DECEASED: a deceased patient can't be booked".to_string());
        }
        Ok(())
    }

    /// `off` (sync not on), `reconnect` (Google refused the login), `synced`
    /// (the event exists) or `not_synced`; plus when it was last pushed.
    async fn google_state(db: &DatabaseConnection, id: i64) -> Result<(String, Option<String>), String> {
        let settings = db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT sync_enabled, needs_reauth FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
            ))
            .await
            .map_err(|e| format!("Failed to read the Google settings: {}", e))?;
        let (enabled, needs_reauth) = settings
            .map(|row| {
                (
                    row.try_get::<bool>("", "sync_enabled").unwrap_or(false),
                    row.try_get::<bool>("", "needs_reauth").unwrap_or(false),
                )
            })
            .unwrap_or((false, false));
        if !enabled {
            return Ok(("off".to_string(), None));
        }

        let mapping = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT last_synced_at FROM calendar_event_mappings WHERE appointment_id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the Google event: {}", e))?;
        let synced_at = mapping
            .as_ref()
            .and_then(|row| row.try_get::<Option<String>>("", "last_synced_at").ok().flatten());

        let state = if needs_reauth {
            "reconnect"
        } else if mapping.is_some() {
            "synced"
        } else {
            "not_synced"
        };
        Ok((state.to_string(), synced_at))
    }

    pub async fn delete_appointment(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<(), String> {
        // Check if appointment exists
        let existing = AppointmentEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch appointment: {}", e))?
            .ok_or_else(|| "Appointment not found".to_string())?;

        if existing.deleted_at.is_some() {
            return Err("Appointment is already deleted".to_string());
        }

        // Soft delete
        let now = Utc::now();
        let mut model: appointment::ActiveModel = existing.into();
        model.deleted_at = Set(Some(now));
        model.updated_at = Set(now);

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to delete appointment: {}", e))?;

        Ok(())
    }

    pub async fn check_conflicts(
        db: &DatabaseConnection,
        input: ConflictCheckInput,
    ) -> Result<ConflictCheckResponse, String> {
        let conflicts = Self::check_conflicts_internal(
            db,
            input.start_time,
            input.end_time,
            input.room_id,
            None,
            input.exclude_appointment_id,
        ).await?;

        let patient_conflicts = match input.patient_id {
            Some(patient_id) => Self::check_conflicts_internal(
                db,
                input.start_time,
                input.end_time,
                None,
                Some(patient_id),
                input.exclude_appointment_id,
            ).await?,
            None => Vec::new(),
        };

        Ok(ConflictCheckResponse {
            has_conflicts: !conflicts.is_empty(),
            conflicts,
            patient_conflicts,
        })
    }

    pub async fn duplicate_appointment(
        db: &DatabaseConnection,
        input: DuplicateAppointmentInput,
        created_by: String,
    ) -> Result<Appointment, String> {
        // Fetch original appointment
        let original = Self::get_appointment_simple(db, input.appointment_id).await?;
        if original.deleted_at.is_some() {
            return Err("Cannot duplicate deleted appointment".to_string());
        }

        let duration = original.end_time - original.start_time;
        let new_start = Self::duplicate_start(original.start_time, input.target_date, &chrono::Local)?;
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

        Self::create_appointment(db, create_input, created_by).await
    }

    /// The copy's start: the original's wall-clock time on `target_date`'s day,
    /// both read in `tz` (the clinic's local zone), so a copy neither lands a
    /// day early east of UTC nor moves an hour across a DST change.
    pub(crate) fn duplicate_start<Tz: chrono::TimeZone>(
        original_start: DateTime<Utc>,
        target_date: DateTime<Utc>,
        tz: &Tz,
    ) -> Result<DateTime<Utc>, String> {
        let day = target_date.with_timezone(tz).date_naive();
        let time = original_start.with_timezone(tz).time();
        let local = day.and_time(time);
        let start = match tz.from_local_datetime(&local) {
            chrono::LocalResult::Single(t) => t,
            chrono::LocalResult::Ambiguous(first, _) => first,
            // The clock skipped this time (spring forward): take the hour after.
            chrono::LocalResult::None => tz
                .from_local_datetime(&(local + chrono::Duration::hours(1)))
                .earliest()
                .ok_or_else(|| "Could not place the copy on that day".to_string())?,
        };
        Ok(start.with_timezone(&Utc))
    }

    // Internal helper to check conflicts
    async fn check_conflicts_internal(
        db: &DatabaseConnection,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        room_id: Option<i64>,
        patient_id: Option<i64>,
        exclude_id: Option<i64>,
    ) -> Result<Vec<Appointment>, String> {
        let mut sql = String::from(
            "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
             FROM appointments a
             LEFT JOIN patients p ON a.patient_id = p.id
             LEFT JOIN species s ON p.species_id = s.id
             LEFT JOIN breeds b ON p.breed_id = b.id
             WHERE a.deleted_at IS NULL
             AND a.status NOT IN ('cancelled', 'completed')"
        );

        let mut params: Vec<Value> = Vec::new();

        if let Some(room_id) = room_id {
            sql.push_str(" AND a.room_id = ?");
            params.push(room_id.into());
        }

        if let Some(patient_id) = patient_id {
            sql.push_str(" AND a.patient_id = ?");
            params.push(patient_id.into());
        }

        if let Some(exclude_id) = exclude_id {
            sql.push_str(" AND a.id != ?");
            params.push(exclude_id.into());
        }

        // Time overlap conditions
        let start_str = start_time.to_rfc3339();
        let end_str = end_time.to_rfc3339();

        sql.push_str(" AND ((a.start_time <= ? AND a.end_time > ?)");
        params.push(start_str.clone().into());
        params.push(start_str.clone().into());

        sql.push_str(" OR (a.start_time < ? AND a.end_time >= ?)");
        params.push(end_str.clone().into());
        params.push(end_str.clone().into());

        sql.push_str(" OR (a.start_time >= ? AND a.end_time <= ?))");
        params.push(start_str.into());
        params.push(end_str.into());

        let rows = db
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                &sql,
                params,
            ))
            .await
            .map_err(|e| format!("Failed to check conflicts: {}", e))?;

        Ok(Self::readable_appointments(rows))
    }

    /// The rows that can be read; one that can't is logged and counted, not
    /// silently dropped.
    fn readable_appointments(rows: Vec<sea_orm::QueryResult>) -> Vec<Appointment> {
        let total = rows.len();
        let appointments: Vec<Appointment> = rows
            .into_iter()
            .filter_map(|row| {
                Self::row_to_appointment(&row)
                    .map_err(|e| log::warn!("An appointment row can't be read and is left out: {}", e))
                    .ok()
            })
            .collect();
        if appointments.len() < total {
            log::warn!("{} of {} appointment rows left out", total - appointments.len(), total);
        }
        appointments
    }

    // Helper to fetch appointment by ID with patient info
    async fn get_appointment_simple(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<Appointment, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT a.*, p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
                 FROM appointments a
                 JOIN patients p ON a.patient_id = p.id
                 LEFT JOIN species s ON p.species_id = s.id
                 LEFT JOIN breeds b ON p.breed_id = b.id
                 WHERE a.id = ? AND a.deleted_at IS NULL",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to fetch appointment: {}", e))?
            .ok_or_else(|| "Appointment not found".to_string())?;

        Self::row_to_appointment(&row)
    }

    // Helper to convert a query row to an Appointment
    fn row_to_appointment(row: &QueryResult) -> Result<Appointment, String> {
        // Read status as String and parse to enum
        let status_str: String = row.try_get("", "status").map_err(|e| e.to_string())?;
        let checked_in_at: Option<DateTime<Utc>> = row.try_get("", "checked_in_at").ok().flatten();
        let no_show_at: Option<DateTime<Utc>> = row.try_get("", "no_show_at").ok().flatten();
        let status = match status_str.as_str() {
            "scheduled" if checked_in_at.is_some() => AppointmentStatus::CheckedIn,
            "scheduled" => AppointmentStatus::Scheduled,
            "in_progress" => AppointmentStatus::InProgress,
            "completed" => AppointmentStatus::Completed,
            "cancelled" if no_show_at.is_some() => AppointmentStatus::NoShow,
            "cancelled" => AppointmentStatus::Cancelled,
            _ => AppointmentStatus::Scheduled, // Default fallback
        };

        Ok(Appointment {
            id: row.try_get("", "id").map_err(|e| e.to_string())?,
            patient_id: row.try_get("", "patient_id").map_err(|e| e.to_string())?,
            title: row.try_get("", "title").map_err(|e| e.to_string())?,
            description: row.try_get("", "description").ok(),
            start_time: row.try_get("", "start_time").map_err(|e| e.to_string())?,
            end_time: row.try_get("", "end_time").map_err(|e| e.to_string())?,
            room_id: row.try_get("", "room_id").ok(),
            status,
            created_at: row.try_get("", "created_at").map_err(|e| e.to_string())?,
            updated_at: row.try_get("", "updated_at").map_err(|e| e.to_string())?,
            deleted_at: row.try_get("", "deleted_at").ok(),
            created_by: row.try_get("", "created_by").unwrap_or_default(),
            patient_name: row.try_get("", "patient_name").ok(),
            species: row.try_get("", "species").ok(),
            breed: row.try_get("", "breed").ok(),
            microchip_id: row.try_get("", "microchip_id").ok(),
            checked_in_at,
            medical_record_id: row.try_get("", "medical_record_id").ok().flatten(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::*;
    use crate::models::{AppointmentStatus, AppointmentFilter};
    use chrono::Duration;

    // Helper to create a valid appointment input
    fn valid_appointment_input(patient_id: i64, room_id: Option<i64>) -> CreateAppointmentInput {
        CreateAppointmentInput {
            patient_id,
            title: "Checkup".to_string(),
            description: Some("Regular checkup".to_string()),
            start_time: test_time_slot(10, 0), // 10:00
            end_time: test_time_slot(10, 2),   // 10:30
            room_id,
        }
    }

    // ==================== CREATE TESTS ====================

    #[tokio::test]
    async fn test_create_appointment_success() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        let input = valid_appointment_input(patient_id, Some(room_id));
        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;

        assert!(result.is_ok(), "Should create appointment successfully");
        let appointment = result.unwrap();
        assert_eq!(appointment.title, "Checkup");
        assert_eq!(appointment.patient_id, patient_id);
        assert_eq!(appointment.room_id, Some(room_id));
        assert_eq!(appointment.status, AppointmentStatus::Scheduled);
    }

    #[tokio::test]
    async fn test_create_appointment_without_room() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Cat").await;
        let patient_id = create_test_patient(&db, "Bella", species_id, None).await;

        let input = valid_appointment_input(patient_id, None);
        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;

        assert!(result.is_ok(), "Should create appointment without room");
        let appointment = result.unwrap();
        assert!(appointment.room_id.is_none());
    }

    #[tokio::test]
    async fn test_create_appointment_validation_error() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Title too long (> 200 chars)
        let input = CreateAppointmentInput {
            patient_id,
            title: "A".repeat(201),
            description: None,
            start_time: test_time_slot(10, 0),
            end_time: test_time_slot(10, 2),
            room_id: None,
        };

        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_err(), "Should fail validation for long title");
        assert!(result.unwrap_err().contains("200 characters"));
    }

    #[tokio::test]
    async fn test_create_appointment_invalid_time_interval() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Not on 15-minute boundary (10:07)
        let input = CreateAppointmentInput {
            patient_id,
            title: "Checkup".to_string(),
            description: None,
            start_time: test_time(10, 7),
            end_time: test_time(10, 37),
            room_id: None,
        };

        let result = AppointmentService::create_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_err(), "Should fail for non-15-minute interval");
    }

    // ==================== GET TESTS ====================

    #[tokio::test]
    async fn test_get_appointments_empty() {
        let db = create_test_db().await;

        let filter = AppointmentFilter::default();
        let result = AppointmentService::get_appointments(&db, filter, 20, 0).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.appointments.len(), 0);
        assert_eq!(response.total, 0);
        assert!(!response.has_more);
    }

    #[tokio::test]
    async fn test_get_appointments_returns_created() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Create an appointment
        let input = valid_appointment_input(patient_id, None);
        AppointmentService::create_appointment(&db, input, "test_user".to_string())
            .await
            .expect("Failed to create appointment");

        // Fetch appointments
        let filter = AppointmentFilter::default();
        let result = AppointmentService::get_appointments(&db, filter, 20, 0).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.appointments.len(), 1);
        assert_eq!(response.total, 1);
        assert_eq!(response.appointments[0].title, "Checkup");
    }

    #[tokio::test]
    async fn test_get_appointments_with_patient_filter() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient1_id = create_test_patient(&db, "Max", species_id, None).await;
        let patient2_id = create_test_patient(&db, "Bella", species_id, None).await;

        // Create appointments for both patients
        AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient1_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        AppointmentService::create_appointment(
            &db,
            CreateAppointmentInput {
                patient_id: patient2_id,
                title: "Vaccination".to_string(),
                description: None,
                start_time: test_time_slot(11, 0),
                end_time: test_time_slot(11, 2),
                room_id: None,
            },
            "test_user".to_string(),
        ).await.unwrap();

        // Filter by patient1
        let filter = AppointmentFilter {
            patient_id: Some(patient1_id),
            ..Default::default()
        };
        let result = AppointmentService::get_appointments(&db, filter, 20, 0).await.unwrap();

        assert_eq!(result.appointments.len(), 1);
        assert_eq!(result.appointments[0].patient_id, patient1_id);
    }

    #[tokio::test]
    async fn test_get_appointments_with_room_filter() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room1_id = create_test_room(&db, "Exam Room 1").await;
        let room2_id = create_test_room(&db, "Exam Room 2").await;

        // Create appointments in different rooms
        AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room1_id)),
            "test_user".to_string(),
        ).await.unwrap();

        AppointmentService::create_appointment(
            &db,
            CreateAppointmentInput {
                patient_id,
                title: "Surgery".to_string(),
                description: None,
                start_time: test_time_slot(14, 0),
                end_time: test_time_slot(15, 0),
                room_id: Some(room2_id),
            },
            "test_user".to_string(),
        ).await.unwrap();

        // Filter by room1
        let filter = AppointmentFilter {
            room_id: Some(room1_id),
            ..Default::default()
        };
        let result = AppointmentService::get_appointments(&db, filter, 20, 0).await.unwrap();

        assert_eq!(result.appointments.len(), 1);
        assert_eq!(result.appointments[0].room_id, Some(room1_id));
    }

    #[tokio::test]
    async fn test_get_appointments_pagination() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        // Create 5 appointments
        for i in 0..5 {
            AppointmentService::create_appointment(
                &db,
                CreateAppointmentInput {
                    patient_id,
                    title: format!("Appointment {}", i),
                    description: None,
                    start_time: test_time_slot(9 + i as u32, 0),
                    end_time: test_time_slot(9 + i as u32, 2),
                    room_id: None,
                },
                "test_user".to_string(),
            ).await.unwrap();
        }

        // Get first page (2 items)
        let filter = AppointmentFilter::default();
        let page1 = AppointmentService::get_appointments(&db, filter.clone(), 2, 0).await.unwrap();
        assert_eq!(page1.appointments.len(), 2);
        assert_eq!(page1.total, 5);
        assert!(page1.has_more);

        // Get second page
        let page2 = AppointmentService::get_appointments(&db, filter.clone(), 2, 2).await.unwrap();
        assert_eq!(page2.appointments.len(), 2);
        assert!(page2.has_more);

        // Get third page (only 1 left)
        let page3 = AppointmentService::get_appointments(&db, filter, 2, 4).await.unwrap();
        assert_eq!(page3.appointments.len(), 1);
        assert!(!page3.has_more);
    }

    // ==================== UPDATE TESTS ====================

    #[tokio::test]
    async fn test_update_appointment_success() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        let update_input = UpdateAppointmentInput {
            title: Some("Updated Title".to_string()),
            description: Some("Updated description".to_string()),
            start_time: None,
            end_time: None,
            room_id: MaybeNull::Undefined,
            status: None,
            ..Default::default()
        };

        let result = AppointmentService::update_appointment(
            &db,
            created.id,
            update_input,
            "test_user".to_string(),
        ).await;

        assert!(result.is_ok());
        let updated = result.unwrap();
        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.description, Some("Updated description".to_string()));
    }

    #[tokio::test]
    async fn test_update_appointment_status() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        let update_input = UpdateAppointmentInput {
            title: None,
            description: None,
            start_time: None,
            end_time: None,
            room_id: MaybeNull::Undefined,
            status: Some(AppointmentStatus::InProgress),
            ..Default::default()
        };

        let updated = AppointmentService::update_appointment(
            &db,
            created.id,
            update_input,
            "test_user".to_string(),
        ).await.unwrap();

        assert_eq!(updated.status, AppointmentStatus::InProgress);
    }

    #[tokio::test]
    async fn test_update_appointment_not_found() {
        let db = create_test_db().await;

        let update_input = UpdateAppointmentInput {
            title: Some("Updated".to_string()),
            ..Default::default()
        };

        let result = AppointmentService::update_appointment(
            &db,
            99999,
            update_input,
            "test_user".to_string(),
        ).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    // ==================== DELETE TESTS ====================

    #[tokio::test]
    async fn test_delete_appointment_soft_delete() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        // Delete it
        let result = AppointmentService::delete_appointment(&db, created.id).await;
        assert!(result.is_ok());

        // Should not appear in normal queries
        let filter = AppointmentFilter::default();
        let appointments = AppointmentService::get_appointments(&db, filter, 20, 0).await.unwrap();
        assert_eq!(appointments.appointments.len(), 0);
    }

    #[tokio::test]
    async fn test_delete_appointment_include_deleted() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        AppointmentService::delete_appointment(&db, created.id).await.unwrap();

        // Should appear when include_deleted is true
        let filter = AppointmentFilter {
            include_deleted: true,
            include_cancelled: Some(true),
            ..Default::default()
        };
        let appointments = AppointmentService::get_appointments(&db, filter, 20, 0).await.unwrap();
        assert_eq!(appointments.appointments.len(), 1);
        assert!(appointments.appointments[0].deleted_at.is_some());
    }

    #[tokio::test]
    async fn test_delete_appointment_not_found() {
        let db = create_test_db().await;

        let result = AppointmentService::delete_appointment(&db, 99999).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_delete_appointment_already_deleted() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        // Delete once
        AppointmentService::delete_appointment(&db, created.id).await.unwrap();

        // Try to delete again
        let result = AppointmentService::delete_appointment(&db, created.id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already deleted"));
    }

    // ==================== CONFLICT TESTS ====================

    #[tokio::test]
    async fn test_check_conflicts_no_conflict() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        // Create appointment 10:00-10:30
        AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room_id)),
            "test_user".to_string(),
        ).await.unwrap();

        // Check for conflict at 11:00-11:30 (no overlap)
        let input = ConflictCheckInput {
            start_time: test_time_slot(11, 0),
            end_time: test_time_slot(11, 2),
            room_id: Some(room_id),
            exclude_appointment_id: None,
            patient_id: None,
        };

        let result = AppointmentService::check_conflicts(&db, input).await.unwrap();
        assert!(!result.has_conflicts);
        assert!(result.conflicts.is_empty());
    }

    #[tokio::test]
    async fn test_check_conflicts_with_overlap() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        // Create appointment 10:00-10:30
        AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room_id)),
            "test_user".to_string(),
        ).await.unwrap();

        // Check for conflict at 10:15-10:45 (overlaps)
        let input = ConflictCheckInput {
            start_time: test_time_slot(10, 1), // 10:15
            end_time: test_time_slot(10, 3),   // 10:45
            room_id: Some(room_id),
            exclude_appointment_id: None,
            patient_id: None,
        };

        let result = AppointmentService::check_conflicts(&db, input).await.unwrap();
        assert!(result.has_conflicts);
        assert_eq!(result.conflicts.len(), 1);
    }

    #[tokio::test]
    async fn test_check_conflicts_different_room() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room1_id = create_test_room(&db, "Exam Room 1").await;
        let room2_id = create_test_room(&db, "Exam Room 2").await;

        // Create appointment in room 1
        AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room1_id)),
            "test_user".to_string(),
        ).await.unwrap();

        // Check for conflict at same time but room 2
        let input = ConflictCheckInput {
            start_time: test_time_slot(10, 0),
            end_time: test_time_slot(10, 2),
            room_id: Some(room2_id),
            exclude_appointment_id: None,
            patient_id: None,
        };

        let result = AppointmentService::check_conflicts(&db, input).await.unwrap();
        assert!(!result.has_conflicts, "Different rooms should not conflict");
    }

    #[tokio::test]
    async fn test_check_conflicts_exclude_self() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        // Create appointment
        let created = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room_id)),
            "test_user".to_string(),
        ).await.unwrap();

        // Check same time but exclude self (for updates)
        let input = ConflictCheckInput {
            start_time: test_time_slot(10, 0),
            end_time: test_time_slot(10, 2),
            room_id: Some(room_id),
            exclude_appointment_id: Some(created.id),
            patient_id: None,
        };

        let result = AppointmentService::check_conflicts(&db, input).await.unwrap();
        assert!(!result.has_conflicts, "Should not conflict with itself");
    }

    // ==================== DUPLICATE TESTS ====================

    #[tokio::test]
    async fn test_duplicate_appointment_success() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;
        let room_id = create_test_room(&db, "Exam Room 1").await;

        let original = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, Some(room_id)),
            "test_user".to_string(),
        ).await.unwrap();

        // Duplicate to next day
        let target_date = test_time_slot(10, 0) + Duration::days(1);
        let input = DuplicateAppointmentInput {
            appointment_id: original.id,
            target_date,
        };

        let result = AppointmentService::duplicate_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_ok());

        let duplicated = result.unwrap();
        assert_eq!(duplicated.title, original.title);
        assert_eq!(duplicated.patient_id, original.patient_id);
        assert_eq!(duplicated.room_id, original.room_id);
        assert_ne!(duplicated.id, original.id);
        // Should be same time of day but different date
        assert_eq!(duplicated.start_time.time(), original.start_time.time());
    }

    #[test]
    fn duplicate_keeps_local_time_on_the_chosen_local_day_east_of_utc() {
        use chrono::{FixedOffset, TimeZone};
        let skopje_summer = FixedOffset::east_opt(2 * 3600).unwrap();
        // 09:30 local on 15 July
        let original = skopje_summer.with_ymd_and_hms(2024, 7, 15, 9, 30, 0).unwrap().with_timezone(&Utc);
        // The picker sends local midnight of 20 July, which is 19 July 22:00 UTC
        let target = skopje_summer.with_ymd_and_hms(2024, 7, 20, 0, 0, 0).unwrap().with_timezone(&Utc);

        let start = AppointmentService::duplicate_start(original, target, &skopje_summer).unwrap();

        assert_eq!(start, skopje_summer.with_ymd_and_hms(2024, 7, 20, 9, 30, 0).unwrap().with_timezone(&Utc));
    }

    #[test]
    fn duplicate_keeps_local_time_west_of_utc_late_evening() {
        use chrono::{FixedOffset, TimeZone};
        let west = FixedOffset::west_opt(5 * 3600).unwrap();
        // 21:00 local is 02:00 UTC the next day
        let original = west.with_ymd_and_hms(2024, 3, 1, 21, 0, 0).unwrap().with_timezone(&Utc);
        let target = west.with_ymd_and_hms(2024, 3, 10, 0, 0, 0).unwrap().with_timezone(&Utc);

        let start = AppointmentService::duplicate_start(original, target, &west).unwrap();

        assert_eq!(start, west.with_ymd_and_hms(2024, 3, 10, 21, 0, 0).unwrap().with_timezone(&Utc));
    }

    #[tokio::test]
    async fn test_duplicate_deleted_appointment_fails() {
        let db = create_test_db().await;
        let species_id = create_test_species(&db, "Dog").await;
        let patient_id = create_test_patient(&db, "Max", species_id, None).await;

        let original = AppointmentService::create_appointment(
            &db,
            valid_appointment_input(patient_id, None),
            "test_user".to_string(),
        ).await.unwrap();

        // Delete it
        AppointmentService::delete_appointment(&db, original.id).await.unwrap();

        // Try to duplicate
        let input = DuplicateAppointmentInput {
            appointment_id: original.id,
            target_date: test_time_slot(10, 0) + Duration::days(1),
        };

        let result = AppointmentService::duplicate_appointment(&db, input, "test_user".to_string()).await;
        assert!(result.is_err());
        // get_appointment_simple excludes deleted, so returns "not found"
        let err = result.unwrap_err();
        assert!(err.contains("not found") || err.contains("deleted"), "Expected 'not found' or 'deleted', got: {}", err);
    }
}
