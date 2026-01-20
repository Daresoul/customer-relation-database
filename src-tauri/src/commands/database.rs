use tauri::AppHandle;
use crate::database::{connection::create_pool, migrations::run_migrations};

/// Initialize/reinitialize the database (admin command)
/// Creates its own connection for DDL operations
#[tauri::command]
pub async fn init_database(app: AppHandle) -> Result<String, String> {
    let db_path = crate::database::get_database_path(&app)
        .map_err(|e| format!("Failed to get database path: {}", e))?;

    let db_url = format!("sqlite:{}", db_path.display());

    // Create pool for migrations
    let pool = create_pool(&db_url)
        .await
        .map_err(|e| format!("Failed to create database pool: {}", e))?;

    // Run migrations
    {
        let pool_guard = pool.lock().await;
        run_migrations(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to run migrations: {}", e))?;
    }

    Ok(format!("Database initialized successfully at: {}", db_path.display()))
}

/// Test database connection (admin command)
/// Creates its own connection for testing
#[tauri::command]
pub async fn test_database_connection(app: AppHandle) -> Result<String, String> {
    let db_path = crate::database::get_database_path(&app)
        .map_err(|e| format!("Failed to get database path: {}", e))?;

    let db_url = format!("sqlite:{}", db_path.display());

    // Create pool and test connection
    let pool = create_pool(&db_url)
        .await
        .map_err(|e| format!("Failed to create database pool: {}", e))?;

    crate::database::connection::test_connection(&pool)
        .await
        .map_err(|e| format!("Database connection failed: {}", e))?;

    Ok("Database connection successful".to_string())
}
