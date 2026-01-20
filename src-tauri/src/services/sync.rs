use chrono::{DateTime, Utc};
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};
#[allow(unused_imports)]
use crate::models::{
    sync_log::{SyncLog, SyncLogCreate, SyncStatus, SyncDirection, SyncType},
    google_calendar::CalendarEventMapping,
    AppointmentStatus,
};
#[allow(unused_imports)]
use crate::services::google_calendar::GoogleCalendarService;

#[allow(dead_code)]
pub struct SyncService;

#[allow(dead_code)]
impl SyncService {
    pub async fn sync_appointments_to_calendar(
        db: &DatabaseConnection,
        access_token: String,
        calendar_id: String,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<SyncLog, String> {
        let sync_id = Self::create_sync_log(
            db,
            SyncDirection::ToGoogle,
            "appointments_to_calendar".to_string(),
        ).await?;

        let mut sync_count = 0;
        let mut error_count = 0;
        let mut errors: Vec<String> = Vec::new();

        // Get appointments in date range
        let rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"SELECT a.id, a.patient_id, a.title, a.description, a.start_time, a.end_time,
                      a.room_id, a.status, a.deleted_at, a.created_at, a.updated_at,
                      p.name as patient_name, s.name as species, b.name as breed, p.microchip_id
               FROM appointments a
               JOIN patients p ON a.patient_id = p.id
               LEFT JOIN species s ON p.species_id = s.id
               LEFT JOIN breeds b ON p.breed_id = b.id
               WHERE a.deleted_at IS NULL
               AND a.start_time >= ?
               AND a.end_time <= ?
               AND a.status != 'cancelled'
               ORDER BY a.start_time ASC
               LIMIT 1000"#,
            [start_date.to_rfc3339().into(), end_date.to_rfc3339().into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch appointments: {}", e))?;

        let google_service = GoogleCalendarService::new()
            .with_token(access_token);

        for row in rows {
            let appointment_id: i64 = row.try_get("", "id").unwrap_or(0);
            let patient_id: i64 = row.try_get("", "patient_id").unwrap_or(0);
            let title: String = row.try_get("", "title").unwrap_or_else(|_| String::new());
            let description: Option<String> = row.try_get("", "description").unwrap_or(None);
            let start_time_str: String = row.try_get("", "start_time").unwrap_or_else(|_| String::new());
            let end_time_str: String = row.try_get("", "end_time").unwrap_or_else(|_| String::new());
            let room_id: Option<i64> = row.try_get("", "room_id").unwrap_or(None);
            let status_str: String = row.try_get("", "status").unwrap_or_else(|_| "scheduled".to_string());
            let patient_name: String = row.try_get("", "patient_name").unwrap_or_else(|_| "Unknown".to_string());

            // Parse dates
            let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            // Parse status
            let status = match status_str.as_str() {
                "scheduled" => AppointmentStatus::Scheduled,
                "in_progress" => AppointmentStatus::InProgress,
                "completed" => AppointmentStatus::Completed,
                "cancelled" => AppointmentStatus::Cancelled,
                _ => AppointmentStatus::Scheduled,
            };

            // Skip cancelled appointments
            if matches!(status, AppointmentStatus::Cancelled) {
                continue;
            }

            // Build a minimal Appointment struct for the calendar service
            let appointment = crate::models::Appointment {
                id: appointment_id,
                patient_id,
                title,
                description,
                start_time,
                end_time,
                room_id,
                status,
                deleted_at: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                created_by: "system".to_string(),
                patient_name: Some(patient_name.clone()),
                species: row.try_get("", "species").unwrap_or(None),
                breed: row.try_get("", "breed").unwrap_or(None),
                microchip_id: row.try_get("", "microchip_id").unwrap_or(None),
            };

            // Check if already synced
            let existing_mapping = GoogleCalendarService::get_event_mapping(
                db,
                appointment_id,
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
                        db,
                        appointment_id,
                        event.id,
                        calendar_id.clone(),
                    ).await?;
                    sync_count += 1;
                }
                Err(e) => {
                    error_count += 1;
                    errors.push(format!("Appointment {}: {}", appointment_id, e));
                }
            }
        }

        // Update sync log
        Self::update_sync_log(
            db,
            sync_id,
            if error_count == 0 { SyncStatus::Success } else { SyncStatus::Partial },
            sync_count,
            error_count,
            if errors.is_empty() { None } else { Some(errors.join("; ")) },
        ).await?;

        Self::get_sync_log(db, sync_id).await
    }

    pub async fn sync_calendar_to_appointments(
        db: &DatabaseConnection,
        access_token: String,
        calendar_id: String,
        start_date: DateTime<Utc>,
        end_date: DateTime<Utc>,
    ) -> Result<SyncLog, String> {
        let sync_id = Self::create_sync_log(
            db,
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
            db,
            sync_id,
            SyncStatus::Success,
            sync_count,
            error_count,
            if errors.is_empty() { None } else { Some(errors.join("; ")) },
        ).await?;

        Self::get_sync_log(db, sync_id).await
    }

