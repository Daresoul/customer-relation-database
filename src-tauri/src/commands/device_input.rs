use crate::services::device_input::{scan_ports, start_listen, PortInfo};
use crate::services::device_integration::DeviceIntegrationService;
use crate::database::connection::DatabasePool;
use crate::models::Patient;
use tauri::{State, AppHandle};
use sqlx::Row;

#[tauri::command]
pub fn get_available_ports() -> Result<Vec<PortInfo>, String> {
    scan_ports()
}

/// Start listening to a device integration's serial port
#[tauri::command]
pub async fn start_device_integration_listener(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
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

    // Start listening with the device type (protocol will be determined automatically)
    start_listen(
        app_handle,
        serial_port_name,
        integration.device_type.to_db_string().to_string(),
    )?;

    Ok(())
}

/// Resolve a patient from an identifier (microchip ID, name, etc.)
/// Searches in order: microchip_id, name
#[tauri::command]
pub async fn resolve_patient_from_identifier(
    pool: State<'_, DatabasePool>,
    identifier: String,
) -> Result<Option<Patient>, String> {
    let pool_guard = pool.lock().await;

    // First try to find by microchip ID (exact match)
    let microchip_result = sqlx::query(
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.weight, p.medical_notes, p.is_active, p.created_at,
                p.updated_at, p.microchip_id, p.color,
                s.name as species,
                b.name as breed
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         WHERE p.microchip_id = ? AND p.is_active = 1
         LIMIT 1"
    )
    .bind(&identifier)
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if let Some(row) = microchip_result {
        return Ok(Some(Patient {
            id: row.get("id"),
            name: row.get("name"),
            species_id: row.get("species_id"),
            breed_id: row.get("breed_id"),
            species: row.get("species"),
            breed: row.get("breed"),
            color: row.get("color"),
            gender: row.get("gender"),
            date_of_birth: row.get("date_of_birth"),
            weight: row.get("weight"),
            medical_notes: row.get("medical_notes"),
            is_active: row.get::<i64, _>("is_active") == 1,
            household_id: None, // Not needed for device data resolution
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            microchip_id: row.get("microchip_id"),
        }));
    }

    // If not found by microchip, try by name (case-insensitive, partial match)
    let name_result = sqlx::query(
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
         LIMIT 1"
    )
    .bind(format!("%{}%", identifier))
    .bind(&identifier)
    .bind(format!("{}%", identifier))
    .fetch_optional(&*pool_guard)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if let Some(row) = name_result {
        return Ok(Some(Patient {
            id: row.get("id"),
            name: row.get("name"),
            species_id: row.get("species_id"),
            breed_id: row.get("breed_id"),
            species: row.get("species"),
            breed: row.get("breed"),
            color: row.get("color"),
            gender: row.get("gender"),
            date_of_birth: row.get("date_of_birth"),
            weight: row.get("weight"),
            medical_notes: row.get("medical_notes"),
            is_active: row.get::<i64, _>("is_active") == 1,
            household_id: None, // Not needed for device data resolution
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            microchip_id: row.get("microchip_id"),
        }));
    }

    // No match found
    Ok(None)
}