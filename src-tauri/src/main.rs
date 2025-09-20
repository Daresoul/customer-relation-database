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
            commands::create_patient,
            commands::update_patient,
            commands::delete_patient,
            commands::search_patients,
            commands::get_patients_by_species,
            commands::advanced_patient_search,
            // Household commands
            commands::create_household_with_people,
            commands::create_patient_with_household,
            commands::search_households,
            commands::get_household_with_people,
            commands::update_household,
            commands::delete_household,
            commands::quick_search_households,
            commands::rebuild_household_search_index,
            // Database commands
            commands::init_database,
            commands::test_database_connection,
            // View preference commands
            commands::get_view_preference,
            commands::set_view_preference,
            // Household commands
            commands::search_households,
            commands::create_household,
            commands::create_household_with_people,
            commands::get_household_with_people,
            commands::get_all_households,
            commands::create_patient_with_household,
            commands::update_household,
            commands::delete_household,
            commands::quick_search_households,
            // Debug commands
            commands::debug_database_info,
            // Database reset commands
            commands::reset_database,
            commands::wipe_database_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}