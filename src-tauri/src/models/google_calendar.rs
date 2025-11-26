use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GoogleCalendarSettings {
    pub id: i64,
    pub user_id: String,
    #[serde(skip_serializing)] // Don't expose tokens to frontend
    pub access_token: Option<String>,
    #[serde(skip_serializing)] // Don't expose tokens to frontend
    pub refresh_token: Option<String>,
    pub calendar_id: Option<String>,
    pub sync_enabled: bool,
    pub last_sync: Option<DateTime<Utc>>,
    #[serde(skip_serializing)] // Don't expose token expiration to frontend
    pub token_expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarSettingsResponse {
    pub connected: bool,
    pub connected_email: Option<String>,
    pub calendar_id: Option<String>,
    pub sync_enabled: bool,
    pub last_sync: Option<String>,
}

impl From<GoogleCalendarSettings> for GoogleCalendarSettingsResponse {
    fn from(settings: GoogleCalendarSettings) -> Self {
        Self {
            connected: settings.access_token.is_some(),
            connected_email: None, // Must be fetched separately from UserInfo API
            calendar_id: settings.calendar_id,
            sync_enabled: settings.sync_enabled,
            last_sync: settings.last_sync.map(|dt| dt.to_rfc3339()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAuthRequest {
    pub auth_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateGoogleCalendarSettingsInput {
    pub sync_enabled: Option<bool>,
    pub calendar_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendar {
    pub id: String,
    pub summary: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarEvent {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub location: Option<String>,
    pub extended_properties: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventDateTime {
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    pub date: Option<String>,
    #[serde(rename = "timeZone")]
    pub time_zone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGoogleEventInput {
    pub appointment_id: i64,
    pub summary: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateGoogleEventInput {
    pub event_id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub location: Option<String>,
}

// OAuth2 related structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuth2Config {
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,
    pub token_url: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CalendarEventMapping {
    pub id: i64,
    pub appointment_id: i64,
    pub event_id: String,
    pub calendar_id: String,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEventMapping {
    pub appointment_id: i64,
    pub event_id: String,
    pub calendar_id: String,
}

impl CreateEventMapping {
    #[allow(dead_code)]
    pub fn validate(&self) -> Result<(), String> {
        if self.event_id.is_empty() {
            return Err("Event ID cannot be empty".to_string());
        }
        if self.calendar_id.is_empty() {
            return Err("Calendar ID cannot be empty".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateEventMapping {
    pub event_id: Option<String>,
    pub calendar_id: Option<String>,
    pub last_synced_at: Option<DateTime<Utc>>,
}

#[allow(dead_code)]
pub type GoogleCalendarSync = GoogleCalendarSettings;

impl GoogleCalendarSettings {
    #[allow(dead_code)]
    pub fn needs_refresh(&self) -> bool {
        // Check if we need to refresh the access token
        if let Some(expires_at) = self.token_expires_at {
            // Token expires soon (within 5 minutes) or already expired
            Utc::now() >= expires_at - chrono::Duration::minutes(5)
        } else if self.access_token.is_none() && self.refresh_token.is_some() {
            // No access token but have refresh token
            true
        } else {
            false
        }
    }

    #[allow(dead_code)]
    pub fn is_configured(&self) -> bool {
        self.access_token.is_some() && self.calendar_id.is_some()
    }
}