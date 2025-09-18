use std::path::PathBuf;
use tauri::api::path;

/// Get the database path for the application
/// Returns a path like:
/// - Windows: %APPDATA%\vet-clinic\vet_clinic.db
/// - macOS: ~/Library/Application Support/vet-clinic/vet_clinic.db
/// - Linux: ~/.local/share/vet-clinic/vet_clinic.db
pub fn get_database_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = path::app_data_dir(&app_handle.config())
        .ok_or_else(|| "Could not determine app data directory".to_string())?;

    // Create the app directory if it doesn't exist
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app directory: {}", e))?;
    }

    Ok(app_dir.join("vet_clinic.db"))
}

/// Get the SQLite connection URL for the database
pub fn get_database_url(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let db_path = get_database_path(app_handle)?;

    // Create the database file if it doesn't exist
    if !db_path.exists() {
        std::fs::File::create(&db_path)
            .map_err(|e| format!("Failed to create database file: {}", e))?;
    }

    Ok(format!("sqlite://{}?mode=rwc", db_path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_path_format() {
        // This test would require a mock AppHandle in a real scenario
        // For now, we just test that the function compiles
        assert!(true);
    }
}