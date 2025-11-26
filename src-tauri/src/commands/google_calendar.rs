// T027-T029: Google Calendar Tauri commands
use crate::database::DatabasePool;
use crate::models::google_calendar::{GoogleCalendarSettings, GoogleCalendarSettingsResponse};
#[allow(unused_imports)]
use crate::models::sync_log::{SyncLog, SyncDirection, SyncType, SyncStatus};
use crate::services::oauth::{OAuthFlowState, OAuthService};
#[allow(unused_imports)]
use chrono::Utc;
use tauri::State;

// ===== T027: OAuth Commands =====

#[tauri::command]
pub async fn start_oauth_flow() -> Result<OAuthFlowState, String> {
    OAuthService::start_oauth_flow().await
}

#[tauri::command]
pub async fn complete_oauth_flow(
    pool: State<'_, DatabasePool>,
    code: String,
    state: String,
) -> Result<GoogleCalendarSettingsResponse, String> {
    println!("complete_oauth_flow called");

    // Exchange code for tokens
    println!("Exchanging code for tokens...");
    let (access_token, refresh_token, expires_in) =
        OAuthService::exchange_code_for_tokens(code, state).await?;
    println!("✓ Tokens received, expires_in: {}s", expires_in);

    // Calculate token expiration
    let token_expires_at = Utc::now() + chrono::Duration::seconds(expires_in);

    // Get user email from Google UserInfo API
    let user_email = get_user_email(&access_token).await?;

    // Create or find "Clinic Appointments" calendar
    let calendar_id = create_clinic_calendar(&access_token).await?;

    // Save settings to database
    let pool = pool.lock().await;

    // Check if settings exist
    let existing: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check settings: {}", e))?;

    if let Some(_) = existing {
        // Update existing settings
        sqlx::query(
            "UPDATE google_calendar_settings
             SET access_token = ?, refresh_token = ?, calendar_id = ?,
                 token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = 'default'"
        )
        .bind(&access_token)
        .bind(&refresh_token)
        .bind(&calendar_id)
        .bind(token_expires_at)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))?;
    } else {
        // Insert new settings
        sqlx::query(
            "INSERT INTO google_calendar_settings
             (user_id, access_token, refresh_token, calendar_id, sync_enabled, token_expires_at)
             VALUES ('default', ?, ?, ?, 0, ?)"
        )
        .bind(&access_token)
        .bind(&refresh_token)
        .bind(&calendar_id)
        .bind(token_expires_at)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to save settings: {}", e))?;
    }

    // Return response
    println!("✓ OAuth flow completed successfully");
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
        println!("check_oauth_callback command: returning callback data");
    }
    result
}

// ===== T028: Settings Commands =====

