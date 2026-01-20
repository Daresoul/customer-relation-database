// T027-T029: Google Calendar Tauri commands
use crate::database::SeaOrmPool;
use crate::models::google_calendar::GoogleCalendarSettingsResponse;
#[allow(unused_imports)]
use crate::models::sync_log::{SyncLog, SyncDirection, SyncType, SyncStatus};
use crate::services::oauth::{OAuthFlowState, OAuthService};
#[allow(unused_imports)]
use chrono::Utc;
use tauri::State;
use sea_orm::*;

// ===== T027: OAuth Commands =====

#[tauri::command]
pub async fn start_oauth_flow() -> Result<OAuthFlowState, String> {
    OAuthService::start_oauth_flow().await
}

#[tauri::command]
pub async fn complete_oauth_flow(
    pool: State<'_, SeaOrmPool>,
    code: String,
    state: String,
) -> Result<GoogleCalendarSettingsResponse, String> {
    log::info!("complete_oauth_flow called");

    // Exchange code for tokens
    log::info!("Exchanging code for tokens...");
    let (access_token, refresh_token, expires_in) =
        OAuthService::exchange_code_for_tokens(code, state).await?;
    log::info!("Tokens received, expires_in: {}s", expires_in);

    // Calculate token expiration
    let token_expires_at = Utc::now() + chrono::Duration::seconds(expires_in);

    // Get user email from Google UserInfo API
    let user_email = get_user_email(&access_token).await?;

    // Create or find "Clinic Appointments" calendar
    let calendar_id = create_clinic_calendar(&access_token).await?;

    // Check if settings exist
    let existing = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to check settings: {}", e))?;

    if existing.is_some() {
        // Update existing settings
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE google_calendar_settings
             SET access_token = ?, refresh_token = ?, calendar_id = ?,
                 token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = 'default'",
            [
                access_token.clone().into(),
                refresh_token.into(),
                calendar_id.clone().into(),
                token_expires_at.to_rfc3339().into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    } else {
        // Insert new settings
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO google_calendar_settings
             (user_id, access_token, refresh_token, calendar_id, sync_enabled, token_expires_at)
             VALUES ('default', ?, ?, ?, 0, ?)",
            [
                access_token.clone().into(),
                refresh_token.into(),
                calendar_id.clone().into(),
                token_expires_at.to_rfc3339().into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to save settings: {}", e))?;
    }

    // Return response
    log::info!("OAuth flow completed successfully");
    Ok(GoogleCalendarSettingsResponse {
        connected: true,
        connected_email: Some(user_email),
        calendar_id: Some(calendar_id),
        sync_enabled: false,
        last_sync: None,
    })
}

#[tauri::command]
pub async fn cancel_oauth_flow() -> Result<(), String> {
    OAuthService::cancel_oauth_flow().await
}

#[tauri::command]
pub fn check_oauth_callback() -> Option<(String, String)> {
    let result = OAuthService::check_oauth_callback();
    if result.is_some() {
        log::debug!("check_oauth_callback command: returning callback data");
    }
    result
}

// ===== T028: Settings Commands =====

#[tauri::command]
pub async fn get_google_calendar_settings(
    pool: State<'_, SeaOrmPool>,
) -> Result<GoogleCalendarSettingsResponse, String> {
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT access_token, refresh_token, calendar_id, sync_enabled, last_sync, token_expires_at FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?;

    if let Some(row) = row {
        let access_token: Option<String> = row.try_get("", "access_token").ok();
        let calendar_id: Option<String> = row.try_get("", "calendar_id").ok();
        let sync_enabled: bool = row.try_get::<i32>("", "sync_enabled").map(|v| v != 0).unwrap_or(false);
        let last_sync: Option<String> = row.try_get("", "last_sync").ok();

        let connected = access_token.is_some();
        let connected_email = if connected {
            if let Some(ref token) = access_token {
                get_user_email(token).await.ok()
            } else {
                None
            }
        } else {
            None
        };

        Ok(GoogleCalendarSettingsResponse {
            connected,
            connected_email,
            calendar_id,
            sync_enabled,
            last_sync,
        })
    } else {
        // Return default not-connected state
        Ok(GoogleCalendarSettingsResponse {
            connected: false,
            connected_email: None,
            calendar_id: None,
            sync_enabled: false,
            last_sync: None,
        })
    }
}

#[tauri::command]
pub async fn update_sync_enabled(
    pool: State<'_, SeaOrmPool>,
    enabled: bool,
) -> Result<GoogleCalendarSettingsResponse, String> {
    // Check if connected
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT calendar_id FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?
        .ok_or("Google Calendar not connected")?;

    let calendar_id: Option<String> = row.try_get("", "calendar_id").ok();
    if calendar_id.is_none() {
        return Err("Google Calendar not connected".to_string());
    }

    // Update sync_enabled
    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET sync_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = 'default'",
        [enabled.into()],
    ))
    .await
    .map_err(|e| format!("Failed to update settings: {}", e))?;

    // TODO: If enabling, trigger initial sync

    // Fetch updated settings
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT access_token, calendar_id, sync_enabled, last_sync FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query updated settings: {}", e))?;

    if let Some(row) = row {
        let access_token: Option<String> = row.try_get("", "access_token").ok();
        let calendar_id: Option<String> = row.try_get("", "calendar_id").ok();
        let sync_enabled: bool = row.try_get::<i32>("", "sync_enabled").map(|v| v != 0).unwrap_or(false);
        let last_sync: Option<String> = row.try_get("", "last_sync").ok();

        let connected_email = if let Some(ref token) = access_token {
            get_user_email(token).await.ok()
        } else {
            None
        };

        Ok(GoogleCalendarSettingsResponse {
            connected: access_token.is_some(),
            connected_email,
            calendar_id,
            sync_enabled,
            last_sync,
        })
    } else {
        Err("Settings not found after update".to_string())
    }
}

