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
    }

    // Emit to frontend
    if let Some(handle) = app_handle {
        let _ = handle.emit_all("file-watcher-status", &watcher_status);
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
        .map_err(|e| format!("Failed to query device integrations: {}", e))?;

        if integrations.is_empty() {
            return Ok(());
        }

        // Set up watcher for each integration
        for row in integrations {
            let id: i64 = row.get("id");
            let name: String = row.get("name");
            let watch_directory: Option<String> = row.get("watch_directory");
            let file_pattern: Option<String> = row.get("file_pattern");
            let device_type: String = row.get("device_type");

            match (watch_directory, file_pattern) {
                (Some(dir), Some(pattern)) => {
                    if let Err(e) = self.setup_watcher(id, &name, &dir, &pattern, &device_type).await {
                        eprintln!("Failed to setup watcher for '{}': {}", name, e);
                    }
                }
                _ => {}
            }
        }

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
        let dir_path = PathBuf::from(directory);

        // Check if directory exists
        if !dir_path.exists() {
            let error_msg = format!("Directory does not exist: {}", directory);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        if !dir_path.is_dir() {
            let error_msg = format!("Path is not a directory: {}", directory);
            update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
            return Err(error_msg);
        }

        // Create channel for file events
        let (_tx, _rx) = channel::<NotifyResult<Event>>();

        // Compile glob pattern
        let glob_pattern = Pattern::new(pattern)
            .map_err(|e| {
                let error_msg = format!("Invalid glob pattern '{}': {}", pattern, e);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        // Clone values for the watcher closure
        let name_clone = name.to_string();
        let device_type_clone = device_type.to_string();
        let _dir_clone = directory.to_string();
        let app_handle_clone = self.app_handle.clone();

        // Create a deduplication cache (file path -> last processed timestamp)
        let processed_files: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));
        let processed_files_clone = processed_files.clone();

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
                        for path in event.paths {
                            if let Some(file_name) = path.file_name() {
                                let file_name_str = file_name.to_string_lossy().to_string();

                                // Check if file matches pattern
                                if glob_pattern.matches(&file_name_str) {
                                    // Get current timestamp
                                    let now = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .unwrap()
                                        .as_secs();

                                    let path_str = path.display().to_string();

                                    // Check if we recently processed this file (within 5 seconds)
                                    {
                                        let mut cache = processed_files_clone.lock().unwrap();

                                        if let Some(&last_processed) = cache.get(&path_str) {
                                            if now - last_processed < 5 {
                                                continue;
                                            }
                                        }

                                        // Update cache with current timestamp
                                        cache.insert(path_str.clone(), now);

                                        // Clean up old entries (older than 30 seconds)
                                        cache.retain(|_, &mut timestamp| now - timestamp < 30);
                                    }

                                    // Read and parse the file
                                    match std::fs::read(&path) {
                                        Ok(file_data) => {
                                            // Parse the file based on device type
                                            match DeviceParserService::parse_device_data(
                                                &device_type_clone,
                                                &name_clone,
                                                &file_name_str,
                                                &file_data,
                                                "file_watch",
                                            ) {
                                                Ok(device_data) => {
                                                    // Emit device data to frontend
                                                    if let Some(ref app_handle) = app_handle_clone {
                                                        if let Err(e) = app_handle.emit_all("device-data-received", &device_data) {
                                                            eprintln!("Failed to emit event: {}", e);
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!("Failed to parse file: {}", e);
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Failed to read file: {}", e);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => eprintln!("Watch error for '{}': {:?}", name_clone, e),
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        // Start watching the directory
        watcher.watch(&dir_path, RecursiveMode::NonRecursive)
            .map_err(|e| {
                let error_msg = format!("Failed to watch directory: {}", e);
                update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Error, Some(error_msg.clone()));
                error_msg
            })?;

        // Store watcher
        self.watchers.insert(id, watcher);

        // Update status to watching
        update_file_watcher_status(self.app_handle.as_ref(), id, name, directory, FileWatcherState::Watching, None);

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