#[tauri::command]
pub async fn get_google_calendar_settings(
    pool: State<'_, DatabasePool>,
) -> Result<GoogleCalendarSettingsResponse, String> {
    let pool = pool.lock().await;

    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to query settings: {}", e))?;

    if let Some(settings) = settings {
        let connected = settings.access_token.is_some();
        let connected_email = if connected {
            // Try to get email from UserInfo API
            if let Some(ref token) = settings.access_token {
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
            calendar_id: settings.calendar_id,
            sync_enabled: settings.sync_enabled,
            last_sync: settings.last_sync.map(|dt| dt.to_rfc3339()),
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
    pool: State<'_, DatabasePool>,
    enabled: bool,
) -> Result<GoogleCalendarSettingsResponse, String> {
    let pool = pool.lock().await;

    // Check if connected
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to query settings: {}", e))?;

    let settings = settings.ok_or("Google Calendar not connected")?;

    if settings.calendar_id.is_none() {
        return Err("Google Calendar not connected".to_string());
    }

    // Update sync_enabled
    sqlx::query(
        "UPDATE google_calendar_settings SET sync_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = 'default'"
    )
    .bind(enabled)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to update settings: {}", e))?;

    // TODO: If enabling, trigger initial sync

    // Fetch updated settings
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to query updated settings: {}", e))?;

    if let Some(settings) = settings {
        let connected_email = if let Some(ref token) = settings.access_token {
            get_user_email(token).await.ok()
        } else {
            None
        };

        Ok(GoogleCalendarSettingsResponse {
            connected: settings.access_token.is_some(),
            connected_email,
            calendar_id: settings.calendar_id,
            sync_enabled: settings.sync_enabled,
            last_sync: settings.last_sync.map(|dt| dt.to_rfc3339()),
        })
    } else {
        Err("Settings not found after update".to_string())
    }
}

#[tauri::command]
pub async fn disconnect_google_calendar(
    pool: State<'_, DatabasePool>,
) -> Result<(), String> {
    let pool = pool.lock().await;

    // Clear tokens
    sqlx::query(
        "UPDATE google_calendar_settings
         SET access_token = NULL, refresh_token = NULL, sync_enabled = 0,
             token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = 'default'"
    )
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn revoke_google_access(
    pool: State<'_, DatabasePool>,
) -> Result<(), String> {
    let pool = pool.lock().await;

    // Get access token
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to query settings: {}", e))?;

    if let Some(settings) = settings {
        if let Some(token) = settings.access_token {
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
    sqlx::query(
        "UPDATE google_calendar_settings
         SET access_token = NULL, refresh_token = NULL, sync_enabled = 0,
             token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = 'default'"
    )
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to disconnect: {}", e))?;

    Ok(())
}

// ===== T029: Sync Commands =====

#[tauri::command]
pub async fn trigger_manual_sync(
    pool: State<'_, DatabasePool>,
) -> Result<SyncLog, String> {
    #[allow(unused_imports)]
    use crate::models::appointments::AppointmentStatus;
    use crate::services::oauth::get_valid_access_token;

    let pool_guard = pool.lock().await;

    // Check if connected
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default'"
    )
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to query settings: {}", e))?;

    let settings = settings.ok_or("Google Calendar not connected")?;

    let calendar_id = settings.calendar_id.ok_or("No calendar ID configured")?;

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&*pool_guard).await?;

    // Create sync log
    let result = sqlx::query(
        "INSERT INTO sync_logs (direction, sync_type, status, started_at)
         VALUES ('to_google', 'manual', 'in_progress', CURRENT_TIMESTAMP)"
    )
    .execute(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to create sync log: {}", e))?;

    let sync_log_id = result.last_insert_rowid();

    // Get all future appointments with patient and room info
    let appointments: Vec<(i64, String, Option<String>, String, String, Option<String>, Option<String>, Option<String>, String)> = sqlx::query_as(
        "SELECT
            a.id, a.title, a.description, a.start_time, a.end_time,
            p.name as patient_name, p.microchip_id, r.name as room_name, a.status
         FROM appointments a
         LEFT JOIN patients p ON a.patient_id = p.id
         LEFT JOIN rooms r ON a.room_id = r.id
         WHERE a.deleted_at IS NULL
         AND a.status != 'cancelled'
         AND datetime(a.start_time) >= datetime('now')
         ORDER BY a.start_time"
    )
    .fetch_all(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch appointments: {}", e))?;

    println!("Found {} future appointments to sync", appointments.len());

    let mut items_synced = 0;
    let mut items_failed = 0;
    let client = reqwest::Client::new();

    for (appt_id, title, description, start_time, end_time, patient_name, microchip_id, room_name, status) in appointments {
        // Check if already synced
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT event_id FROM calendar_event_mappings WHERE appointment_id = ?"
        )
        .bind(appt_id)
        .fetch_optional(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to check mapping: {}", e))?;

        if existing.is_some() {
            println!("Appointment {} already synced, skipping", appt_id);
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
                            let _ = sqlx::query(
                                "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id, last_synced_at)
                                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
                            )
                            .bind(appt_id)
                            .bind(event_id)
                            .bind(&calendar_id)
                            .execute(&*pool_guard)
                            .await;

                            println!("✓ Synced appointment {} to Google Calendar (event_id: {})", appt_id, event_id);
                            items_synced += 1;
                        } else {
                            eprintln!("✗ Failed to sync appointment {}: No event ID in response", appt_id);
                            items_failed += 1;
                        }
                    }
                    Err(e) => {
                        eprintln!("✗ Failed to parse event response for appointment {}: {}", appt_id, e);
                        items_failed += 1;
                    }
                }
            }
            Ok(resp) => {
                let error = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                eprintln!("✗ Failed to sync appointment {}: {}", appt_id, error);
                items_failed += 1;
            }
            Err(e) => {
                eprintln!("✗ Network error syncing appointment {}: {}", appt_id, e);
                items_failed += 1;
            }
        }
    }

    // Update sync log
    sqlx::query(
        "UPDATE sync_logs SET status = 'success', items_synced = ?, items_failed = ?,
         completed_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(items_synced)
    .bind(items_failed)
    .bind(sync_log_id)
    .execute(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to update sync log: {}", e))?;

    // Update last_sync timestamp
    sqlx::query(
        "UPDATE google_calendar_settings SET last_sync = CURRENT_TIMESTAMP WHERE user_id = 'default'"
    )
    .execute(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to update last sync: {}", e))?;

    println!("Manual sync completed: {} synced, {} failed", items_synced, items_failed);

    // Fetch and return the sync log
    let sync_log: SyncLog = sqlx::query_as(
        "SELECT * FROM sync_logs WHERE id = ?"
    )
    .bind(sync_log_id)
    .fetch_one(&*pool_guard)
    .await
    .map_err(|e| format!("Failed to fetch sync log: {}", e))?;

    Ok(sync_log)
}

#[tauri::command]
pub async fn get_sync_history(
    pool: State<'_, DatabasePool>,
    limit: i64,
) -> Result<Vec<SyncLog>, String> {
    let pool = pool.lock().await;

    let sync_logs: Vec<SyncLog> = sqlx::query_as(
        "SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch sync history: {}", e))?;

    Ok(sync_logs)
}

#[tauri::command]
pub async fn check_sync_status(
    pool: State<'_, DatabasePool>,
) -> Result<Option<SyncLog>, String> {
    let pool = pool.lock().await;

    let sync_log: Option<SyncLog> = sqlx::query_as(
        "SELECT * FROM sync_logs WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check sync status: {}", e))?;

    Ok(sync_log)
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
    println!("Checking for existing 'Clinic Appointments' calendar...");
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
        println!("Found {} existing calendars", items.len());
        for item in items {
            if item["summary"].as_str() == Some("Clinic Appointments") {
                if let Some(calendar_id) = item["id"].as_str() {
                    println!("✓ Found existing 'Clinic Appointments' calendar: {}", calendar_id);
                    return Ok(calendar_id.to_string());
                }
            }
        }
    }

    // Calendar doesn't exist, create it
    println!("Creating 'Clinic Appointments' calendar...");
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

    println!("Calendar creation response: {:?}", calendar);

    calendar["id"]
        .as_str()
        .map(|s| {
            println!("✓ Created calendar with ID: {}", s);
            s.to_string()
        })
        .ok_or_else(|| {
            eprintln!("Calendar response missing 'id' field. Full response: {:?}", calendar);
            "Calendar ID not found in response".to_string()
        })
}
