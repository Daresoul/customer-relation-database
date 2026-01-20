use crate::database::SeaOrmPool;
use crate::models::UpdatePreferences;
use tauri::State;
use sea_orm::*;

/// Get update preferences (singleton row with id=1)
#[tauri::command]
pub async fn get_update_preferences(
    pool: State<'_, SeaOrmPool>,
) -> Result<UpdatePreferences, String> {
    let row = pool
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, auto_check_enabled, last_check_timestamp, last_notified_version, created_at, updated_at FROM update_preferences WHERE id = 1".to_string(),
        ))
        .await
        .map_err(|e| format!("Failed to fetch update preferences: {}", e))?
        .ok_or_else(|| "Update preferences not found".to_string())?;

    Ok(UpdatePreferences {
        id: row.try_get("", "id").unwrap_or(1),
        auto_check_enabled: row.try_get::<i32>("", "auto_check_enabled").map(|v| v != 0).unwrap_or(true),
        last_check_timestamp: row.try_get("", "last_check_timestamp").ok(),
        last_notified_version: row.try_get("", "last_notified_version").ok(),
        created_at: row.try_get("", "created_at").unwrap_or(0),
        updated_at: row.try_get("", "updated_at").unwrap_or(0),
    })
}

/// Set whether automatic update checking is enabled
#[tauri::command]
pub async fn set_auto_check_enabled(
    pool: State<'_, SeaOrmPool>,
    enabled: bool,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();

    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE update_preferences SET auto_check_enabled = ?, updated_at = ? WHERE id = 1",
        [enabled.into(), now.into()],
    ))
    .await
    .map_err(|e| format!("Failed to update auto-check setting: {}", e))?;

    Ok(())
}

/// Record an update check with optional notified version
#[tauri::command]
pub async fn record_update_check(
    pool: State<'_, SeaOrmPool>,
    notified_version: Option<String>,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();

    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE update_preferences SET last_check_timestamp = ?, last_notified_version = ?, updated_at = ? WHERE id = 1",
        [now.into(), notified_version.into(), now.into()],
    ))
    .await
    .map_err(|e| format!("Failed to record update check: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    // Note: These command functions require a database connection
    // and are async, so they cannot be tested with simple signature checks.
    // They are tested via integration tests in the frontend.

    #[test]
    fn test_module_compiles() {
        // This test verifies the module compiles correctly
        // Actual functionality tested via Tauri invoke in integration tests
        assert!(true);
    }
}