    pub async fn handle_appointment_deleted(
        db: &DatabaseConnection,
        appointment_id: i64,
        access_token: Option<String>,
    ) -> Result<(), String> {
        // Get event mapping if exists
        let mapping = GoogleCalendarService::get_event_mapping(db, appointment_id).await?;

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
            GoogleCalendarService::delete_event_mapping(db, appointment_id).await?;
        }

        Ok(())
    }

    pub async fn get_recent_sync_logs(
        db: &DatabaseConnection,
        limit: i64,
    ) -> Result<Vec<SyncLog>, String> {
        let rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT ?",
            [limit.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch sync logs: {}", e))?;

        let mut logs = Vec::new();
        for row in rows {
            logs.push(Self::row_to_sync_log(&row)?);
        }
        Ok(logs)
    }

    pub async fn get_last_sync_time(
        db: &DatabaseConnection,
        direction: SyncDirection,
    ) -> Result<Option<DateTime<Utc>>, String> {
        let row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT MAX(completed_at) as last_sync FROM sync_logs WHERE direction = ? AND status = 'success'",
            [direction.to_string().into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch last sync time: {}", e))?;

        match row {
            Some(r) => {
                let last_sync: Option<String> = r.try_get("", "last_sync").unwrap_or(None);
                Ok(last_sync.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))))
            }
            None => Ok(None)
        }
    }

    // Helper methods
    async fn create_sync_log(
        db: &DatabaseConnection,
        direction: SyncDirection,
        sync_type: String,
    ) -> Result<i64, String> {
        let result = db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO sync_logs (direction, sync_type, status, started_at) VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP)",
            [direction.to_string().into(), sync_type.into()]
        ))
        .await
        .map_err(|e| format!("Failed to create sync log: {}", e))?;

        Ok(result.last_insert_id() as i64)
    }

    async fn update_sync_log(
        db: &DatabaseConnection,
        sync_id: i64,
        status: SyncStatus,
        items_synced: i32,
        items_failed: i32,
        error_message: Option<String>,
    ) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE sync_logs SET status = ?, items_synced = ?, items_failed = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            [
                status.to_string().into(),
                items_synced.into(),
                items_failed.into(),
                sea_orm::Value::String(error_message.map(Box::new)),
                sync_id.into(),
            ]
        ))
        .await
        .map_err(|e| format!("Failed to update sync log: {}", e))?;

        Ok(())
    }

    async fn get_sync_log(
        db: &DatabaseConnection,
        sync_id: i64,
    ) -> Result<SyncLog, String> {
        let row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT * FROM sync_logs WHERE id = ?",
            [sync_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch sync log: {}", e))?
        .ok_or_else(|| "Sync log not found".to_string())?;

        Self::row_to_sync_log(&row)
    }

    async fn get_patient_name(
        db: &DatabaseConnection,
        patient_id: i64,
    ) -> Result<String, String> {
        let row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT name FROM patients WHERE id = ?",
            [patient_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch patient: {}", e))?;

        row.and_then(|r| r.try_get::<String>("", "name").ok())
            .ok_or_else(|| "Patient not found".to_string())
    }

    fn row_to_sync_log(row: &sea_orm::QueryResult) -> Result<SyncLog, String> {
        let direction_str: String = row.try_get("", "direction").unwrap_or_else(|_| "to_google".to_string());
        let sync_type_str: String = row.try_get("", "sync_type").unwrap_or_else(|_| "manual".to_string());
        let status_str: String = row.try_get("", "status").unwrap_or_else(|_| "success".to_string());

        let direction = match direction_str.as_str() {
            "to_google" => SyncDirection::ToGoogle,
            "from_google" => SyncDirection::FromGoogle,
            _ => SyncDirection::ToGoogle,
        };

        let sync_type = match sync_type_str.as_str() {
            "initial" => SyncType::Initial,
            "incremental" => SyncType::Incremental,
            "manual" => SyncType::Manual,
            _ => SyncType::Manual,
        };

        let status = match status_str.as_str() {
            "in_progress" => SyncStatus::InProgress,
            "success" => SyncStatus::Success,
            "failed" => SyncStatus::Failed,
            "partial" => SyncStatus::Partial,
            _ => SyncStatus::Success,
        };

        let started_at: DateTime<Utc> = row.try_get::<Option<String>>("", "started_at")
            .unwrap_or(None)
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let completed_at: Option<DateTime<Utc>> = row.try_get::<Option<String>>("", "completed_at")
            .unwrap_or(None)
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc));

        Ok(SyncLog {
            id: row.try_get("", "id").unwrap_or(0),
            direction,
            sync_type,
            status,
            started_at,
            completed_at,
            items_synced: row.try_get("", "items_synced").unwrap_or(0),
            items_failed: row.try_get("", "items_failed").unwrap_or(0),
            error_message: row.try_get("", "error_message").unwrap_or(None),
        })
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
