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
    // Pick which "environment" this build reports as. The value flows into
    // log lines (as the `environment` label on Loki streams) so a single
    // Grafana instance can serve events from multiple build types without
    // cross-contamination.
    //
    //   e2e_test:    Running under WDio (TAURI_E2E=1). Events from CI runs
    //                shouldn't pollute production queries.
    //   development: Debug build (`cargo tauri dev`). All the dev-machine
    //                noise stays here.
    //   production:  Release build, not under E2E. This is what installed
    //                binaries report as. Anything serious here is a real
    //                user-facing issue.
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

    // Install a panic hook so any panic — including during early setup,
    // before tauri-plugin-log is fully wired up — gets recorded as an
    // error log line. The line lands in Arkivet.log, where the Loki
    // shipper tails it. If the process crashes immediately we may not
    // flush in time, but on next launch the shipper resumes from the
    // saved offset and ships the panic line then.
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let backtrace = format!("{}", std::backtrace::Backtrace::force_capture());
        services::telemetry::event(
            log::Level::Error,
            "panic",
            &format!("PANIC: {}", info),
            serde_json::json!({
                "location": location,
                "backtrace": backtrace,
            }),
        );
    }));

    // Identify this machine for the `clinic` label on Loki streams. Same
    // resolution order Sentry used to read into its machine_name tag —
    // changed destination, identical data flow:
    //
    //   1. ARKIVET_MACHINE_NAME env var — explicit override, set this
    //      when the OS hostname isn't recognizable (e.g. "DESKTOP-AB12CD34").
    //      Recommended values are short human labels: "Reception PC",
    //      "Surgery Room", "Dev Laptop", "Win Test VM". Set via:
    //        Windows: System Properties → Environment Variables → New
    //                 (Machine scope so the runner-service user inherits)
    //        macOS:   `launchctl setenv ARKIVET_MACHINE_NAME "..."` or
    //                 in your shell rc; remember Tauri inherits the
    //                 launching shell's env.
    //   2. OS hostname — COMPUTERNAME / HOSTNAME / HOST. Always available
    //      so the Loki `clinic` label is never empty.
    //   3. "unknown" — only if all of the above are missing.
    //
    // os_user identifies which OS user account ran the app, useful when
    // a clinic has staff accounts but one machine. Carried as JSON in
    // the startup event below alongside the resolved hostname.
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
    let app_data_dir = tauri::api::path::app_data_dir(context.config());
    let raw_serial_log_dir = app_data_dir.as_ref().map(|d| d.join("raw_serial_logs"));
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

    let log_dirs_to_prune: Vec<std::path::PathBuf> =
        main_log_dir.iter().chain(raw_serial_log_dir.iter()).cloned().collect();

    let (log_rotation_strategy, log_max_file_size) = services::log_rotation::main_log_rotation();

    // For the Loki push when the start fails; `setup` takes the originals.
    let app_version_for_failure = context.package_info().version.to_string();
    let machine_name_for_failure = machine_name.clone();
    let session_dir = app_data_dir.clone();
    let session_dir_for_exit = app_data_dir.clone();

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

    let builder = tauri::Builder::default()
        // First plugin, so a second copy exits before the other plugins start.
        // Two copies would import every device file twice and fight over COM
        // ports; the second launch brings the running window forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if services::app_launch::starts_hidden(&argv) {
                log::info!("Second launch at login: the running copy stays in the tray");
                return;
            }
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            log::info!("Second launch: showed the running window instead");
        }))
        .plugin(Builder::default()
            .targets(log_targets)
            .level(LevelFilter::Info)
            .rotation_strategy(log_rotation_strategy)
            .max_file_size(log_max_file_size)
            .build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(services::app_launch::autostart_args()),
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
                        if let Some(dir) = tauri::api::path::app_data_dir(&app.config()) {
                            services::session_marker::end_session(&dir);
                        }
                        // Unlike std::process::exit, removes the tray icon first.
                        app.exit(0);
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
        .setup(move |app| {
            // App version as the binary reports it at runtime (injected from
            // tauri.conf.json by the release process). This is the ground
            // truth for "which build is this clinic running?" — more reliable
            // than asking staff, and lets us confirm a machine actually took
            // an update. Carried both in the startup event payload (greppable
            // in Arkivet.log) and as a Loki stream label (so Grafana can group
            // clinics by version).
            let app_version = app.package_info().version.to_string();

            // Anchor startup event. Carries the resolved machine identity
            // so any later event in this session can be cross-referenced
            // against "which build ran this?" Captured by the Loki shipper
            // below — but lands in Arkivet.log either way, so it's
            // visible locally even when the shipper is disabled.
            services::telemetry::event(
                services::telemetry::Level::Info,
                "app.lifecycle",
                &format!("Arkivet {app_version} started on {machine_name} (user: {os_user}, env: {environment})"),
                serde_json::json!({
                    "version": app_version,
                    "machine_name": machine_name,
                    "os_user": os_user,
                    "os_hostname": hostname_auto,
                    "environment": environment,
                }),
            );

            if let Some(dir) = session_dir.as_deref() {
                let previous = services::session_marker::begin_session(
                    dir,
                    &app.package_info().version.to_string(),
                    chrono::Utc::now(),
                );
                services::session_marker::report_previous_session(&previous);
            }

            // Re-register launch at login while it is on, so entries made by
            // older versions (no arguments) gain `--hidden`.
            {
                use tauri_plugin_autostart::ManagerExt;
                let autolaunch = app.autolaunch();
                if autolaunch.is_enabled().unwrap_or(false) {
                    if let Err(e) = autolaunch.enable() {
                        log::warn!("Launch at login not updated: {}", e);
                    }
                }
            }

            // Copies of reports and opened attachments older than a day.
            std::thread::spawn(|| {
                let removed = services::temp_cleanup::clean_our_temp_folders(
                    &std::env::temp_dir(),
                    services::temp_cleanup::TEMP_FILE_MAX_AGE,
                );
                log::info!("Temp cleanup: {} old file(s) removed", removed);
            });

            // The start prune ran before the logger; this repeats it daily.
            tauri::async_runtime::spawn(services::log_rotation::run_log_prune_schedule(
                log_dirs_to_prune.clone(),
                30,
            ));

            // Verify the bundled PDF-generator JAR matches this app version.
            // Runs off-thread because it spawns Java (~0.5s) and must not block
            // window setup. Catches the stale-JAR failure mode from the July 2026
            // clinic incident (updated app, un-updated JAR → wrong-unit PDFs for
            // days); logs + ships an ERROR event on mismatch. See
            // services::java_pdf_service::verify_jar_version.
            {
                let jar_check_handle = app.handle();
                std::thread::spawn(move || {
                    services::java_pdf_service::JavaPdfService::verify_jar_version(
                        &jar_check_handle,
                    );
                });
            }

            // Spawn the Loki log shipper. Reads ARKIVET_LOKI_URL/USER/PASSWORD
            // from the environment, falling back to compile-time-baked
            // production credentials. In dev builds without env vars, this
            // is a no-op. See services::loki_shipper for the full design.
            let shipper_config = services::loki_shipper::config_from_env(
                &app.handle(),
                machine_name.clone(),
                environment,
                app_version,
            );
            services::loki_shipper::start(shipper_config);

            // Lets a browser page drive this backend; ARKIVET_DEV_BRIDGE=1 only.
            #[cfg(debug_assertions)]
            services::dev_bridge::start(&app.handle());

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
            // Start in the tray only when launched at login (`--hidden`); a
            // manual start and the relaunch after an update show the window.
            // Never under E2E, so WebDriver can attach to a visible WebView2.
            if let Some(window) = app.get_window("main") {
                fit_to_screen(&window);
            }
            let argv: Vec<String> = std::env::args().collect();
            if services::app_launch::starts_hidden(&argv) && std::env::var("TAURI_E2E").is_err() {
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
                    // A copy to go back to if a migration fails or damages
                    // data. A failed copy is logged; the clinic still starts.
                    let db_path = database::get_database_path(&app.handle())?;
                    match services::backup::backup_before_migrations(&*pool_guard, &db_path, chrono::Local::now()).await {
                        Ok(Some(copy)) => log::info!("Database copied to {} before migrations", copy.display()),
                        Ok(None) => {}
                        Err(e) => log::error!("No database copy before migrations: {}", e),
                    }
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

            // The clinic profile for lab reports made without a database at hand.
            let sea_orm_pool_for_letterhead = sea_orm_pool.clone();
            tauri::async_runtime::spawn(async move {
                match services::settings::SettingsService::get_clinic_profile(&sea_orm_pool_for_letterhead).await {
                    Ok(profile) => services::java_pdf_service::JavaPdfService::set_letterhead(Some(profile)),
                    Err(e) => log::warn!("Clinic profile not loaded for PDFs: {}", e),
                }
            });

            // Backup at start and then on a timer, in the background so a slow
            // or failing backup never blocks boot. See services::backup.
            let sea_orm_pool_for_backup = sea_orm_pool.clone();
            match app.path_resolver().app_data_dir() {
                Some(app_data) => {
                    tauri::async_runtime::spawn(services::backup::run_backup_schedule(
                        app_data,
                        sea_orm_pool_for_backup,
                    ));
                }
                None => log::warn!("Backup: could not resolve app_data_dir, skipping"),
            }

            // Free the disk space of attachments deleted over 30 days ago, at
            // start and daily, in the background. See services::attachment_purge.
            match services::file_storage::FileStorageService::get_storage_dir(&app.handle()) {
                Ok(dir) => {
                    tauri::async_runtime::spawn(services::attachment_purge::run_purge_schedule(
                        dir,
                        sea_orm_pool.clone(),
                    ));
                }
                Err(e) => log::warn!("Attachment purge: no attachment folder, skipping: {}", e),
            }

            // Read lab results attached before lab values were stored one
            // per row. See services::lab_results::backfill.
            match services::file_storage::FileStorageService::get_storage_dir(&app.handle()) {
                Ok(dir) => {
                    tauri::async_runtime::spawn(services::lab_results::run_backfill(dir, sea_orm_pool.clone()));
                }
                Err(e) => log::warn!("Lab values: no attachment folder, skipping backfill: {}", e),
            }

            // Tray tooltip and icon show lab machine health; OS notifications
            // when one is down or quiet too long in clinic hours.
            services::device_health::start_monitor(app.handle(), sea_orm_pool.clone());

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
                            integration.serial_baud_rate,
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
        .invoke_handler(with_debug_commands(tauri::generate_handler![
            // Patient commands
            commands::get_patients,
            commands::get_patient,
            commands::create_patient,
            commands::update_patient,
            commands::delete_patient,
            commands::search_patients,
            commands::mark_patient_deceased,
            commands::mark_patient_inactive,
            commands::reactivate_patient,
            commands::add_patient_alert,
            commands::update_patient_alert,
            commands::delete_patient_alert,
            commands::get_patient_weights,
            commands::add_patient_weight,
            commands::delete_patient_weight,
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
            commands::add_person_to_household,
            commands::update_person,
            commands::delete_person,
            commands::update_person_contacts,
            commands::get_household_patients,
            commands::link_patient_to_household,
            commands::unlink_patient_from_household,
            commands::update_patient_household,
            commands::set_primary_person,
            commands::get_household_merge_preview,
            commands::merge_households,
            commands::find_household_duplicates,
            // Medical history commands
            commands::get_medical_records,
            commands::get_medical_record,
            commands::create_medical_record,
            commands::update_medical_record,
            commands::regenerate_record_document,
            commands::archive_medical_record,
            commands::upload_medical_attachment,
            commands::download_medical_attachment,
            commands::delete_medical_attachment,
            commands::get_attachment_content,
            commands::search_medical_records,
            commands::get_currencies,
            commands::get_medical_record_at_version,
            commands::write_medical_attachment_to_path,
            commands::open_medical_attachment,
            commands::print_medical_attachment,
            commands::render_medical_attachment_pdf_thumbnail,
            commands::render_medical_attachment_pdf_thumbnail_force,
            commands::get_medical_attachment_pdf_page_count,
            commands::regenerate_pdf_from_medical_record,
            commands::generate_configured_report,
            // Record template commands
            commands::get_record_templates,
            commands::search_record_templates,
            commands::create_record_template,
            commands::update_record_template,
            commands::delete_record_template,
            commands::get_last_record_for_copy,
            // Settings commands
            commands::get_app_settings,
            commands::update_app_settings,
            commands::get_clinic_profile,
            commands::update_clinic_profile,
            commands::set_clinic_logo,
            commands::remove_clinic_logo,
            commands::get_clinic_logo,
            commands::get_tax_rates,
            commands::create_tax_rate,
            commands::update_tax_rate,
            commands::calculate_invoice_totals,
            commands::get_record_invoice_totals,
            // Note: get_currencies is already registered above for medical
            // Database commands
            // View preference commands
            commands::get_view_preference,
            commands::set_view_preference,
            // Stats commands
            // App header search and the dashboard Today strip
            commands::global_patient_search,
            commands::count_patients_seen,
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
            commands::reconnect_device_listeners,
            commands::list_serial_port_names,
            commands::get_device_connection_statuses,
            commands::get_file_watcher_statuses,
            // Device health: details drawer, diagnostics, notification settings
            commands::get_device_details,
            commands::get_results_today,
            commands::get_device_diagnostics,
            commands::open_device_log_folder,
            commands::get_device_alert_settings,
            commands::update_device_alert_settings,
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
            commands::open_device_file,
            commands::get_device_data_from_history,
            // Lab inbox
            commands::list_lab_inbox,
            commands::get_lab_inbox_count,
            commands::preview_lab_values,
            commands::discard_lab_result,
            commands::restore_lab_result,
            commands::attach_lab_result,
            commands::move_lab_result,
            // Lab values (Labs tab, record page)
            commands::get_patient_lab_results,
            commands::get_record_lab_values,
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
            // Bridges React-side telemetry (ErrorBoundary, invoke wrapper)
            // into Rust's structured logger so frontend events flow through
            // the same Arkivet.log → Loki pipeline.
            commands::log_event,
        ]));

    #[cfg(debug_assertions)]
    let builder = builder.on_page_load(services::dev_bridge::on_page_load);

    let build_result = builder.build(context);

    // A setup error (database won't open, migration fails) or a plugin that
    // can't start lands here. The window may be hidden, so without this the
    // app would just vanish.
    match build_result {
        Ok(app) => app.run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(dir) = session_dir_for_exit.as_deref() {
                    services::session_marker::end_session(dir);
                }
            }
        }),
        Err(e) => {
            let shipper = match (main_log_dir.clone(), app_data_dir.as_deref()) {
                (Some(log_dir), Some(data_dir)) => services::loki_shipper::config_from_env_and_dirs(
                    machine_name_for_failure,
                    environment,
                    app_version_for_failure,
                    log_dir,
                    data_dir,
                ),
                _ => None,
            };
            services::startup_failure::report(
                &e.to_string(),
                main_log_dir.as_deref(),
                app_data_dir.as_deref(),
                shipper,
            );
            std::process::exit(1);
        }
    }
}

