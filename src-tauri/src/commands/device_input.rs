use crate::services::device_input::{scan_ports, start_listen, stop_listen, get_all_connection_statuses, enrich_port_info_with_device_names, PortInfo, DeviceConnectionStatus};
use crate::services::file_watcher::{get_all_file_watcher_statuses, FileWatcherStatus};
use crate::services::device_integration::DeviceIntegrationService;
use crate::database::SeaOrmPool;
use crate::models::Patient;
use tauri::{State, AppHandle};
use sea_orm::{ConnectionTrait, Statement, DbBackend};

#[tauri::command]
pub async fn get_available_ports() -> Result<Vec<PortInfo>, String> {
    let ports = scan_ports()?;
    // Enrich with USB device names (hybrid: embedded DB + web fallback)
    let enriched_ports = enrich_port_info_with_device_names(ports).await;
    Ok(enriched_ports)
}

/// Get all device connection statuses
#[tauri::command]
pub fn get_device_connection_statuses() -> Vec<DeviceConnectionStatus> {
    get_all_connection_statuses()
}

/// Get all file watcher statuses
#[tauri::command]
pub fn get_file_watcher_statuses() -> Vec<FileWatcherStatus> {
    get_all_file_watcher_statuses()
}

/// Start listening to a device integration's serial port
#[tauri::command]
pub async fn start_device_integration_listener(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    integration_id: i64,
) -> Result<(), String> {
    // Get the device integration from the database
    let integration = DeviceIntegrationService::get_by_id(&pool, integration_id).await?;

    // Verify it's enabled and uses serial port
    if !integration.enabled {
        return Err("Device integration is disabled".to_string());
    }

    let serial_port_name = integration.serial_port_name
        .ok_or("Device integration does not have a serial port configured")?;

    // Start listening with the device type and integration ID (protocol will be determined automatically)
    start_listen(
        app_handle,
        serial_port_name,
        integration.device_type.to_db_string().to_string(),
        integration.id,
    )?;

    Ok(())
}

/// Stop listening to a device integration's serial port
#[tauri::command]
pub async fn stop_device_integration_listener(
    pool: State<'_, SeaOrmPool>,
    integration_id: i64,
) -> Result<(), String> {
    // Get the device integration from the database
    let integration = DeviceIntegrationService::get_by_id(&pool, integration_id).await?;

    if let Some(serial_port_name) = integration.serial_port_name {
        stop_listen(&serial_port_name, &integration.device_type.to_db_string());
    }

    Ok(())
}

/// Resolve a patient from an identifier (microchip ID, name, etc.)
/// Searches in order: microchip_id, name
#[tauri::command]
pub async fn resolve_patient_from_identifier(
    pool: State<'_, SeaOrmPool>,
    identifier: String,
) -> Result<Option<Patient>, String> {
    // First try to find by microchip ID (exact match)
    let microchip_result = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.weight, p.medical_notes, p.is_active, p.created_at,
                p.updated_at, p.microchip_id, p.color,
                s.name as species,
                b.name as breed
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         WHERE p.microchip_id = ? AND p.is_active = 1
         LIMIT 1",
        [identifier.clone().into()]
    ))
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if let Some(row) = microchip_result {
        return Ok(Some(row_to_patient(&row)?));
    }

    // If not found by microchip, try by name (case-insensitive, partial match)
    let name_result = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.weight, p.medical_notes, p.is_active, p.created_at,
                p.updated_at, p.microchip_id, p.color,
                s.name as species,
                b.name as breed
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         WHERE LOWER(p.name) LIKE LOWER(?) AND p.is_active = 1
         ORDER BY
            CASE
                WHEN LOWER(p.name) = LOWER(?) THEN 0  -- Exact match first
                WHEN LOWER(p.name) LIKE LOWER(?) THEN 1  -- Starts with
                ELSE 2  -- Contains
            END
         LIMIT 1",
        [
            format!("%{}%", identifier).into(),
            identifier.clone().into(),
            format!("{}%", identifier).into(),
        ]
    ))
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if let Some(row) = name_result {
        return Ok(Some(row_to_patient(&row)?));
    }

    // No match found
    Ok(None)
}

fn row_to_patient(row: &sea_orm::QueryResult) -> Result<Patient, String> {
    use chrono::{DateTime, Utc, NaiveDate};

    // Parse date_of_birth from string to NaiveDate
    let date_of_birth: Option<NaiveDate> = row.try_get::<Option<String>>("", "date_of_birth")
        .unwrap_or(None)
        .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());

    // Parse created_at and updated_at from string to DateTime<Utc>
    let created_at: DateTime<Utc> = row.try_get::<Option<String>>("", "created_at")
        .unwrap_or(None)
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    let updated_at: DateTime<Utc> = row.try_get::<Option<String>>("", "updated_at")
        .unwrap_or(None)
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);

    Ok(Patient {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        name: row.try_get("", "name").map_err(|e| format!("Failed to get name: {}", e))?,
        species_id: row.try_get("", "species_id").unwrap_or(0),
        breed_id: row.try_get("", "breed_id").unwrap_or(None),
        species: row.try_get("", "species").unwrap_or(None),
        breed: row.try_get("", "breed").unwrap_or(None),
        color: row.try_get("", "color").unwrap_or(None),
        gender: row.try_get("", "gender").unwrap_or(None),
        date_of_birth,
        weight: row.try_get("", "weight").unwrap_or(None),
        medical_notes: row.try_get("", "medical_notes").unwrap_or(None),
        is_active: row.try_get::<i64>("", "is_active").unwrap_or(1) == 1,
        household_id: None, // Not needed for device data resolution
        created_at,
        updated_at,
        microchip_id: row.try_get("", "microchip_id").unwrap_or(None),
    })
}
