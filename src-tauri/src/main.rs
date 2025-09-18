// Prevents additional console window on Windows in release, DO NOT REMOVE!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod models;
mod commands;

use database::{create_pool, get_database_url, run_migrations};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get database URL
            let db_url = get_database_url(&app.handle())?;
            println!("Database URL: {}", db_url);

            // Initialize database in async runtime
            let pool = tauri::async_runtime::block_on(async {
                // Create database pool
                let pool = create_pool(&db_url).await
                    .map_err(|e| format!("Failed to create database pool: {}", e))?;

                // Run migrations
                {
                    let pool_guard = pool.lock().await;
                    run_migrations(&*pool_guard).await
                        .map_err(|e| format!("Failed to run migrations: {}", e))?;
                }

                println!("Database initialized successfully");
                Ok::<_, String>(pool)
            })?;

            // Store pool in app state
            app.manage(pool);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Patient commands
            commands::get_patients,
            commands::get_patient,
            commands::get_patient_with_owners,
            commands::create_patient,
            commands::update_patient,
            commands::delete_patient,
            commands::search_patients,
            commands::get_patients_by_species,
            commands::search_patients_by_owner,
            commands::advanced_patient_search,
            // Owner commands
            commands::get_owners,
            commands::get_owner,
            commands::get_owner_with_patients,
            commands::create_owner,
            commands::update_owner,
            commands::delete_owner,
            commands::search_owners,
            commands::find_owners_by_name,
            commands::search_owners_by_patient,
            // Relationship commands
            commands::add_patient_owner,
            commands::remove_patient_owner,
            commands::set_primary_owner,
            commands::get_patient_owners,
            commands::get_owner_patients,
            commands::update_relationship_type,
            // Database commands
            commands::init_database,
            commands::test_database_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}