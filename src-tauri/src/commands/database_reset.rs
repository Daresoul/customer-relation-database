use tauri::{AppHandle, State};
use crate::database::{DatabasePool, get_database_path, run_migrations};

#[tauri::command]
pub async fn reset_database(
    app: AppHandle,
    pool: State<'_, DatabasePool>
) -> Result<String, String> {
    println!("Resetting database...");

    // Get the database path
    let db_path = get_database_path(&app).map_err(|e| e.to_string())?;

    // Lock the pool
    let pool_guard = pool.lock().await;

    // Drop all tables
    let drop_queries = vec![
        "DROP TABLE IF EXISTS patient_owners",
        "DROP TABLE IF EXISTS patient_households",
        "DROP TABLE IF EXISTS person_contacts",
        "DROP TABLE IF EXISTS people",
        "DROP TABLE IF EXISTS households",
        "DROP TABLE IF EXISTS patients",
        "DROP TABLE IF EXISTS owners",
        "DROP TABLE IF EXISTS migrations",
        // Drop FTS tables
        "DROP TABLE IF EXISTS patient_search",
        "DROP TABLE IF EXISTS patient_search_data",
        "DROP TABLE IF EXISTS patient_search_idx",
        "DROP TABLE IF EXISTS patient_search_docsize",
        "DROP TABLE IF EXISTS patient_search_config",
        "DROP TABLE IF EXISTS household_search",
        "DROP TABLE IF EXISTS household_search_data",
        "DROP TABLE IF EXISTS household_search_idx",
        "DROP TABLE IF EXISTS household_search_content",
        "DROP TABLE IF EXISTS household_search_docsize",
        "DROP TABLE IF EXISTS household_search_config",
        // Drop views
        "DROP VIEW IF EXISTS patients_owners_view",
    ];

    for query in drop_queries {
        sqlx::query(query)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;
    }

    println!("All tables dropped");

    // Run migrations to recreate tables
    run_migrations(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to run migrations: {}", e))?;

    println!("Database reset complete");

    Ok(format!(
        "Database reset successfully at: {}",
        db_path.display()
    ))
}

#[tauri::command]
pub async fn wipe_database_data(
    pool: State<'_, DatabasePool>
) -> Result<String, String> {
    println!("Wiping database data (keeping schema)...");

    let pool_guard = pool.lock().await;

    // Delete data in correct order to respect foreign keys
    let delete_queries = vec![
        "DELETE FROM patient_owners",
        "DELETE FROM patient_households",
        "DELETE FROM person_contacts",
        "DELETE FROM people",
        "DELETE FROM households",
        "DELETE FROM patients",
        "DELETE FROM owners",
    ];

    let mut deleted_count = 0;
    for query in delete_queries {
        let result = sqlx::query(query)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to delete data: {}", e))?;
        deleted_count += result.rows_affected();
    }

    // Reset auto-increment counters
    sqlx::query("DELETE FROM sqlite_sequence")
        .execute(&*pool_guard)
        .await
        .ok(); // Ignore errors as table might not exist

    Ok(format!(
        "Database data wiped successfully. {} records deleted.",
        deleted_count
    ))
}