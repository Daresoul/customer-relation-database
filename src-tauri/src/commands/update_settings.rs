use crate::database::connection::DatabasePool;
use crate::models::UpdatePreferences;
use tauri::State;

/// Get update preferences (singleton row with id=1)
#[tauri::command]
pub async fn get_update_preferences(
    pool: State<'_, DatabasePool>,
) -> Result<UpdatePreferences, String> {
    let pool = pool.lock().await;
    sqlx::query_as::<_, UpdatePreferences>("SELECT * FROM update_preferences WHERE id = 1")
        .fetch_one(&*pool)
        .await
        .map_err(|e| format!("Failed to fetch update preferences: {}", e))
}

/// Set whether automatic update checking is enabled
#[tauri::command]
pub async fn set_auto_check_enabled(
    pool: State<'_, DatabasePool>,
    enabled: bool,
) -> Result<(), String> {
    let pool = pool.lock().await;
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "UPDATE update_preferences SET auto_check_enabled = ?, updated_at = ? WHERE id = 1",
    )
    .bind(enabled)
    .bind(now)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to update auto-check setting: {}", e))?;

    Ok(())
}

/// Record an update check with optional notified version
#[tauri::command]
pub async fn record_update_check(
    pool: State<'_, DatabasePool>,
    notified_version: Option<String>,
) -> Result<(), String> {
    let pool = pool.lock().await;
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "UPDATE update_preferences
         SET last_check_timestamp = ?, last_notified_version = ?, updated_at = ?
         WHERE id = 1",
    )
    .bind(now)
    .bind(notified_version)
    .bind(now)
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to record update check: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a database connection
    // They will be tested via integration tests in the frontend
    // This is just a structural test to ensure commands compile

    #[test]
    fn test_command_signatures() {
        // Verify command function signatures are correct
        // Actual functionality tested via Tauri invoke in integration tests
        let _: fn(State<'_, DatabasePool>) -> _ = get_update_preferences;
        let _: fn(State<'_, DatabasePool>, bool) -> _ = set_auto_check_enabled;
        let _: fn(State<'_, DatabasePool>, Option<String>) -> _ = record_update_check;
    }
}
