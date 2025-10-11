// Prevents additional console window on Windows in release, DO NOT REMOVE!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod models;
mod commands;
mod services;

use database::{create_pool, get_database_url, run_migrations};
use tauri::Manager;

fn main() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

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
            app.manage(pool.clone());

            // Start periodic sync scheduler in async runtime
            let pool_for_scheduler = pool.clone();
            tauri::async_runtime::spawn(async move {
                services::sync_scheduler::SyncScheduler::start(pool_for_scheduler);
            });

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
            commands::create_household,
            commands::create_household_with_people,
            commands::create_patient_with_household,
            commands::search_households,
            commands::get_household_with_people,
            commands::get_all_households,
            commands::update_household,
            commands::delete_household,
            commands::quick_search_households,
            commands::rebuild_household_search_index,
            // Household detail view commands
            commands::get_household_detail,
            commands::update_household_fields,
            commands::add_person_to_household,
            commands::update_person,
            commands::delete_person,
            commands::update_person_contacts,
            commands::get_household_patients,
            // Medical history commands
            commands::get_medical_records,
            commands::get_medical_record,
            commands::create_medical_record,
            commands::update_medical_record,
            commands::archive_medical_record,
            commands::upload_medical_attachment,
            commands::download_medical_attachment,
            commands::delete_medical_attachment,
            commands::search_medical_records,
            commands::get_currencies,
            commands::cleanup_orphaned_files,
            commands::get_medical_record_at_version,
            commands::materialize_medical_attachment,
            commands::write_medical_attachment_to_path,
            commands::open_medical_attachment,
            commands::render_medical_attachment_pdf_thumbnail,
            commands::render_medical_attachment_pdf_thumbnail_force,
            commands::render_medical_attachment_pdf_page_png,
            commands::get_medical_attachment_pdf_page_count,
            commands::revert_medical_record,
            // Settings commands
            commands::get_app_settings,
            commands::update_app_settings,
            // Note: get_currencies is already registered above for medical
            // Database commands
            commands::init_database,
            commands::test_database_connection,
            // View preference commands
            commands::get_view_preference,
            commands::set_view_preference,
            // Debug commands
            commands::debug_database_info,
            // Database reset commands
            commands::reset_database,
            commands::wipe_database_data,
            commands::populate_database,
            // Stats commands
            commands::get_dashboard_stats,
            // Appointment commands
            commands::get_appointments,
            commands::get_appointment,
            commands::create_appointment,
            commands::update_appointment,
            commands::delete_appointment,
            commands::check_conflicts,
            commands::duplicate_appointment,
            // Room commands
            commands::get_rooms,
            commands::get_room,
            commands::create_room,
            commands::update_room,
            commands::delete_room,
            commands::get_room_availability,
            // Update settings commands
            commands::get_update_preferences,
            commands::set_auto_check_enabled,
            commands::record_update_check,
            // Google Calendar commands
            commands::start_oauth_flow,
            commands::complete_oauth_flow,
            commands::cancel_oauth_flow,
            commands::check_oauth_callback,
            commands::get_google_calendar_settings,
            commands::update_sync_enabled,
            commands::disconnect_google_calendar,
            commands::revoke_google_access,
            commands::trigger_manual_sync,
            commands::get_sync_history,
            commands::check_sync_status,
            // Species commands
            commands::get_species,
            commands::get_species_by_id,
            commands::create_species,
            commands::update_species,
            commands::delete_species,
            // Breed commands
            commands::get_breeds,
            commands::get_breed,
            commands::create_breed,
            commands::update_breed,
            commands::delete_breed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
