use tauri::State;
use crate::database::connection::DatabasePool;
use crate::services::appointments::AppointmentService;
use crate::services::oauth::get_valid_access_token;
use crate::models::{
    Appointment, AppointmentDetail, AppointmentListResponse, AppointmentStatus,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    ConflictCheckInput, ConflictCheckResponse, DuplicateAppointmentInput
};
use crate::models::google_calendar::GoogleCalendarSettings;
use std::sync::Arc;
use tokio::sync::Mutex;
use sqlx::SqlitePool;
use chrono::Utc;

#[tauri::command]
pub async fn get_appointments(
    pool: State<'_, DatabasePool>,
    filter: AppointmentFilter,
    limit: i64,
    offset: i64,
) -> Result<AppointmentListResponse, String> {
    println!("get_appointments called with filter: {:?}, limit: {}, offset: {}", filter, limit, offset);
    let pool = pool.lock().await;
    let result = AppointmentService::get_appointments(&*pool, filter, limit, offset).await;
    match &result {
        Ok(response) => {
            println!("get_appointments returning {} appointments, total: {}", response.appointments.len(), response.total);
        }
        Err(e) => {
            println!("get_appointments error: {}", e);
        }
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<AppointmentDetail, String> {
    let pool = pool.lock().await;
    AppointmentService::get_appointment_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_appointment(
    pool: State<'_, DatabasePool>,
    input: CreateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let pool_guard = pool.lock().await;
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    let appointment = AppointmentService::create_appointment(&*pool_guard, input, created_by)
        .await
        .map_err(|e| e.to_string())?;

    // Trigger sync to Google Calendar if enabled (non-blocking)
    let appointment_id = appointment.id;
    let pool_clone = pool.inner().clone();
    tokio::spawn(async move {
        if let Err(e) = trigger_sync_after_create(pool_clone, appointment_id).await {
            eprintln!("Failed to sync appointment to Google Calendar: {}", e);
        }
    });

    Ok(appointment)
}

#[tauri::command]
pub async fn update_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateAppointmentInput,
    updated_by: Option<String>,
) -> Result<Appointment, String> {
    let pool_guard = pool.lock().await;
    let updated_by = updated_by.unwrap_or_else(|| "system".to_string());

    // Check if appointment is being cancelled
    let is_cancellation = input.status == Some(AppointmentStatus::Cancelled);

    let appointment = AppointmentService::update_appointment(&*pool_guard, id, input, updated_by)
        .await
        .map_err(|e| e.to_string())?;

    // Trigger sync to Google Calendar if enabled (non-blocking)
    let pool_clone = pool.inner().clone();
    tokio::spawn(async move {
        if is_cancellation {
            if let Err(e) = trigger_sync_after_cancel(pool_clone, id).await {
                eprintln!("Failed to sync cancellation to Google Calendar: {}", e);
            }
        } else {
            if let Err(e) = trigger_sync_after_update(pool_clone, id).await {
                eprintln!("Failed to sync update to Google Calendar: {}", e);
            }
        }
    });

    Ok(appointment)
}

#[tauri::command]
pub async fn delete_appointment(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;
    AppointmentService::delete_appointment(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_conflicts(
    pool: State<'_, DatabasePool>,
    input: ConflictCheckInput,
) -> Result<ConflictCheckResponse, String> {
    let pool = pool.lock().await;
    AppointmentService::check_conflicts(&*pool, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_appointment(
    pool: State<'_, DatabasePool>,
    input: DuplicateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let pool = pool.lock().await;
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    AppointmentService::duplicate_appointment(&*pool, input, created_by)
        .await
        .map_err(|e| e.to_string())
}

// ===== Google Calendar Sync Helpers =====

async fn trigger_sync_after_create(
    pool: Arc<Mutex<SqlitePool>>,
    appointment_id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;

    // Check if sync is enabled
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let settings = match settings {
        Some(s) => s,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id = match settings.calendar_id {
        Some(id) => id,
        None => return Err("No calendar ID configured".to_string()),
    };

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&*pool).await?;

    // Get appointment details
    let appointment: AppointmentDetail = AppointmentService::get_appointment_by_id(&*pool, appointment_id)
        .await
        .map_err(|e| format!("Failed to get appointment: {}", e))?;

    // Format event summary and description with all details
    let patient_name = appointment.patient.as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "Unknown Patient".to_string());

    let event_summary = format!("{} - {}", appointment.appointment.title, patient_name);

    let mut desc_parts = Vec::new();
    desc_parts.push(format!("Patient: {}", patient_name));

    if let Some(patient) = &appointment.patient {
        desc_parts.push(format!("Microchip ID: {}",
            appointment.appointment.microchip_id.as_deref().unwrap_or("-")));
    }

    if let Some(room) = &appointment.room {
        desc_parts.push(format!("Room: {}", room.name));
    }

    desc_parts.push(format!("Status: {}", appointment.appointment.status));

    if let Some(desc) = &appointment.appointment.description {
        if !desc.is_empty() {
            desc_parts.push(String::from(""));
            desc_parts.push(desc.clone());
        }
    }

    let event_description = desc_parts.join("\n");

    // Create event in Google Calendar
    let client = reqwest::Client::new();
    let event_body = serde_json::json!({
        "summary": event_summary,
        "description": event_description,
        "start": {
            "dateTime": appointment.appointment.start_time,
            "timeZone": "America/New_York"
        },
        "end": {
            "dateTime": appointment.appointment.end_time,
            "timeZone": "America/New_York"
        }
    });

    let response = client
        .post(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events", calendar_id))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&event_body)
        .send()
        .await
        .map_err(|e| format!("Failed to create Google Calendar event: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Google Calendar API error: {}", error_text));
    }

    let event: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse event response: {}", e))?;

    let event_id = event["id"]
        .as_str()
        .ok_or("Event ID not found in response")?
        .to_string();

    // Save mapping
    sqlx::query(
        "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id, last_synced_at)
         VALUES (?, ?, ?, ?)"
    )
    .bind(appointment_id)
    .bind(&event_id)
    .bind(&calendar_id)
    .bind(Utc::now())
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to save event mapping: {}", e))?;

    Ok(())
}

async fn trigger_sync_after_update(
    pool_arc: Arc<Mutex<SqlitePool>>,
    appointment_id: i64,
) -> Result<(), String> {
    let pool = pool_arc.lock().await;

    // Check if sync is enabled
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let settings = match settings {
        Some(s) => s,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id = match settings.calendar_id {
        Some(id) => id,
        None => return Err("No calendar ID configured".to_string()),
    };

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&*pool).await?;

    // Check if mapping exists
    let mapping: Option<(String, String)> = sqlx::query_as(
        "SELECT event_id, calendar_id FROM calendar_event_mappings WHERE appointment_id = ?"
    )
    .bind(appointment_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check event mapping: {}", e))?;

    let (event_id, _) = match mapping {
        Some(m) => m,
        None => {
            // No mapping exists, drop lock and create event instead
            drop(pool);
            return trigger_sync_after_create(pool_arc.clone(), appointment_id).await;
        }
    };

    // Get appointment details
    let appointment: AppointmentDetail = AppointmentService::get_appointment_by_id(&*pool, appointment_id)
        .await
        .map_err(|e| format!("Failed to get appointment: {}", e))?;

    // Format event summary and description with all details
    let patient_name = appointment.patient.as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "Unknown Patient".to_string());

    let event_summary = format!("{} - {}", appointment.appointment.title, patient_name);

    let mut desc_parts = Vec::new();
    desc_parts.push(format!("Patient: {}", patient_name));

    if let Some(patient) = &appointment.patient {
        desc_parts.push(format!("Microchip ID: {}",
            appointment.appointment.microchip_id.as_deref().unwrap_or("-")));
    }

    if let Some(room) = &appointment.room {
        desc_parts.push(format!("Room: {}", room.name));
    }

    desc_parts.push(format!("Status: {}", appointment.appointment.status));

    if let Some(desc) = &appointment.appointment.description {
        if !desc.is_empty() {
            desc_parts.push(String::from(""));
            desc_parts.push(desc.clone());
        }
    }

    let event_description = desc_parts.join("\n");

    // Update event in Google Calendar
    let client = reqwest::Client::new();
    let event_body = serde_json::json!({
        "summary": event_summary,
        "description": event_description,
        "start": {
            "dateTime": appointment.appointment.start_time,
            "timeZone": "America/New_York"
        },
        "end": {
            "dateTime": appointment.appointment.end_time,
            "timeZone": "America/New_York"
        }
    });

    let response = client
        .put(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events/{}", calendar_id, event_id))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&event_body)
        .send()
        .await
        .map_err(|e| format!("Failed to update Google Calendar event: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Google Calendar API error: {}", error_text));
    }

    // Update last_synced_at
    sqlx::query(
        "UPDATE calendar_event_mappings SET last_synced_at = ? WHERE appointment_id = ?"
    )
    .bind(Utc::now())
    .bind(appointment_id)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to update sync timestamp: {}", e))?;

    Ok(())
}

async fn trigger_sync_after_cancel(
    pool: Arc<Mutex<SqlitePool>>,
    appointment_id: i64,
) -> Result<(), String> {
    let pool = pool.lock().await;

    // Check if sync is enabled
    let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
        "SELECT * FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let settings = match settings {
        Some(s) => s,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id = match settings.calendar_id {
        Some(id) => id,
        None => return Err("No calendar ID configured".to_string()),
    };

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&*pool).await?;

    // Check if mapping exists
    let mapping: Option<(String, String)> = sqlx::query_as(
        "SELECT event_id, calendar_id FROM calendar_event_mappings WHERE appointment_id = ?"
    )
    .bind(appointment_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to check event mapping: {}", e))?;

    let (event_id, _) = match mapping {
        Some(m) => m,
        None => return Ok(()), // No event to delete
    };

    // Delete event from Google Calendar
    let client = reqwest::Client::new();
    let response = client
        .delete(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events/{}", calendar_id, event_id))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to delete Google Calendar event: {}", e))?;

    if !response.status().is_success() && response.status().as_u16() != 404 {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Google Calendar API error: {}", error_text));
    }

    // Delete mapping
    sqlx::query(
        "DELETE FROM calendar_event_mappings WHERE appointment_id = ?"
    )
    .bind(appointment_id)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to delete event mapping: {}", e))?;

    Ok(())
}