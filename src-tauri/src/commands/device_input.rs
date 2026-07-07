use crate::services::device_input::{scan_ports, start_listen, stop_listen, get_all_connection_statuses, enrich_port_info_with_device_names, PortInfo, DeviceConnectionStatus, ConnectionState};
use crate::services::file_watcher::{get_all_file_watcher_statuses, FileWatcherStatus};
use crate::services::device_integration::DeviceIntegrationService;
use crate::models::device_integration::ConnectionType;
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

/// Normalise a name/identifier to a common lowercased-Latin form for matching.
///
/// Two things happen: (1) Unicode-aware lowercasing, and (2) Macedonian Cyrillic
/// → Latin transliteration. Lab analyzers emit patient names in Latin
/// (e.g. "FIBI", "ceca") while patients are stored in Cyrillic (e.g. "Фиби",
/// "цеца"); case-folding alone can't bridge the two scripts. Non-Cyrillic
/// characters pass through unchanged, so pure-Latin and pure-Cyrillic inputs both
/// normalise to the same key (`normalize_for_match("FIBI") == normalize_for_match("Фиби")`).
///
/// The table is the standard Macedonian romanisation. It won't be letter-perfect
/// for every device convention (e.g. some emit "sh"/"š"/"s" for ш), but it
/// resolves the common single-letter cases that were failing.
fn normalize_for_match(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        // Lowercase first (Unicode-aware): 'Ф' → 'ф', 'A' → 'a', etc.
        for lc in ch.to_lowercase() {
            match lc {
                'а' => out.push('a'),
                'б' => out.push('b'),
                'в' => out.push('v'),
                'г' => out.push('g'),
                'д' => out.push('d'),
                'ѓ' => out.push_str("gj"),
                'е' => out.push('e'),
                'ж' => out.push_str("zh"),
                'з' => out.push('z'),
                'ѕ' => out.push_str("dz"),
                'и' => out.push('i'),
                'ј' => out.push('j'),
                'к' => out.push('k'),
                'л' => out.push('l'),
                'љ' => out.push_str("lj"),
                'м' => out.push('m'),
                'н' => out.push('n'),
                'њ' => out.push_str("nj"),
                'о' => out.push('o'),
                'п' => out.push('p'),
                'р' => out.push('r'),
                'с' => out.push('s'),
                'т' => out.push('t'),
                'ќ' => out.push_str("kj"),
                'у' => out.push('u'),
                'ф' => out.push('f'),
                'х' => out.push('h'),
                'ц' => out.push('c'),
                'ч' => out.push_str("ch"),
                'џ' => out.push_str("dj"),
                'ш' => out.push_str("sh"),
                other => out.push(other),
            }
        }
    }
    out.trim().to_string()
}

/// Manually (re)connect serial device listeners that aren't currently connected.
///
/// Backs the "refresh" button in the device status bar. For every enabled serial-port
/// integration whose live status is not `Connected`, this stops any existing listener
/// (waking it out of its backoff sleep) and starts a fresh connection attempt right
/// away — so the user doesn't have to wait out the retry interval after fixing a cable,
/// powering on an instrument, or reselecting a renumbered port. Already-connected
/// devices are left untouched so we never interrupt a working stream.
///
/// Returns the connection statuses after kicking off the attempts.
#[tauri::command]
pub async fn reconnect_device_listeners(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
) -> Result<Vec<DeviceConnectionStatus>, String> {
    let integrations = DeviceIntegrationService::get_all(&pool).await?;

    // integration_ids that are currently connected — skip these.
    let connected: std::collections::HashSet<i64> = get_all_connection_statuses()
        .into_iter()
        .filter(|s| s.status == ConnectionState::Connected)
        .map(|s| s.integration_id)
        .collect();

    for integration in integrations {
        if !integration.enabled || integration.connection_type != ConnectionType::SerialPort {
            continue;
        }
        let Some(port_name) = integration.serial_port_name.clone() else {
            continue;
        };
        if connected.contains(&integration.id) {
            log::info!("↩️  Reconnect: integration {} ({}) already connected, skipping",
                integration.id, port_name);
            continue;
        }

        let device_type = integration.device_type.to_db_string().to_string();
        log::info!("🔁 Manual reconnect requested for integration {} ({} / {})",
            integration.id, port_name, device_type);

        // Stop any stale/sleeping listener, then immediately start a fresh attempt.
        stop_listen(&port_name, &device_type);
        if let Err(e) = start_listen(app_handle.clone(), port_name.clone(), device_type.clone(), integration.id) {
            log::error!("❌ Manual reconnect failed to start listener for integration {} ({}): {}",
                integration.id, port_name, e);
        }
    }

    Ok(get_all_connection_statuses())
}

