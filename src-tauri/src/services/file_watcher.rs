use notify::{Watcher, RecursiveMode, Event, Result as NotifyResult, EventKind};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use glob::Pattern;
use sqlx::{SqlitePool, Row};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use serde::{Serialize, Deserialize};
use crate::services::device_parser::DeviceParserService;
use crate::services::file_storage::FileStorageService;
use crate::commands::file_history::record_device_file_access_internal;

// Track connection status for file watchers
static FILE_WATCHER_STATUS: OnceLock<Mutex<HashMap<i64, FileWatcherStatus>>> = OnceLock::new();

fn get_file_watcher_status() -> &'static Mutex<HashMap<i64, FileWatcherStatus>> {
    FILE_WATCHER_STATUS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FileWatcherStatus {
    pub integration_id: i64,
    pub name: String,
    pub watch_directory: String,
    pub status: FileWatcherState,
    pub last_error: Option<String>,
    pub files_processed: u32,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub enum FileWatcherState {
    Watching,
    Error,
    Stopped,
}

/// Update file watcher status and emit event to frontend
fn update_file_watcher_status(
    app_handle: Option<&tauri::AppHandle>,
    integration_id: i64,
    name: &str,
    watch_directory: &str,
    status: FileWatcherState,
    error: Option<String>,
) {
    log::info!("📂 File watcher status update - Integration ID: {}, Name: {}, Directory: {}, Status: {:?}",
        integration_id, name, watch_directory, status);

    if let Some(ref err) = error {
        log::error!("❌ File watcher error for '{}' ({}): {}", name, watch_directory, err);
    }

    let watcher_status = FileWatcherStatus {
        integration_id,
        name: name.to_string(),
        watch_directory: watch_directory.to_string(),
        status: status.clone(),
        last_error: error,
        files_processed: 0,
    };

    // Store in global state
    {
        let mut statuses = get_file_watcher_status().lock().unwrap();
        statuses.insert(integration_id, watcher_status.clone());
        log::info!("💾 Stored file watcher status. Total active watchers: {}", statuses.len());
    }

    // Emit to frontend
    if let Some(handle) = app_handle {
        match handle.emit_all("file-watcher-status", &watcher_status) {
            Ok(_) => log::info!("📡 Emitted file-watcher-status event to frontend for '{}'", name),
            Err(e) => log::error!("❌ Failed to emit file-watcher-status event: {}", e),
        }
    }
}

/// Get all file watcher statuses
pub fn get_all_file_watcher_statuses() -> Vec<FileWatcherStatus> {
    let statuses = get_file_watcher_status().lock().unwrap();
    statuses.values().cloned().collect()
}

/// Remove file watcher status when stopped
#[allow(dead_code)]
fn remove_file_watcher_status(integration_id: i64) {
    let mut statuses = get_file_watcher_status().lock().unwrap();
    statuses.remove(&integration_id);
}

pub struct FileWatcherService {
    pool: SqlitePool,
    watchers: HashMap<i64, notify::RecommendedWatcher>,
    app_handle: Option<tauri::AppHandle>,
}

impl FileWatcherService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            watchers: HashMap::new(),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, app_handle: tauri::AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Initialize file watchers for all enabled file-watch device integrations
    pub async fn initialize(&mut self) -> Result<(), String> {
        log::info!("🔍 Initializing file watchers for enabled device integrations...");

        // Query all enabled file-watch device integrations
        let integrations = sqlx::query(
            "SELECT id, name, watch_directory, file_pattern, device_type
             FROM device_integrations
             WHERE connection_type = 'file_watch'
               AND enabled = 1
               AND deleted_at IS NULL"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            let error_msg = format!("Failed to query device integrations: {}", e);
            log::error!("❌ {}", error_msg);
            error_msg
        })?;

        if integrations.is_empty() {
            log::info!("ℹ️  No enabled file-watch integrations found");
            return Ok(());
        }

        log::info!("📋 Found {} enabled file-watch integration(s)", integrations.len());

        // Set up watcher for each integration
        for row in integrations {
            let id: i64 = row.get("id");
            let name: String = row.get("name");
            let watch_directory: Option<String> = row.get("watch_directory");
            let file_pattern: Option<String> = row.get("file_pattern");
            let device_type: String = row.get("device_type");

            log::info!("   📂 Setting up file watcher - ID: {}, Name: '{}', Device: {}",
                id, name, device_type);

            match (watch_directory, file_pattern) {
                (Some(dir), Some(pattern)) => {
                    log::info!("      Directory: {}, Pattern: {}", dir, pattern);
                    if let Err(e) = self.setup_watcher(id, &name, &dir, &pattern, &device_type).await {
                        log::error!("      ❌ Failed to setup watcher for '{}': {}", name, e);
                    } else {
                        log::info!("      ✅ Watcher setup successful for '{}'", name);
                    }
                }
                _ => {
                    log::warn!("      ⚠️  Integration '{}' missing watch_directory or file_pattern", name);
                }
            }
        }

        log::info!("✅ File watcher initialization complete");
        Ok(())
    }

    async fn setup_watcher(
        &mut self,
        id: i64,
        name: &str,
        directory: &str,
        pattern: &str,
        device_type: &str,
    ) -> Result<(), String> {
        log::info!("⚙️  Setting up file watcher - Integration ID: {}, Name: '{}', Device: {}",
            id, name, device_type);
        log::info!("   📂 Directory: {}", directory);
        log::info!("   🔍 Pattern: {}", pattern);

        let dir_path = PathBuf::from(directory);

        // Check if directory exists
        if !dir_path.exists() {
            let error_msg = format!("Directory does not exist: {}", directory);
            log::error!("❌ File watcher setup failed for '{}': {}", name, error_msg);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        if !dir_path.is_dir() {
            let error_msg = format!("Path is not a directory: {}", directory);
            log::error!("❌ File watcher setup failed for '{}': {}", name, error_msg);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        log::info!("   ✅ Directory validated successfully");

        // Create channel for file events
        let (_tx, _rx) = channel::<NotifyResult<Event>>();

        log::info!("   🔨 Compiling glob pattern: {}", pattern);

        // Compile glob pattern
        let glob_pattern = Pattern::new(pattern)
            .map_err(|e| {
                let error_msg = format!("Invalid glob pattern '{}': {}", pattern, e);
                log::error!("❌ Pattern compilation failed for '{}': {}", name, error_msg);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        log::info!("   ✅ Glob pattern compiled successfully");

        // Clone values for the watcher closure
        let name_clone = name.to_string();
        let device_type_clone = device_type.to_string();
        let _dir_clone = directory.to_string();
        let app_handle_clone = self.app_handle.clone();
        let pool_clone = self.pool.clone();

        // Create a deduplication cache (file path -> last processed timestamp)
        let processed_files: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));
        let processed_files_clone = processed_files.clone();

        log::info!("   🎧 Creating file system watcher for '{}'", name);

        // Create watcher
        let mut watcher = notify::recommended_watcher(move |res: NotifyResult<Event>| {
            match res {
                Ok(event) => {
                    // Process file creation AND modify events
                    // Note: On Windows, the notify crate reports CreateKind::Any for all file creations
                    // due to limitations in the ReadDirectoryChangesW API. Some editors also trigger
                    // Modify events instead of Create events when saving new files.
                    // See: https://github.com/notify-rs/notify/issues/261
                    if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        log::info!("📁 File event detected for '{}' - Event type: {:?}, Paths: {}",
                            name_clone, event.kind, event.paths.len());

                        for path in event.paths {
                            log::info!("   🔍 Processing path: {}", path.display());

                            if let Some(file_name) = path.file_name() {
                                let file_name_str = file_name.to_string_lossy().to_string();

                                // Check if file matches pattern
                                if glob_pattern.matches(&file_name_str) {
                                    log::info!("   ✅ File matches pattern: {}", file_name_str);
                                    // Get current timestamp
                                    let now = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .unwrap()
                                        .as_secs();

                                    let path_str = path.display().to_string();

                                    // Check if we recently processed this file (within 5 seconds)
                                    let should_skip = {
                                        let cache = processed_files_clone.lock().unwrap();
                                        if let Some(&last_processed) = cache.get(&path_str) {
                                            if now - last_processed < 5 {
                                                log::info!("   ⏭️  Skipping {} - processed {} seconds ago (deduplication)",
                                                    file_name_str, now - last_processed);
                                                true
                                            } else {
                                                false
                                            }
                                        } else {
                                            false
                                        }
                                    };

                                    if should_skip {
                                        continue;
                                    }

                                    log::info!("   📖 Reading file: {}", path.display());

                                    // Read and parse the file
                                    match std::fs::read(&path) {
                                        Ok(file_data) => {
                                            log::info!("   ✅ File read successfully - Size: {} bytes", file_data.len());
                                            log::info!("   🔍 Parsing file data - Device: {}, Name: '{}'",
                                                device_type_clone, name_clone);

                                            // Parse the file based on device type
                                            match DeviceParserService::parse_device_data(
                                                &device_type_clone,
                                                &name_clone,
                                                &file_name_str,
                                                &file_data,
                                                "file_watch",
                                            ) {
                                                Ok(device_data) => {
                                                    log::info!("   ✅ File parsed successfully - Patient ID: {:?}, File: {}",
                                                        device_data.patient_identifier, file_name_str);

                                                    // Emit device data to frontend
                                                    if let Some(ref app_handle) = app_handle_clone {
                                                        match app_handle.emit_all("device-data-received", &device_data) {
                                                            Ok(_) => {
                                                                log::info!("   📡 Emitted device-data-received event for '{}'", name_clone);

                                                                // Update cache AFTER successful emission to prevent duplicate processing
                                                                let mut cache = processed_files_clone.lock().unwrap();
                                                                cache.insert(path_str.clone(), now);
                                                                log::info!("   📝 Updated deduplication cache for {}", file_name_str);
                                                                // Clean up old entries (older than 30 seconds)
                                                                cache.retain(|_, &mut timestamp| now - timestamp < 30);
                                                            }
                                                            Err(e) => log::error!("   ❌ Failed to emit event for '{}': {}", name_clone, e),
                                                        }

                                                        log::info!("   💾 Starting async file save and tracking for {}", file_name_str);

                                                        // Save file and track access (async)
                                                        let app_handle_track = app_handle.clone();
                                                        let pool_track = pool_clone.clone();
                                                        let file_name_track = file_name_str.clone();
                                                        let file_data_track = file_data.clone();
                                                        let device_type_track = device_type_clone.clone();
                                                        let device_name_track = name_clone.clone();
                                                        let mime_type_track = device_data.mime_type.clone();

                                                        tauri::async_runtime::spawn(async move {
                                                            // Save file to storage
                                                            match FileStorageService::save_device_file(&app_handle_track, &file_name_track, &file_data_track) {
                                                                Ok((file_id, file_path)) => {
                                                                    log::info!("   ✅ File saved - ID: {}, Path: {}", file_id, file_path);

                                                                    // Track file access
                                                                    let file_size = file_data_track.len() as i64;
                                                                    log::info!("   📊 Recording file access - Size: {} bytes", file_size);

                                                                    if let Err(e) = record_device_file_access_internal(
                                                                        &pool_track,
                                                                        file_id,
                                                                        file_name_track.clone(),
                                                                        file_path,
                                                                        Some(file_size),
                                                                        Some(mime_type_track),
                                                                        device_type_track,
                                                                        device_name_track,
                                                                        Some("file_watch".to_string()),
                                                                    ).await {
                                                                        log::error!("   ❌ Failed to record file access for {}: {}", file_name_track, e);
                                                                    } else {
                                                                        log::info!("   ✅ File access recorded for {}", file_name_track);
                                                                    }
                                                                }
                                                                Err(e) => {
                                                                    log::error!("   ❌ Failed to save device file {}: {}", file_name_track, e);
                                                                }
                                                            }
                                                        });
                                                    }
                                                }
                                                Err(e) => {
                                                    log::error!("   ❌ Failed to parse file {} for '{}': {}", file_name_str, name_clone, e);
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            log::error!("   ❌ Failed to read file {}: {}", path.display(), e);
                                        }
                                    }
                                } else {
                                    log::info!("   ⏭️  File does not match pattern: {}", file_name_str);
                                }
                            }
                        }
                    }
                }
                Err(e) => log::error!("❌ Watch error for '{}': {:?}", name_clone, e),
            }
        })
        .map_err(|e| {
            let error_msg = format!("Failed to create watcher: {}", e);
            log::error!("❌ {}", error_msg);
            error_msg
        })?;

        log::info!("   👀 Starting directory watch for: {}", directory);

        // Start watching the directory
        watcher.watch(&dir_path, RecursiveMode::NonRecursive)
            .map_err(|e| {
                let error_msg = format!("Failed to watch directory: {}", e);
                log::error!("❌ Failed to start watching directory for '{}': {}", name, error_msg);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        log::info!("   ✅ Directory watch active for: {}", directory);

        // Store watcher
        self.watchers.insert(id, watcher);
        log::info!("   📝 Watcher stored. Total active watchers: {}", self.watchers.len());

        // Update status to watching
        update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Watching, None);

        log::info!("✅ File watcher setup complete for '{}' (Integration ID: {})", name, id);

        Ok(())
    }

    /// Reload watchers (useful when device integrations are updated)
    #[allow(dead_code)]
    pub async fn reload(&mut self) -> Result<(), String> {
        // Clear existing watchers
        self.watchers.clear();

        // Re-initialize
        self.initialize().await
    }

    #[allow(dead_code)]
    pub fn active_watcher_count(&self) -> usize {
        self.watchers.len()
    }
}
