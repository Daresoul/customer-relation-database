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