#[tauri::command]
pub async fn disconnect_google_calendar(
    pool: State<'_, SeaOrmPool>,
) -> Result<(), String> {
    // Clear tokens
    pool.execute(Statement::from_string(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings
         SET access_token = NULL, refresh_token = NULL, sync_enabled = 0,
             token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = 'default'".to_string(),
    ))
    .await
    .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn revoke_google_access(
    pool: State<'_, SeaOrmPool>,
) -> Result<(), String> {
    // Get access token
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT access_token FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?;

    if let Some(row) = row {
        let access_token: Option<String> = row.try_get("", "access_token").ok();
        if let Some(token) = access_token {
            // Call Google revoke endpoint
            let client = reqwest::Client::new();
            let _ = client
                .post("https://oauth2.googleapis.com/revoke")
                .form(&[("token", token)])
                .send()
                .await;
            // Ignore errors - even if revoke fails, we'll clear local tokens
        }
    }

    // Clear tokens from database
    pool.execute(Statement::from_string(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings
         SET access_token = NULL, refresh_token = NULL, sync_enabled = 0,
             token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = 'default'".to_string(),
    ))
    .await
    .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

// ===== T029: Sync Commands =====

#[tauri::command]
pub async fn trigger_manual_sync(
    pool: State<'_, SeaOrmPool>,
) -> Result<SyncLog, String> {
    use crate::services::oauth::get_valid_access_token;

    // Check if connected
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT calendar_id, access_token, refresh_token, token_expires_at FROM google_calendar_settings WHERE user_id = 'default'".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?
        .ok_or("Google Calendar not connected")?;

    let calendar_id: String = row.try_get("", "calendar_id")
        .map_err(|_| "No calendar ID configured".to_string())?;

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&pool).await?;

    // Create sync log
    let result = pool.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO sync_logs (direction, sync_type, status, started_at) VALUES ('to_google', 'manual', 'in_progress', CURRENT_TIMESTAMP)".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to create sync log: {}", e))?;

    let sync_log_id = result.last_insert_id() as i64;

    // Get all future appointments with patient and room info
    let appointments = pool.query_all(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT
            a.id, a.title, a.description, a.start_time, a.end_time,
            p.name as patient_name, p.microchip_id, r.name as room_name, a.status
         FROM appointments a
         LEFT JOIN patients p ON a.patient_id = p.id
         LEFT JOIN rooms r ON a.room_id = r.id
         WHERE a.deleted_at IS NULL
         AND a.status != 'cancelled'
         AND datetime(a.start_time) >= datetime('now')
         ORDER BY a.start_time".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to fetch appointments: {}", e))?;

    log::info!("Found {} future appointments to sync", appointments.len());

    let mut items_synced = 0;
    let mut items_failed = 0;
    let client = reqwest::Client::new();

    for row in appointments {
        let appt_id: i64 = row.try_get("", "id").unwrap_or(0);
        let title: String = row.try_get("", "title").unwrap_or_default();
        let description: Option<String> = row.try_get("", "description").ok();
        let start_time: String = row.try_get("", "start_time").unwrap_or_default();
        let end_time: String = row.try_get("", "end_time").unwrap_or_default();
        let patient_name: Option<String> = row.try_get("", "patient_name").ok();
        let microchip_id: Option<String> = row.try_get("", "microchip_id").ok();
        let room_name: Option<String> = row.try_get("", "room_name").ok();
        let status: String = row.try_get("", "status").unwrap_or_default();

        // Check if already synced
        let existing = pool.query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT event_id FROM calendar_event_mappings WHERE appointment_id = ?",
            [appt_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to check mapping: {}", e))?;

        if existing.is_some() {
            log::debug!("Appointment {} already synced, skipping", appt_id);
            continue;
        }

        // Format event summary and description
        let patient_display = patient_name.as_deref().unwrap_or("Unknown Patient");
        let event_summary = format!("{} - {}", title, patient_display);

        let mut desc_parts = Vec::new();
        desc_parts.push(format!("Patient: {}", patient_display));
        desc_parts.push(format!("Microchip ID: {}", microchip_id.as_deref().unwrap_or("-")));

        if let Some(room) = room_name {
            desc_parts.push(format!("Room: {}", room));
        }

        desc_parts.push(format!("Status: {}", status));

        if let Some(desc) = description {
            if !desc.is_empty() {
                desc_parts.push(String::from(""));
                desc_parts.push(desc);
            }
        }

        let event_description = desc_parts.join("\n");

        // Create event in Google Calendar
        let event_body = serde_json::json!({
            "summary": event_summary,
            "description": event_description,
            "start": {
                "dateTime": start_time,
                "timeZone": "America/New_York"
            },
            "end": {
                "dateTime": end_time,
                "timeZone": "America/New_York"
            }
        });

        let response = client
            .post(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events", calendar_id))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&event_body)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<serde_json::Value>().await {
                    Ok(event) => {
                        if let Some(event_id) = event["id"].as_str() {
                            // Save mapping
                            let _ = pool.execute(Statement::from_sql_and_values(
                                DbBackend::Sqlite,
                                "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id, last_synced_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                                [appt_id.into(), event_id.to_string().into(), calendar_id.clone().into()]
                            ))
                            .await;

                            log::info!("Synced appointment {} to Google Calendar (event_id: {})", appt_id, event_id);
                            items_synced += 1;
                        } else {
                            log::error!("Failed to sync appointment {}: No event ID in response", appt_id);
                            items_failed += 1;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to parse event response for appointment {}: {}", appt_id, e);
                        items_failed += 1;
                    }
                }
            }
            Ok(resp) => {
                let error = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                log::error!("Failed to sync appointment {}: {}", appt_id, error);
                items_failed += 1;
            }
            Err(e) => {
                log::error!("Network error syncing appointment {}: {}", appt_id, e);
                items_failed += 1;
            }
        }
    }

    // Update sync log
    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE sync_logs SET status = 'success', items_synced = ?, items_failed = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [items_synced.into(), items_failed.into(), sync_log_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to update sync log: {}", e))?;

    // Update last_sync timestamp
    pool.execute(Statement::from_string(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET last_sync = CURRENT_TIMESTAMP WHERE user_id = 'default'".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to update last sync: {}", e))?;

    log::info!("Manual sync completed: {} synced, {} failed", items_synced, items_failed);

    // Fetch and return the sync log
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM sync_logs WHERE id = ?",
        [sync_log_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch sync log: {}", e))?
    .ok_or("Sync log not found")?;

    Ok(row_to_sync_log(&row)?)
}

#[tauri::command]
pub async fn get_sync_history(
    pool: State<'_, SeaOrmPool>,
    limit: i64,
) -> Result<Vec<SyncLog>, String> {
    let rows = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT ?",
        [limit.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch sync history: {}", e))?;

    let sync_logs: Result<Vec<SyncLog>, String> = rows.iter()
        .map(row_to_sync_log)
        .collect();

    sync_logs
}

#[tauri::command]
pub async fn check_sync_status(
    pool: State<'_, SeaOrmPool>,
) -> Result<Option<SyncLog>, String> {
    let row = pool.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT * FROM sync_logs WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to check sync status: {}", e))?;

    match row {
        Some(r) => Ok(Some(row_to_sync_log(&r)?)),
        None => Ok(None),
    }
}

// ===== Helper Functions =====

async fn get_user_email(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to get user info: {}", e))?;

    let user_info: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    user_info["email"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or("Email not found in user info".to_string())
}

async fn create_clinic_calendar(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    // First, check if calendar already exists
    log::info!("Checking for existing 'Clinic Appointments' calendar...");
    let list_response = client
        .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to list calendars: {}", e))?;

    let calendar_list: serde_json::Value = list_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse calendar list: {}", e))?;

    // Look for existing "Clinic Appointments" calendar
    if let Some(items) = calendar_list["items"].as_array() {
        log::debug!("Found {} existing calendars", items.len());
        for item in items {
            if item["summary"].as_str() == Some("Clinic Appointments") {
                if let Some(calendar_id) = item["id"].as_str() {
                    log::info!("Found existing 'Clinic Appointments' calendar: {}", calendar_id);
                    return Ok(calendar_id.to_string());
                }
            }
        }
    }

    // Calendar doesn't exist, create it
    log::info!("Creating 'Clinic Appointments' calendar...");
    let create_response = client
        .post("https://www.googleapis.com/calendar/v3/calendars")
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&serde_json::json!({
            "summary": "Clinic Appointments",
            "description": "Veterinary clinic appointments synced from desktop app",
            "timeZone": "America/New_York"
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create calendar: {}", e))?;

    let status = create_response.status();
    if !status.is_success() {
        let error_body = create_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Failed to create calendar. Status: {}. Error: {}", status, error_body));
    }

    let calendar: serde_json::Value = create_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse created calendar: {}", e))?;

    log::debug!("Calendar creation response: {:?}", calendar);

    calendar["id"]
        .as_str()
        .map(|s| {
            log::info!("Created calendar with ID: {}", s);
            s.to_string()
        })
        .ok_or_else(|| {
            log::error!("Calendar response missing 'id' field. Full response: {:?}", calendar);
            "Calendar ID not found in response".to_string()
        })
}

// Helper to convert SeaORM row to SyncLog
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
        "manual" => SyncType::Manual,
        "incremental" => SyncType::Incremental,
        "initial" => SyncType::Initial,
        _ => SyncType::Manual,
    };

    let status = match status_str.as_str() {
        "success" => SyncStatus::Success,
        "failed" => SyncStatus::Failed,
        "in_progress" => SyncStatus::InProgress,
        _ => SyncStatus::Success,
    };

    Ok(SyncLog {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        direction,
        sync_type,
        status,
        items_synced: row.try_get("", "items_synced").unwrap_or(0),
        items_failed: row.try_get("", "items_failed").unwrap_or(0),
        error_message: row.try_get("", "error_message").ok(),
        started_at: row.try_get("", "started_at").map_err(|e| format!("Failed to get started_at: {}", e))?,
        completed_at: row.try_get("", "completed_at").ok(),
    })
}
