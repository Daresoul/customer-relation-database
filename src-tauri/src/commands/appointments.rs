use tauri::State;
use crate::database::SeaOrmPool;
use crate::services::appointments::AppointmentService;
use crate::services::oauth::get_valid_access_token;
use crate::models::{
    Appointment, AppointmentDetail, AppointmentListResponse, AppointmentStatus,
    CreateAppointmentInput, UpdateAppointmentInput, AppointmentFilter,
    ConflictCheckInput, ConflictCheckResponse, DuplicateAppointmentInput
};
use std::sync::Arc;
use chrono::Utc;
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};

#[tauri::command]
pub async fn get_appointments(
    pool: State<'_, SeaOrmPool>,
    filter: AppointmentFilter,
    limit: i64,
    offset: i64,
) -> Result<AppointmentListResponse, String> {
    log::debug!("get_appointments called with filter: {:?}, limit: {}, offset: {}", filter, limit, offset);
    let result = AppointmentService::get_appointments(&pool, filter, limit, offset).await;
    match &result {
        Ok(response) => {
            log::debug!("get_appointments returning {} appointments, total: {}", response.appointments.len(), response.total);
        }
        Err(e) => {
            log::error!("get_appointments error: {}", e);
        }
    }
    result
}

#[tauri::command]
pub async fn get_appointment(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<AppointmentDetail, String> {
    AppointmentService::get_appointment_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_appointment(
    pool: State<'_, SeaOrmPool>,
    input: CreateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    let appointment = AppointmentService::create_appointment(&pool, input, created_by).await?;

    // Trigger sync to Google Calendar if enabled (non-blocking)
    let appointment_id = appointment.id;
    let db = pool.inner().clone();
    tokio::spawn(async move {
        if let Err(e) = trigger_sync_after_create(db, appointment_id).await {
            log::error!("Failed to sync appointment to Google Calendar: {}", e);
        }
    });

    Ok(appointment)
}

#[tauri::command]
pub async fn update_appointment(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateAppointmentInput,
    updated_by: Option<String>,
) -> Result<Appointment, String> {
    let updated_by = updated_by.unwrap_or_else(|| "system".to_string());

    // Check if appointment is being cancelled
    let is_cancellation = input.status == Some(AppointmentStatus::Cancelled);

    let appointment = AppointmentService::update_appointment(&pool, id, input, updated_by).await?;

    // Trigger sync to Google Calendar if enabled (non-blocking)
    let db = pool.inner().clone();
    tokio::spawn(async move {
        if is_cancellation {
            if let Err(e) = trigger_sync_after_cancel(db, id).await {
                log::error!("Failed to sync cancellation to Google Calendar: {}", e);
            }
        } else {
            if let Err(e) = trigger_sync_after_update(db, id).await {
                log::error!("Failed to sync update to Google Calendar: {}", e);
            }
        }
    });

    Ok(appointment)
}

#[tauri::command]
pub async fn delete_appointment(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    AppointmentService::delete_appointment(&pool, id).await?;

    // The mapping outlives the soft delete, so the Google event can still go.
    let db = pool.inner().clone();
    tokio::spawn(async move {
        if let Err(e) = trigger_sync_after_cancel(db, id).await {
            log::error!("Failed to remove the deleted appointment from Google Calendar: {}", e);
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn check_conflicts(
    pool: State<'_, SeaOrmPool>,
    input: ConflictCheckInput,
) -> Result<ConflictCheckResponse, String> {
    AppointmentService::check_conflicts(&pool, input).await
}

#[tauri::command]
pub async fn duplicate_appointment(
    pool: State<'_, SeaOrmPool>,
    input: DuplicateAppointmentInput,
    created_by: Option<String>,
) -> Result<Appointment, String> {
    let created_by = created_by.unwrap_or_else(|| "system".to_string());
    let appointment = AppointmentService::duplicate_appointment(&pool, input, created_by).await?;

    let appointment_id = appointment.id;
    let db = pool.inner().clone();
    tokio::spawn(async move {
        if let Err(e) = trigger_sync_after_create(db, appointment_id).await {
            log::error!("Failed to sync the duplicated appointment to Google Calendar: {}", e);
        }
    });

    Ok(appointment)
}

// ===== Google Calendar Sync Helpers (using SeaORM) =====

async fn trigger_sync_after_create(
    db: Arc<DatabaseConnection>,
    appointment_id: i64,
) -> Result<(), String> {
    // Check if sync is enabled
    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT calendar_id, sync_enabled FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let row = match row {
        Some(r) => r,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id: String = row.try_get("", "calendar_id")
        .map_err(|_| "No calendar ID configured".to_string())?;

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&db).await?;

    // Get appointment details
    let appointment = fetch_appointment_detail_seaorm(&db, appointment_id).await?;

    // Format event summary and description with all details
    let patient_name = appointment.patient.as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "Unknown Patient".to_string());

    let event_summary = format!("{} - {}", appointment.appointment.title, patient_name);

    let mut desc_parts = Vec::new();
    desc_parts.push(format!("Patient: {}", patient_name));

    if appointment.patient.is_some() {
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
            "timeZone": crate::services::google_calendar::local_time_zone()
        },
        "end": {
            "dateTime": appointment.appointment.end_time,
            "timeZone": crate::services::google_calendar::local_time_zone()
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
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO calendar_event_mappings (appointment_id, event_id, calendar_id, last_synced_at) VALUES (?, ?, ?, ?)",
        [appointment_id.into(), event_id.into(), calendar_id.into(), Utc::now().to_rfc3339().into()]
    ))
    .await
    .map_err(|e| format!("Failed to save event mapping: {}", e))?;

    Ok(())
}

async fn trigger_sync_after_update(
    db: Arc<DatabaseConnection>,
    appointment_id: i64,
) -> Result<(), String> {
    // Check if sync is enabled
    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT calendar_id, sync_enabled FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let row = match row {
        Some(r) => r,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id: String = row.try_get("", "calendar_id")
        .map_err(|_| "No calendar ID configured".to_string())?;

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&db).await?;

    // Check if mapping exists
    let mapping = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT event_id, calendar_id FROM calendar_event_mappings WHERE appointment_id = ?",
        [appointment_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to check event mapping: {}", e))?;

    let event_id: String = match mapping {
        Some(m) => m.try_get("", "event_id").map_err(|_| "Event ID not found".to_string())?,
        None => {
            // No mapping exists, create event instead
            return trigger_sync_after_create(db.clone(), appointment_id).await;
        }
    };

    // Get appointment details
    let appointment = fetch_appointment_detail_seaorm(&db, appointment_id).await?;

    // Format event summary and description with all details
    let patient_name = appointment.patient.as_ref()
        .map(|p| p.name.clone())
        .unwrap_or_else(|| "Unknown Patient".to_string());

    let event_summary = format!("{} - {}", appointment.appointment.title, patient_name);

    let mut desc_parts = Vec::new();
    desc_parts.push(format!("Patient: {}", patient_name));

    if appointment.patient.is_some() {
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
            "timeZone": crate::services::google_calendar::local_time_zone()
        },
        "end": {
            "dateTime": appointment.appointment.end_time,
            "timeZone": crate::services::google_calendar::local_time_zone()
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
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE calendar_event_mappings SET last_synced_at = ? WHERE appointment_id = ?",
        [Utc::now().to_rfc3339().into(), appointment_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to update sync timestamp: {}", e))?;

    Ok(())
}

async fn trigger_sync_after_cancel(
    db: Arc<DatabaseConnection>,
    appointment_id: i64,
) -> Result<(), String> {
    // Check if sync is enabled
    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT calendar_id, sync_enabled FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1".to_string()
    ))
    .await
    .map_err(|e| format!("Failed to check sync settings: {}", e))?;

    let row = match row {
        Some(r) => r,
        None => return Ok(()), // Sync not enabled
    };

    let calendar_id: String = row.try_get("", "calendar_id")
        .map_err(|_| "No calendar ID configured".to_string())?;

    // Get valid access token (will refresh if needed)
    let access_token = get_valid_access_token(&db).await?;

    // Check if mapping exists
    let mapping = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT event_id, calendar_id FROM calendar_event_mappings WHERE appointment_id = ?",
        [appointment_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to check event mapping: {}", e))?;

    let event_id: String = match mapping {
        Some(m) => m.try_get("", "event_id").map_err(|_| "Event ID not found".to_string())?,
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
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM calendar_event_mappings WHERE appointment_id = ?",
        [appointment_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to delete event mapping: {}", e))?;

    Ok(())
}

/// The appointment as Google gets it: the same read the app uses, so the
/// arrival statuses come out right.
async fn fetch_appointment_detail_seaorm(
    db: &DatabaseConnection,
    appointment_id: i64,
) -> Result<AppointmentDetail, String> {
    AppointmentService::get_appointment_by_id(db, appointment_id).await
}
