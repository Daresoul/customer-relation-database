use chrono::{DateTime, Utc};
use sqlx::{SqlitePool, Row};
#[allow(unused_imports)]
use crate::models::{
    sync_log::{SyncLog, SyncLogCreate, SyncStatus, SyncDirection},
    AppointmentFilter,
    google_calendar::CalendarEventMapping,
};
#[allow(unused_imports)]
use crate::services::{
    appointments::AppointmentService,
    google_calendar::GoogleCalendarService,
};

#[allow(dead_code)]
pub struct SyncService;

#[allow(dead_code)]
impl SyncService {
    pub async fn sync_appointments_to_calendar(
        pool: &SqlitePool,
        access_token: String,
        calendar_id: String,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<SyncLog, String> {
        let sync_id = Self::create_sync_log(
            pool,
            SyncDirection::ToGoogle,
            "appointments_to_calendar".to_string(),
        ).await?;

        let mut sync_count = 0;
        let mut error_count = 0;
        let mut errors: Vec<String> = Vec::new();

        // Get appointments in date range
        let filter = AppointmentFilter {
            start_date: Some(start_date),
            end_date: Some(end_date),
            include_deleted: false,
            ..Default::default()
        };

        let response = AppointmentService::get_appointments(
            pool,
            filter,
            1000, // Max appointments to sync
            0,
        ).await?;

        let google_service = GoogleCalendarService::new()
            .with_token(access_token);

        for appointment in response.appointments {
            // Skip cancelled appointments
            if matches!(appointment.status, crate::models::AppointmentStatus::Cancelled) {
                continue;
            }

            // Get patient name for calendar event
            let patient_name = Self::get_patient_name(pool, appointment.patient_id).await?;

            // Check if already synced
            let existing_mapping = GoogleCalendarService::get_event_mapping(
                pool,
                appointment.id,
            ).await?;

            let result = if let Some(mapping) = existing_mapping {
                // Update existing event
                google_service.update_calendar_event(
                    &mapping.event_id,
                    &appointment,
                    &calendar_id,
                    patient_name,
                ).await
            } else {
                // Create new event
                google_service.sync_appointment_to_calendar(
                    &appointment,
                    &calendar_id,
                    patient_name,
                ).await
            };

            match result {
                Ok(event) => {
                    // Save or update mapping
                    GoogleCalendarService::save_event_mapping(
                        pool,
                        appointment.id,
                        event.id,
                        calendar_id.clone(),
                    ).await?;
                    sync_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    errors.push(format!("Appointment {}: {}", appointment.id, e));
                }
            }
        }

        // Update sync log
        Self::update_sync_log(
            pool,
            sync_id,
            if error_count == 0 { SyncStatus::Success } else { SyncStatus::Partial },
            sync_count,
            error_count,
            if errors.is_empty() { None } else { Some(errors.join("; ")) },
        ).await?;

        Self::get_sync_log(pool, sync_id).await
    }

    pub async fn sync_calendar_to_appointments(
        pool: &SqlitePool,
        access_token: String,
        calendar_id: String,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<SyncLog, String> {
        let sync_id = Self::create_sync_log(
            pool,
            SyncDirection::FromGoogle,
            "calendar_to_appointments".to_string(),
        ).await?;

        let mut sync_count = 0;
        let error_count = 0;
        let errors: Vec<String> = Vec::new();

        let google_service = GoogleCalendarService::new()
            .with_token(access_token);

        // Get calendar events in date range
        let events = google_service.get_calendar_events(
            &calendar_id,
            start_date,
            end_date,
        ).await?;

        for event in events {
            // Check if event has appointment ID in extended properties
            if let Some(_appointment_id) = Self::extract_appointment_id(&event) {
                // This is an existing appointment, skip it
                continue;
            }

            // TODO: Implement logic to create appointments from calendar events
            // This would require UI to map calendar events to patients
            // For now, we'll just count them
            sync_count += 1;
        }

        // Update sync log
        Self::update_sync_log(
            pool,
            sync_id,
            SyncStatus::Success,
            sync_count,
            error_count,
            if errors.is_empty() { None } else { Some(errors.join("; ")) },
        ).await?;

        Self::get_sync_log(pool, sync_id).await
    }

    pub async fn handle_appointment_deleted(
        pool: &SqlitePool,
        appointment_id: i64,
        access_token: Option<String>,
    ) -> Result<(), String> {
        // Get event mapping if exists
        let mapping = GoogleCalendarService::get_event_mapping(pool, appointment_id).await?;

        if let Some(mapping) = mapping {
            if let Some(token) = access_token {
                let google_service = GoogleCalendarService::new()
                    .with_token(token);

                // Delete from Google Calendar
                google_service.delete_calendar_event(
                    &mapping.event_id,
                    &mapping.calendar_id,
                ).await?;
            }

            // Delete mapping
            GoogleCalendarService::delete_event_mapping(pool, appointment_id).await?;
        }

        Ok(())
    }

    pub async fn get_recent_sync_logs(
        pool: &SqlitePool,
        limit: i64,
    ) -> Result<Vec<SyncLog>, String> {
        sqlx::query_as::<_, SyncLog>(
            r#"
            SELECT * FROM sync_logs
            ORDER BY started_at DESC
            LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch sync logs: {}", e))
    }

    pub async fn get_last_sync_time(
        pool: &SqlitePool,
        direction: SyncDirection,
    ) -> Result<Option<DateTime<Utc>>, String> {
        let result = sqlx::query(
            r#"
            SELECT MAX(completed_at) as last_sync
            FROM sync_logs
            WHERE direction = ? AND status = 'success'
            "#
        )
        .bind(direction.to_string())
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch last sync time: {}", e))?;

        Ok(result.and_then(|row| row.try_get::<DateTime<Utc>, _>("last_sync").ok()))
    }

    // Helper methods
    async fn create_sync_log(
        pool: &SqlitePool,
        direction: SyncDirection,
        sync_type: String,
    ) -> Result<i64, String> {
        let result = sqlx::query(
            r#"
            INSERT INTO sync_logs (direction, sync_type, status, started_at)
            VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP)
            "#
        )
        .bind(direction.to_string())
        .bind(&sync_type)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create sync log: {}", e))?;

        Ok(result.last_insert_rowid())
    }

    async fn update_sync_log(
        pool: &SqlitePool,
        sync_id: i64,
        status: SyncStatus,
        items_synced: i32,
        items_failed: i32,
        error_message: Option<String>,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            UPDATE sync_logs
            SET status = ?,
                items_synced = ?,
                items_failed = ?,
                error_message = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            "#
        )
        .bind(status.to_string())
        .bind(items_synced)
        .bind(items_failed)
        .bind(&error_message)
        .bind(sync_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update sync log: {}", e))?;

        Ok(())
    }

    async fn get_sync_log(
        pool: &SqlitePool,
        sync_id: i64,
    ) -> Result<SyncLog, String> {
        sqlx::query_as::<_, SyncLog>(
            "SELECT * FROM sync_logs WHERE id = ?"
        )
        .bind(sync_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch sync log: {}", e))?
        .ok_or_else(|| "Sync log not found".to_string())
    }

    async fn get_patient_name(
        pool: &SqlitePool,
        patient_id: i64,
    ) -> Result<String, String> {
        let result = sqlx::query("SELECT name FROM patients WHERE id = ?")
            .bind(patient_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        result
            .and_then(|row| row.try_get::<String, _>("name").ok())
            .ok_or_else(|| "Patient not found".to_string())
    }

    fn extract_appointment_id(event: &crate::models::google_calendar::GoogleCalendarEvent) -> Option<i64> {
        event.extended_properties
            .as_ref()?
            .get("private")?
            .as_object()?
            .get("appointmentId")?
            .as_str()?
            .parse::<i64>()
            .ok()
    }
}