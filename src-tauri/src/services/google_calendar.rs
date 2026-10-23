use chrono::{DateTime, Utc};
use reqwest::Client;
use serde_json::json;
#[allow(unused_imports)]
use crate::models::{
    google_calendar::{GoogleCalendarEvent, GoogleCalendarSync, CalendarEventMapping},
    Appointment,
};
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};

#[allow(dead_code)]
pub struct GoogleCalendarService {
    client: Client,
    access_token: Option<String>,
}

#[allow(dead_code)]
impl GoogleCalendarService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            access_token: None,
        }
    }

    pub fn with_token(mut self, token: String) -> Self {
        self.access_token = Some(token);
        self
    }

    pub async fn sync_appointment_to_calendar(
        &self,
        appointment: &Appointment,
        calendar_id: &str,
        patient_name: String,
    ) -> Result<GoogleCalendarEvent, String> {
        let token = self.access_token.as_ref()
            .ok_or_else(|| "No access token provided".to_string())?;

        let event = self.appointment_to_calendar_event(appointment, patient_name);
        
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            calendar_id
        );

        let response = self.client
            .post(&url)
            .bearer_auth(token)
            .json(&event)
            .send()
            .await
            .map_err(|e| format!("Failed to create calendar event: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error {}: {}", status, text));
        }

        response.json::<GoogleCalendarEvent>()
            .await
            .map_err(|e| format!("Failed to parse calendar response: {}", e))
    }

    pub async fn update_calendar_event(
        &self,
        event_id: &str,
        appointment: &Appointment,
        calendar_id: &str,
        patient_name: String,
    ) -> Result<GoogleCalendarEvent, String> {
        let token = self.access_token.as_ref()
            .ok_or_else(|| "No access token provided".to_string())?;

        let event = self.appointment_to_calendar_event(appointment, patient_name);
        
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
            calendar_id, event_id
        );

        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&event)
            .send()
            .await
            .map_err(|e| format!("Failed to update calendar event: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error {}: {}", status, text));
        }

        response.json::<GoogleCalendarEvent>()
            .await
            .map_err(|e| format!("Failed to parse calendar response: {}", e))
    }

    pub async fn delete_calendar_event(
        &self,
        event_id: &str,
        calendar_id: &str,
    ) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or_else(|| "No access token provided".to_string())?;

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
            calendar_id, event_id
        );

        let response = self.client
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Failed to delete calendar event: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error {}: {}", status, text));
        }

        Ok(())
    }

    pub async fn get_calendar_events(
        &self,
        calendar_id: &str,
        time_min: DateTime<Utc>,
        time_max: DateTime<Utc>,
    ) -> Result<Vec<GoogleCalendarEvent>, String> {
        let token = self.access_token.as_ref()
            .ok_or_else(|| "No access token provided".to_string())?;

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            calendar_id
        );

        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .query(&[
                ("timeMin", &time_min.to_rfc3339()),
                ("timeMax", &time_max.to_rfc3339()),
                ("singleEvents", &"true".to_string()),
                ("orderBy", &"startTime".to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed to fetch calendar events: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar API error {}: {}", status, text));
        }

        let body: serde_json::Value = response.json()
            .await
            .map_err(|e| format!("Failed to parse calendar response: {}", e))?;

        let items = body["items"].as_array()
            .ok_or_else(|| "Invalid response format".to_string())?;

        items.iter()
            .map(|item| serde_json::from_value(item.clone())
                .map_err(|e| format!("Failed to parse event: {}", e)))
            .collect()
    }

    fn appointment_to_calendar_event(
        &self,
        appointment: &Appointment,
        patient_name: String,
    ) -> serde_json::Value {
        json!({
            "summary": appointment.title,
            "description": format!(
                "Patient: {}\n{}\nAppointment ID: {}",
                patient_name,
                appointment.description.as_deref().unwrap_or(""),
                appointment.id
            ),
            "start": {
                "dateTime": appointment.start_time.to_rfc3339(),
                "timeZone": "UTC"
            },
            "end": {
                "dateTime": appointment.end_time.to_rfc3339(),
                "timeZone": "UTC"
            },
            "extendedProperties": {
                "private": {
                    "appointmentId": appointment.id.to_string(),
                    "patientId": appointment.patient_id.to_string(),
                    "roomId": appointment.room_id.map(|id| id.to_string()).unwrap_or_default()
                }
            }
        })
    }

    pub async fn save_event_mapping(
        db: &DatabaseConnection,
        appointment_id: i64,
        event_id: String,
        calendar_id: String,
    ) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
            INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id)
            VALUES (?, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
                event_id = excluded.event_id,
                calendar_id = excluded.calendar_id,
                updated_at = CURRENT_TIMESTAMP
            "#,
            [appointment_id.into(), event_id.into(), calendar_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to save event mapping: {}", e))?;

        Ok(())
    }

    pub async fn get_event_mapping(
        db: &DatabaseConnection,
        appointment_id: i64,
    ) -> Result<Option<CalendarEventMapping>, String> {
        use chrono::{DateTime, Utc};

        let row = db.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, appointment_id, event_id, calendar_id, last_synced_at, created_at, updated_at FROM calendar_event_mappings WHERE appointment_id = ?",
            [appointment_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch event mapping: {}", e))?;

        match row {
            Some(r) => {
                let created_at: DateTime<Utc> = r.try_get::<Option<String>>("", "created_at")
                    .unwrap_or(None)
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now);

                let updated_at: DateTime<Utc> = r.try_get::<Option<String>>("", "updated_at")
                    .unwrap_or(None)
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(Utc::now);

                let last_synced_at: Option<DateTime<Utc>> = r.try_get::<Option<String>>("", "last_synced_at")
                    .unwrap_or(None)
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&Utc));

                Ok(Some(CalendarEventMapping {
                    id: r.try_get("", "id").unwrap_or(0),
                    appointment_id: r.try_get("", "appointment_id").unwrap_or(0),
                    event_id: r.try_get("", "event_id").unwrap_or_else(|_| String::new()),
                    calendar_id: r.try_get("", "calendar_id").unwrap_or_else(|_| String::new()),
                    last_synced_at,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None)
        }
    }

    pub async fn delete_event_mapping(
        db: &DatabaseConnection,
        appointment_id: i64,
    ) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM calendar_event_mappings WHERE appointment_id = ?",
            [appointment_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to delete event mapping: {}", e))?;

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct GoogleSyncStatus {
    pub connected: bool,
    pub needs_reauth: bool,
    pub calendar_id: Option<String>,
    pub sync_enabled: bool,
    pub last_sync: Option<String>,
    pub last_sync_error: Option<String>,
}

/// "Connected" means Google still accepts the stored login, not merely that a
/// token is stored.
pub async fn load_sync_status(db: &DatabaseConnection) -> Result<GoogleSyncStatus, String> {
    let row = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT access_token, calendar_id, sync_enabled, last_sync, needs_reauth, last_sync_error \
             FROM google_calendar_settings WHERE user_id = 'default'"
                .to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?;

    let Some(row) = row else {
        return Ok(GoogleSyncStatus {
            connected: false,
            needs_reauth: false,
            calendar_id: None,
            sync_enabled: false,
            last_sync: None,
            last_sync_error: None,
        });
    };

    let has_token = row.try_get::<Option<String>>("", "access_token").ok().flatten().is_some();
    let needs_reauth = row.try_get::<i64>("", "needs_reauth").unwrap_or(0) != 0;
    Ok(GoogleSyncStatus {
        connected: has_token && !needs_reauth,
        // A backup copy has no token but needs_reauth set: it shows Reconnect.
        needs_reauth,
        calendar_id: row.try_get::<Option<String>>("", "calendar_id").ok().flatten(),
        sync_enabled: row.try_get::<i64>("", "sync_enabled").unwrap_or(0) != 0,
        last_sync: row.try_get::<Option<String>>("", "last_sync").ok().flatten(),
        last_sync_error: row.try_get::<Option<String>>("", "last_sync_error").ok().flatten(),
    })
}

pub async fn mark_needs_reauth(db: &DatabaseConnection, reason: &str) -> Result<(), String> {
    log::warn!("Google Calendar login rejected, reconnect needed: {}", reason);
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET needs_reauth = 1, last_sync_error = ? WHERE user_id = 'default'",
        [reason.to_string().into()],
    ))
    .await
    .map_err(|e| format!("Failed to flag Google reconnect: {}", e))?;
    Ok(())
}

pub async fn clear_needs_reauth(db: &DatabaseConnection) -> Result<(), String> {
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET needs_reauth = 0, last_sync_error = NULL WHERE user_id = 'default'"
            .to_string(),
    ))
    .await
    .map_err(|e| format!("Failed to clear Google reconnect flag: {}", e))?;
    Ok(())
}

