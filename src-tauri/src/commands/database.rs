use tauri::{State, AppHandle};
use crate::database::{connection::{DatabasePool, create_pool}, migrations::run_migrations};

#[tauri::command]
pub async fn init_database(app: AppHandle, pool: State<'_, DatabasePool>) -> Result<String, String> {
    let db_path = crate::database::get_database_path(&app)
        .map_err(|e| format!("Failed to get database path: {}", e))?;

    let db_url = format!("sqlite:{}", db_path.display());

    // Create new pool for this database
    let new_pool = create_pool(&db_url)
        .await
        .map_err(|e| format!("Failed to create database pool: {}", e))?;

    // Run migrations
    {
        let pool_guard = new_pool.lock().await;
        run_migrations(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to run migrations: {}", e))?;
    }

    // Replace the existing pool with the new one
    {
        let mut current_pool = pool.lock().await;
        let new_pool_guard = new_pool.lock().await;
        *current_pool = new_pool_guard.clone();
    }

    Ok(format!("Database initialized successfully at: {}", db_path.display()))
}

#[tauri::command]
pub async fn test_database_connection(pool: State<'_, DatabasePool>) -> Result<String, String> {
    crate::database::connection::test_connection(&pool)
        .await
        .map_err(|e| format!("Database connection failed: {}", e))?;

    Ok("Database connection successful".to_string())
}