/// Database reset/wipe/populate and the device simulator exist only in
/// debug builds; a release webview cannot reach them.
#[cfg(debug_assertions)]
const DEBUG_ONLY_COMMANDS: &[&str] = &[
    "debug_database_info",
    "reset_database",
    "wipe_database_data",
    "populate_database",
    "get_virtual_port_status",
    "start_virtual_ports",
    "stop_virtual_ports",
    "send_test_healvet",
    "send_test_pointcare",
    "send_test_pcr",
    "send_test_exigo",
    "dev_bridge_reply",
    "dev_bridge_event",
];

#[cfg(debug_assertions)]
fn with_debug_commands(
    app_handler: impl Fn(tauri::Invoke) + Send + Sync + 'static,
) -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
    let debug_handler: Box<dyn Fn(tauri::Invoke) + Send + Sync> = Box::new(tauri::generate_handler![
        commands::debug_database_info,
        commands::reset_database,
        commands::wipe_database_data,
        commands::populate_database,
        commands::get_virtual_port_status,
        commands::start_virtual_ports,
        commands::stop_virtual_ports,
        commands::send_test_healvet,
        commands::send_test_pointcare,
        commands::send_test_pcr,
        commands::send_test_exigo,
        commands::dev_bridge_reply,
        commands::dev_bridge_event,
    ]);
    move |invoke: tauri::Invoke| {
        if DEBUG_ONLY_COMMANDS.contains(&invoke.message.command()) {
            debug_handler(invoke)
        } else {
            app_handler(invoke)
        }
    }
}

#[cfg(not(debug_assertions))]
fn with_debug_commands(
    app_handler: impl Fn(tauri::Invoke) + Send + Sync + 'static,
) -> impl Fn(tauri::Invoke) + Send + Sync + 'static {
    app_handler
}

/// A small screen (1366×768 laptop) can't hold the window; maximize it so
/// nothing sits off the screen or under the taskbar.
fn fit_to_screen(window: &tauri::Window) {
    let (Ok(Some(monitor)), Ok(size), Ok(scale)) = (window.current_monitor(), window.outer_size(), window.scale_factor()) else {
        return;
    };
    let logical = |w: u32, h: u32| ((w as f64 / scale) as u32, (h as f64 / scale) as u32);
    let screen = logical(monitor.size().width, monitor.size().height);
    let own = logical(size.width, size.height);
    if services::app_launch::overflows_screen(own, screen) {
        log::info!("Window {}x{} does not fit the {}x{} screen; maximizing", own.0, own.1, screen.0, screen.1);
        let _ = window.maximize();
    }
}