/// A failed sync keeps its message until a later sync succeeds.
pub async fn record_sync_outcome(db: &DatabaseConnection, error: Option<&str>) -> Result<(), String> {
    let statement = match error {
        Some(message) => Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE google_calendar_settings SET last_sync_error = ? WHERE user_id = 'default'",
            [message.to_string().into()],
        ),
        None => Statement::from_string(
            DbBackend::Sqlite,
            "UPDATE google_calendar_settings SET last_sync_error = NULL, last_sync = CURRENT_TIMESTAMP \
             WHERE user_id = 'default'"
                .to_string(),
        ),
    };
    db.execute(statement)
        .await
        .map_err(|e| format!("Failed to record sync outcome: {}", e))?;
    Ok(())
}

/// The calendar to sync, or None when sync is off or the login needs reconnecting
/// (retrying a rejected login every minute only fills the log).
pub async fn calendar_ready_for_sync(db: &DatabaseConnection) -> Result<Option<String>, String> {
    let row = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT calendar_id FROM google_calendar_settings \
             WHERE user_id = 'default' AND sync_enabled = 1 AND needs_reauth = 0"
                .to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to check sync settings: {}", e))?;
    Ok(row.and_then(|r| r.try_get::<Option<String>>("", "calendar_id").ok().flatten()))
}

/// IANA zone of this computer (the clinic's), for events and the created calendar.
pub fn local_time_zone() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "Europe/Skopje".to_string())
}