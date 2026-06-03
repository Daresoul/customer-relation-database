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
    // Pick which Sentry "environment" this build reports as. Sentry treats
    // `environment` as a first-class field — the dashboard has built-in
    // filtering, separate alert rules, and isolated issue tracking per
    // environment, all without needing custom tags. Far cleaner than
    // tagging the build type ourselves.
    //
    // Three environments cover every way this binary actually runs:
    //
    //   e2e_test:    Running under WDio (TAURI_E2E=1). Events from CI runs
    //                shouldn't pollute production alerts.
    //   development: Debug build (`cargo tauri dev`). All the dev-machine
    //                noise stays here.
    //   production:  Release build, not under E2E. This is what installed
    //                binaries report as. Anything serious that fires here
    //                is a real user-facing issue.
    //
    // The TAURI_E2E check goes first because a release binary started with
    // that env var IS an E2E run, not production — same binary, different
    // intent.
    let environment: &'static str = if std::env::var("TAURI_E2E").is_ok() {
        "e2e_test"
    } else if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    };

    // Initialize Sentry FIRST so panics during early setup are still captured.
    // The guard must live for the whole of main(); when it's dropped Sentry
    // flushes pending events on a short timeout before the process exits.
    let _sentry_guard = sentry::init((
        "https://e563160f60072e45b88d783b3f153172@o4511411837861888.ingest.de.sentry.io/4511411842187344",
        sentry::ClientOptions {
            release: sentry::release_name!(),
            environment: Some(environment.into()),
            send_default_pii: true,
            // Cap breadcrumb trail at 100 entries (matches Sentry default but
            // explicit so a future raise doesn't silently bloat events).
            max_breadcrumbs: 100,
            ..Default::default()
        },
    ));

    // Identify this machine in Sentry so we can tell which install reported
    // an event. Resolution order:
    //
    //   1. ARKIVET_MACHINE_NAME env var — explicit override, set this when
    //      the OS hostname isn't recognizable (e.g. "DESKTOP-AB12CD34").
    //      Recommended values are short human labels: "Reception PC",
    //      "Surgery Room", "Dev Laptop", "Win Test VM". Set via:
    //        Windows: System Properties → Environment Variables → New
    //                 (Machine scope so the runner-service user inherits)
    //        macOS:   `launchctl setenv ARKIVET_MACHINE_NAME "..."` or
    //                 in your shell rc; remember Tauri inherits the
    //                 launching shell's env.
    //   2. OS hostname — COMPUTERNAME / HOSTNAME / HOST. Always available
    //      so the dashboard never shows a blank machine_name tag.
    //   3. "unknown" — only if all of the above are missing.
    //
    // The os_user tag is auto-only — it identifies which OS user account
    // ran the app, useful when a clinic has staff accounts but one
    // machine_name.
    let hostname_auto = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "unknown".to_string());
    let machine_name = std::env::var("ARKIVET_MACHINE_NAME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| hostname_auto.clone());
    let os_user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());

    sentry::configure_scope(|scope| {
        scope.set_tag("machine_name", &machine_name);
        // Also publish the raw OS hostname when overridden, so we don't
        // lose the auto-detected value when an explicit machine_name is set.
        if machine_name != hostname_auto {
            scope.set_tag("os_hostname", &hostname_auto);
        }
        scope.set_tag("os_user", &os_user);
        scope.set_tag("build_environment", environment);
        scope.set_user(Some(sentry::User {
            username: Some(format!("{os_user}@{machine_name}")),
            ..Default::default()
        }));
    });

    // Startup breadcrumb so any subsequent event has at least one anchor
    // entry in its trail showing which build / machine produced it.
    sentry::add_breadcrumb(sentry::Breadcrumb {
        category: Some("app.lifecycle".into()),
        message: Some(format!(
            "Arkivet started on {machine_name} (user: {os_user}, env: {environment})"
        )),
        level: sentry::Level::Info,
        ..Default::default()
    });

    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Generate the Tauri context once, here, so the same value can drive
    // both early path resolution (for log rotation, below) and the final
    // .run() call. `generate_context!()` is a macro that bakes in the
    // contents of tauri.conf.json at compile time — calling it twice
    // would just be wasted work, not a correctness issue.
    let context = tauri::generate_context!();

    // Rotate and prune log files BEFORE tauri-plugin-log opens its file.
    // The plugin holds its log-file handle for the entire process
    // lifetime; renaming under that handle either fails or — worse on
    // Windows — leaves the plugin writing to the renamed archive
    // (split-brain logs). Doing this here is the only safe place.
    //
    // Both `app_log_dir` and `app_data_dir` may return None on platforms
    // where the relevant base dir can't be resolved (extremely rare on
    // Windows/macOS/Linux but the API is fallible). In that case we
    // silently skip — rotation is housekeeping, not load-bearing.
    let bundle_config = &context.config().tauri.bundle;
    let package_info = context.package_info();
    let main_log_dir = tauri::api::path::app_log_dir(context.config());
    let raw_serial_log_dir = tauri::api::path::app_data_dir(context.config())
        .map(|d| d.join("raw_serial_logs"));
    // Touch the unused references to avoid future warnings if a refactor
    // drops them — kept around because we may add log-prefix derivation
    // (from package name) here later.
    let _ = (bundle_config, package_info);

    if let Some(ref dir) = main_log_dir {
        services::log_rotation::rotate_main_log_at_startup(dir);
        services::log_rotation::prune_old_logs(dir, 30);
    }
    if let Some(ref dir) = raw_serial_log_dir {
        // Raw serial logs already include the date in their filename,
        // so no startup-rename pass is needed — just the retention sweep.
        services::log_rotation::prune_old_logs(dir, 30);
    }

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
            // Start device-level scanner capture (Windows/macOS dev environments).
            //
            // The hidapi enumeration loop briefly opens HID handles for
            // HidD_GetProductString / HidD_GetManufacturerString during scan.
            // On certain Windows + Bluetooth-HID driver combinations this is
            // suspected to contribute to the v0.5.x keystroke doubling
            // regression that's still under investigation. If doubling
            // resurfaces and we need to A/B test, set ARKIVET_HID_CAPTURE=0
            // to skip this entirely — but it's on by default because chip
            // scanners rely on it for the `scanner:barcode` event path.
            let hid_capture_disabled = std::env::var("ARKIVET_HID_CAPTURE").ok().as_deref() == Some("0");
            if hid_capture_disabled {
                log::info!("start_device_capture: disabled via ARKIVET_HID_CAPTURE=0");
            } else {
                start_device_capture(app.handle());
            }
            // Start hidden on launch (will be shown from tray or on events).
            // Skipped under E2E so WebDriver can attach to a visible WebView2 —
            // hiding the window drops the DevTools connection and kills the session.
            if std::env::var("TAURI_E2E").is_err() {
                if let Some(window) = app.get_window("main") {
                    let _ = window.hide();
                }
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

            // Start the Windows Raw Input capture for managed HID scanners. On
            // non-Windows targets this is a compile-time no-op. The capture
            // reads its VID/PID list from the SQLite-backed managed_hid_scanners
            // table; managed devices have their input suppressed at the OS
            // level via WH_KEYBOARD_LL and re-emitted as `scanner:barcode`
            // events.
            //
            // Skipped under E2E (`TAURI_E2E=1`) so WebDriver synthetic events
            // behave predictably. Can also be disabled at runtime with
            // ARKIVET_RAW_INPUT=0 for A/B testing the v0.5.x doubling
            // regression that's still under investigation.
            let raw_input_disabled = std::env::var("ARKIVET_RAW_INPUT").ok().as_deref() == Some("0");
            if std::env::var("TAURI_E2E").is_ok() {
                log::info!("raw_input_capture: skipped (TAURI_E2E set)");
            } else if raw_input_disabled {
                log::info!("raw_input_capture: disabled via ARKIVET_RAW_INPUT=0");
            } else {
                services::raw_input_capture::start_raw_input_capture(app.handle(), sea_orm_pool.clone());
            }

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

            // Run startup backup if a destination is configured. Spawned in
            // a background task so a slow or failing backup never blocks app
            // boot — the user can also trigger it manually from settings.
            let sea_orm_pool_for_backup = sea_orm_pool.clone();
            let app_handle_for_backup = app.handle();
            tauri::async_runtime::spawn(async move {
                let Some(app_data) = app_handle_for_backup
                    .path_resolver()
                    .app_data_dir()
                else {
                    log::warn!("Backup: could not resolve app_data_dir, skipping");
                    return;
                };
                let cfg = services::backup::BackupService::load_config(&app_data);
                if cfg.directory.is_none() {
                    log::info!("Backup: no destination configured, skipping startup backup");
                    return;
                }
                match services::backup::BackupService::run_backup(&app_data, &sea_orm_pool_for_backup).await {
                    Ok(c) => log::info!("Backup: completed at {}", c.last_backup_at.unwrap_or_default()),
                    Err(e) => log::error!("Backup: failed: {}", e),
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
            // Line item template commands
            commands::get_line_item_templates,
            commands::get_line_item_template,
            commands::create_line_item_template,
            commands::update_line_item_template,
            commands::delete_line_item_template,
            // Backup commands
            commands::get_backup_config,
            commands::set_backup_directory,
            commands::run_backup_now,
            // Managed HID scanner commands (Windows Raw Input filter list)
            commands::get_managed_hid_scanners,
            commands::create_managed_hid_scanner,
            commands::update_managed_hid_scanner,
            commands::delete_managed_hid_scanner,
            commands::list_hid_devices,
            // Diagnosis tag CRUD + medical-record linkage
            commands::get_diagnoses,
            commands::get_diagnosis,
            commands::create_diagnosis,
            commands::update_diagnosis,
            commands::delete_diagnosis,
            commands::get_diagnoses_for_record,
            commands::set_diagnoses_for_record,
            commands::get_diagnoses_for_patient,
        ])
        .run(context)
        .expect("error while running tauri application");
}
