use notify::{Watcher, RecursiveMode, Event, Result as NotifyResult, EventKind};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use glob::Pattern;
use sqlx::{SqlitePool, Row};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use crate::services::device_parser::DeviceParserService;
use crate::services::device_pdf_service::{DevicePdfService, PatientData, DeviceTestData};
use chrono::Utc;
use serde_json;

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
        println!("🔍 Initializing file watchers...");

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
            println!("ℹ️  No file-watch integrations configured");
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
                        eprintln!("⚠️  Failed to setup watcher for '{}': {}", name, e);
                    }
                }
                _ => {
                    println!("⚠️  Device integration '{}' missing watch_directory or file_pattern", name);
                }
            }
        }

        println!("✅ File watchers initialized ({} active)", self.watchers.len());
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
            return Err(format!("Directory does not exist: {}", directory));
        }

        if !dir_path.is_dir() {
            return Err(format!("Path is not a directory: {}", directory));
        }

        // Create channel for file events
        let (tx, rx) = channel::<NotifyResult<Event>>();

        // Compile glob pattern
        let glob_pattern = Pattern::new(pattern)
            .map_err(|e| format!("Invalid glob pattern '{}': {}", pattern, e))?;

        // Clone values for the watcher closure
        let name_clone = name.to_string();
        let device_type_clone = device_type.to_string();
        let dir_clone = directory.to_string();
        let app_handle_clone = self.app_handle.clone();

        // Create a deduplication cache (file path -> last processed timestamp)
        let processed_files: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));
        let processed_files_clone = processed_files.clone();

        // Create watcher
        let mut watcher = notify::recommended_watcher(move |res: NotifyResult<Event>| {
            match res {
                Ok(event) => {
                    // Only process file creation events
                    if matches!(event.kind, EventKind::Create(_)) {
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
                                                println!("⏭️  [{}] Skipping duplicate event for: {}", name_clone, file_name_str);
                                                continue;
                                            }
                                        }

                                        // Update cache with current timestamp
                                        cache.insert(path_str.clone(), now);

                                        // Clean up old entries (older than 30 seconds)
                                        cache.retain(|_, &mut timestamp| now - timestamp < 30);
                                    }

                                    println!("📄 [{}] New file detected: {}", name_clone, path.display());
                                    println!("   Device Type: {}", device_type_clone);
                                    println!("   Directory: {}", dir_clone);
                                    println!("   Pattern: {}", glob_pattern.as_str());

                                    // Read and parse the file
                                    match std::fs::read(&path) {
                                        Ok(file_data) => {
                                            println!("   File size: {} bytes", file_data.len());

                                            // Parse the file based on device type
                                            match DeviceParserService::parse_device_data(
                                                &device_type_clone,
                                                &name_clone,
                                                &file_name_str,
                                                &file_data,
                                                "file_watch",
                                            ) {
                                                Ok(device_data) => {
                                                    println!("   ✅ Parsed successfully");
                                                    if let Some(ref patient_id) = device_data.patient_identifier {
                                                        println!("   Patient ID: {}", patient_id);
                                                    }

                                                    // Emit original device data to frontend
                                                    if let Some(ref app_handle) = app_handle_clone {
                                                        if let Err(e) = app_handle.emit_all("device-data-received", &device_data) {
                                                            eprintln!("   ❌ Failed to emit event: {}", e);
                                                        } else {
                                                            println!("   📤 Event emitted to frontend (original data)");
                                                        }
                                                    }

                                                    // Auto-generate PDF report and send as separate file
                                                    let pdf_result = Self::generate_and_emit_pdf(&device_data, &name_clone, &app_handle_clone);
                                                    match pdf_result {
                                                        Ok(pdf_path) => {
                                                            println!("   📄 PDF generated and emitted: {}", pdf_path);
                                                        }
                                                        Err(e) => {
                                                            eprintln!("   ⚠️  Failed to generate/emit PDF: {}", e);
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!("   ❌ Failed to parse file: {}", e);
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("   ❌ Failed to read file: {}", e);
                                        }
                                    }

                                    println!("   ---");
                                }
                            }
                        }
                    }
                }
                Err(e) => eprintln!("❌ Watch error for '{}': {:?}", name_clone, e),
            }
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        // Start watching the directory
        watcher.watch(&dir_path, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {}", e))?;

        // Store watcher
        self.watchers.insert(id, watcher);

        println!("👁️  Watching: {} [{}] - Pattern: {}", directory, name, pattern);

        Ok(())
    }

    /// Reload watchers (useful when device integrations are updated)
    pub async fn reload(&mut self) -> Result<(), String> {
        println!("🔄 Reloading file watchers...");

        // Clear existing watchers
        self.watchers.clear();

        // Re-initialize
        self.initialize().await
    }

    pub fn active_watcher_count(&self) -> usize {
        self.watchers.len()
    }

    /// Generate a PDF report from device data and emit it as a new device file
    fn generate_and_emit_pdf(
        device_data: &crate::services::device_parser::DeviceData,
        device_name: &str,
        app_handle: &Option<tauri::AppHandle>,
    ) -> Result<String, String> {
        // Create reports directory
        let reports_dir = Self::get_reports_directory()?;
        std::fs::create_dir_all(&reports_dir)
            .map_err(|e| format!("Failed to create reports directory: {}", e))?;

        // Generate unique filename with timestamp
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let safe_device_name = device_name.replace(" ", "_").replace("/", "_");
        let filename = format!("{}_{}.pdf", safe_device_name, timestamp);
        let pdf_path = reports_dir.join(&filename);

        // Create patient data (generic, since we don't have full patient data yet)
        let patient_data = PatientData {
            name: device_data.patient_identifier.clone()
                .unwrap_or_else(|| "Unknown Patient".to_string()),
            owner: "To Be Determined".to_string(),
            species: "Unknown".to_string(),
            microchip_id: device_data.patient_identifier.clone(),
            gender: "Unknown".to_string(),
            date_of_birth: None,
        };

        // Create device test data
        let test_data = DeviceTestData {
            device_type: device_data.device_type.clone(),
            device_name: device_data.device_name.clone(),
            test_results: device_data.test_results.clone(),
            detected_at: device_data.detected_at,
            patient_identifier: device_data.patient_identifier.clone(),
        };

        // Generate PDF using centralized service (single source of truth)
        DevicePdfService::generate_pdf(
            pdf_path.to_str().ok_or("Invalid PDF path")?,
            patient_data,
            test_data,
        )?;

        // Read the generated PDF file
        let pdf_bytes = std::fs::read(&pdf_path)
            .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

        // Create a new DeviceData for the PDF file
        let pdf_device_data = crate::services::device_parser::DeviceData {
            device_type: format!("{}_report", device_data.device_type),
            device_name: format!("{} Report", device_data.device_name),
            connection_method: device_data.connection_method.clone(),
            patient_identifier: device_data.patient_identifier.clone(),
            test_results: serde_json::json!({"report_type": "auto_generated_pdf"}),
            original_file_name: filename.clone(),
            file_data: pdf_bytes,
            mime_type: "application/pdf".to_string(),
            detected_at: Utc::now(),
        };

        // Emit PDF as a separate device file
        if let Some(ref handle) = app_handle {
            if let Err(e) = handle.emit_all("device-data-received", &pdf_device_data) {
                eprintln!("   ❌ Failed to emit PDF event: {}", e);
            } else {
                println!("   📤 PDF file emitted to frontend");
            }
        }

        Ok(pdf_path.display().to_string())
    }

    /// Get the reports directory path (in user's Documents or app data directory)
    fn get_reports_directory() -> Result<PathBuf, String> {
        // Try to use Documents directory first
        if let Some(docs_dir) = dirs::document_dir() {
            return Ok(docs_dir.join("VetClinic").join("DeviceReports"));
        }

        // Fallback to app data directory
        if let Some(data_dir) = dirs::data_local_dir() {
            return Ok(data_dir.join("VetClinic").join("DeviceReports"));
        }

        // Last resort: current directory
        Ok(PathBuf::from("./device_reports"))
    }
}