/// Lightweight list of the serial port names currently present on the system.
///
/// Unlike `get_available_ports`, this skips USB-vendor name enrichment (which can hit
/// the network), so it's cheap enough to call from the dashboard status bar to detect
/// when a configured port has gone missing (e.g. a renumbered COM port).
#[tauri::command]
pub fn list_serial_port_names() -> Result<Vec<String>, String> {
    Ok(scan_ports()?.into_iter().map(|p| p.port_name).collect())
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

    // If not found by microchip, fall back to name matching.
    //
    // The previous implementation used `WHERE LOWER(p.name) LIKE LOWER(?)`
    // — but SQLite's LOWER() function only handles ASCII a-z / A-Z. For
    // Macedonian Cyrillic patient names like "Шарко" or Greek/Turkish
    // accented Latin, the case-fold is a no-op and "ШАРКО" wouldn't
    // match the stored "Шарко". Net effect: device-imported records
    // failed to auto-match to existing patients whose name casing
    // differed from how the device formatted it.
    //
    // Fix: normalise BOTH sides to a common lowercased-Latin form (Unicode
    // case-fold + Macedonian Cyrillic→Latin transliteration) and compare, so a
    // device-supplied Latin name like "FIBI" matches a patient stored as "Фиби".
    // Cheap because the patients table is small enough to scan, and device input
    // only fires occasionally during a clinic day, not in a hot loop.
    let target = normalize_for_match(&identifier);
    let rows = pool.query_all(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT p.id, p.name, p.species_id, p.breed_id, p.gender, p.date_of_birth,
                p.weight, p.medical_notes, p.is_active, p.created_at,
                p.updated_at, p.microchip_id, p.color,
                s.name as species,
                b.name as breed
         FROM patients p
         LEFT JOIN species s ON p.species_id = s.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         WHERE p.is_active = 1".to_string()
    ))
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    // Score each candidate the same way the old SQL did, but with
    // Unicode-aware string ops. Lower score = better match.
    //   0: exact match
    //   1: name starts with the identifier
    //   2: name contains the identifier
    //   skip otherwise
    let mut best: Option<(u8, sea_orm::QueryResult)> = None;
    for row in rows {
        let name: String = match row.try_get::<String>("", "name") {
            Ok(n) => n,
            Err(_) => continue,
        };
        let name_norm = normalize_for_match(&name);
        let score = if name_norm == target {
            0u8
        } else if name_norm.starts_with(&target) {
            1u8
        } else if name_norm.contains(&target) {
            2u8
        } else {
            continue;
        };
        if best.as_ref().map_or(true, |(s, _)| score < *s) {
            best = Some((score, row));
            // Exact match — can't do better.
            if score == 0 {
                break;
            }
        }
    }

    if let Some((_, row)) = best {
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
        name: row.try_get("", "name").ok(),
        species_id: row.try_get("", "species_id").ok(),
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

#[cfg(test)]
mod tests {
    use super::normalize_for_match;

    #[test]
    fn latin_device_name_matches_cyrillic_patient() {
        // The real cases from production: device emits Latin, patient stored Cyrillic.
        assert_eq!(normalize_for_match("FIBI"), normalize_for_match("Фиби"));
        assert_eq!(normalize_for_match("FIBI"), "fibi");
        assert_eq!(normalize_for_match("ceca"), normalize_for_match("цеца"));
        assert_eq!(normalize_for_match("ceca"), "ceca");
    }

    #[test]
    fn transliterates_common_names() {
        assert_eq!(normalize_for_match("Лори"), "lori");
        assert_eq!(normalize_for_match("бубу"), "bubu");
        // Multi-letter romanisation.
        assert_eq!(normalize_for_match("Шарко"), "sharko");
    }

    #[test]
    fn pure_latin_passes_through_lowercased() {
        assert_eq!(normalize_for_match("Vini"), "vini");
        assert_eq!(normalize_for_match("  ABI  "), "abi"); // trimmed
    }
}
