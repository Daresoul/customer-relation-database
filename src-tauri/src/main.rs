// Prevents additional console window on Windows in release, DO NOT REMOVE!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod entities;
mod models;
mod commands;
mod services;

#[cfg(test)]
mod test_utils;

#[cfg(test)]
mod tests;

use database::{create_pools, get_database_url, run_migrations};
use tauri::{Manager, SystemTray, SystemTrayEvent, CustomMenuItem, SystemTrayMenu, SystemTrayMenuItem};
use tauri_plugin_log::{LogTarget, Builder};
use log::LevelFilter;
use services::device_capture::start_device_capture;

fn main() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Configure logging based on build type
    #[cfg(debug_assertions)]
    let log_targets = vec![
        LogTarget::Stdout,   // Terminal console
        LogTarget::Webview,  // Browser devtools
        LogTarget::LogDir,   // Also log to file in dev (optional)
    ];

    #[cfg(not(debug_assertions))]
    let log_targets = vec![
        LogTarget::LogDir,   // Only log to file in production
    ];

    // Build system tray with basic menu
    let show_item = CustomMenuItem::new("show".to_string(), "Show");
    let hide_item = CustomMenuItem::new("hide".to_string(), "Hide");
    #[cfg(debug_assertions)]
    let simulate_scan_item = CustomMenuItem::new("simulate_scan".to_string(), "Simulate Scan");
    #[cfg(debug_assertions)]
    let simulate_file_item = CustomMenuItem::new("simulate_file".to_string(), "Simulate File");
    let quit_item = CustomMenuItem::new("quit".to_string(), "Quit");

    // Build tray menu conditionally
    let mut tray_menu = SystemTrayMenu::new()
        .add_item(show_item)
        .add_item(hide_item);
    #[cfg(debug_assertions)]
    {
        tray_menu = tray_menu
            .add_item(simulate_scan_item)
            .add_item(simulate_file_item);
    }
    tray_menu = tray_menu
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit_item);
    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .plugin(Builder::default()
            .targets(log_targets)
            .level(LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit_all("wake-from-tray", serde_json::json!({"cause": "manual"}));
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "show" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit_all("wake-from-tray", serde_json::json!({"cause": "manual"}));
                    }
                    "hide" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.hide();
                        }
                    }
                    #[cfg(debug_assertions)]
                    "simulate_scan" => {
                        // Emit a simulated scan event and show window
                        let code = format!("TEST-{}", rand::random::<u16>());
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit_all("wake-from-tray", serde_json::json!({
                            "cause": "scan",
                            "code": code
                        }));
                    }
                    #[cfg(debug_assertions)]
                    "simulate_file" => {
                        // Emit a simulated file event and show window (will open modal)
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit_all("wake-from-tray", serde_json::json!({
                            "cause": "file",
                            "fileName": "simulated_exigo.xml",
                            "device": "Exigo Eos Vet",
                            "deviceType": "exigo_eos_vet"
                        }));
                    }
                    "quit" => {
                        let count = services::device_input::stop_all_listeners();
                        log::info!("Exiting from tray. Stopped {} listeners.", count);
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Hide to tray instead of quitting
                api.prevent_close();
                let _ = event.window().hide();
            }
            _ => {}
        })
        .setup(|app| {
            // Start device-level scanner capture (Windows/macOS dev environments)
            start_device_capture(app.handle());
            // Start hidden on launch (will be shown from tray or on events)
            if let Some(window) = app.get_window("main") {
                let _ = window.hide();
            }
            // Get database URL
            let db_url = get_database_url(&app.handle())?;
            log::info!("Database URL: {}", db_url);

            // Initialize database in async runtime
            let (sea_orm_pool, _legacy_pool) = tauri::async_runtime::block_on(async {
                // Create database pools (SeaORM DatabaseConnection + legacy SqlitePool)
                let (sea_orm_pool, legacy_pool) = create_pools(&db_url).await
                    .map_err(|e| format!("Failed to create database pool: {}", e))?;

                // Run migrations using the legacy pool
                {
                    let pool_guard = legacy_pool.lock().await;
                    run_migrations(&*pool_guard).await
                        .map_err(|e| format!("Failed to run migrations: {}", e))?;
                }

                log::info!("Database initialized successfully");
                Ok::<_, String>((sea_orm_pool, legacy_pool))
            })?;

            // Store SeaORM pool in app state (legacy pool only used internally for migrations)
            app.manage(sea_orm_pool.clone());

            // Start periodic sync scheduler in async runtime (uses SeaORM)
            let sea_orm_pool_for_scheduler = sea_orm_pool.clone();
            tauri::async_runtime::spawn(async move {
                services::sync_scheduler::SyncScheduler::start(sea_orm_pool_for_scheduler);
            });

            // Initialize file watcher for device integrations
            let sea_orm_pool_for_watcher = sea_orm_pool.clone();
            let app_handle_for_watcher = app.handle();
            tauri::async_runtime::spawn(async move {
                let _file_watcher = {
                    let mut watcher = services::file_watcher::FileWatcherService::new(sea_orm_pool_for_watcher);
                    watcher.set_app_handle(app_handle_for_watcher);
                    if let Err(e) = watcher.initialize().await {
                        log::error!("Failed to initialize file watcher: {}", e);
                    }
                    watcher
                };

                // Keep file watcher alive for the duration of the app
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                }
            });

            // Initialize serial port listeners for device integrations
            let sea_orm_pool_for_serial = sea_orm_pool.clone();
            let app_handle_for_serial = app.handle();
            tauri::async_runtime::spawn(async move {
                use models::device_integration::ConnectionType;

                // Get all device integrations and filter for enabled serial port ones
                let integrations = services::device_integration::DeviceIntegrationService::get_all(&sea_orm_pool_for_serial)
                    .await
                    .unwrap_or_else(|e| {
                        log::error!("Failed to query device integrations: {}", e);
                        vec![]
                    });

                let serial_integrations: Vec<_> = integrations
                    .into_iter()
                    .filter(|i| i.enabled && i.connection_type == ConnectionType::SerialPort)
                    .collect();

                log::info!("📡 Found {} enabled serial port integrations", serial_integrations.len());

                // Start listener for each
                for integration in serial_integrations {
                    if let Some(port_name) = integration.serial_port_name {
                        log::info!("🎧 Auto-starting listener for: {} ({})", integration.name, port_name);
                        if let Err(e) = services::device_input::start_listen(
                            app_handle_for_serial.clone(),
                            port_name,
                            integration.device_type.to_db_string().to_string(),
                            integration.id,
                        ) {
                            log::error!("❌ Failed to start listener for {}: {}", integration.name, e);
                        }
                    } else {
                        log::warn!("⚠️  Integration '{}' has no serial port configured", integration.name);
                    }
                }
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
            commands::link_patient_to_household,
            commands::unlink_patient_from_household,
            commands::update_patient_household,
            // Medical history commands
            commands::get_medical_records,
            commands::get_medical_record,
            commands::create_medical_record,
            commands::update_medical_record,
            commands::archive_medical_record,
            commands::upload_medical_attachment,
            commands::download_medical_attachment,
            commands::delete_medical_attachment,
            commands::get_attachment_content,
            commands::search_medical_records,
            commands::get_currencies,
            commands::cleanup_orphaned_files,
            commands::get_medical_record_at_version,
            commands::materialize_medical_attachment,
            commands::write_medical_attachment_to_path,
            commands::open_medical_attachment,
            commands::print_medical_attachment,
            commands::render_medical_attachment_pdf_thumbnail,
            commands::render_medical_attachment_pdf_thumbnail_force,
            commands::render_medical_attachment_pdf_page_png,
            commands::get_medical_attachment_pdf_page_count,
            commands::revert_medical_record,
            commands::regenerate_pdf_from_attachment,
            commands::regenerate_pdf_from_medical_record,
            commands::generate_configured_report,
            // Record template commands
            commands::get_record_templates,
            commands::search_record_templates,
            commands::create_record_template,
            commands::update_record_template,
            commands::delete_record_template,
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
            // Device input commands
            commands::get_available_ports,
            commands::resolve_patient_from_identifier,
            commands::start_device_integration_listener,
            commands::stop_device_integration_listener,
            commands::get_device_connection_statuses,
            commands::get_file_watcher_statuses,
            // Device integration commands
            commands::get_device_integrations,
            commands::get_device_integration,
            commands::create_device_integration,
            commands::update_device_integration,
            commands::delete_device_integration,
            commands::toggle_device_integration_enabled,
            // File history commands
            commands::get_recent_device_files,
            commands::get_file_history,
            commands::record_device_file_access,
            commands::update_file_attachment,
            commands::cleanup_old_file_history,
            commands::download_device_file,
            // Pending device entries (Save for later)
            commands::save_device_files_for_later,
            commands::list_pending_device_entries,
            commands::mark_pending_entry_processed,
            commands::get_device_data_from_history,
            // Dev tools commands (function in debug builds only)
            commands::get_virtual_port_status,
            commands::start_virtual_ports,
            commands::stop_virtual_ports,
            commands::send_test_healvet,
            commands::send_test_pointcare,
            commands::send_test_pcr,
            commands::send_test_exigo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
