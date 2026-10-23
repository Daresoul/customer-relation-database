//! What the app does when it cannot start (database won't open, a
//! migration fails, a plugin can't initialise): log it, tell the user in a
//! native dialog, exit. The window is hidden at that point, so without the
//! dialog the app would just vanish.

use std::path::Path;

/// The dialog text, in English and Macedonian.
pub fn startup_failure_message(error: &str, log_dir: Option<&Path>, backup_dir: Option<&str>) -> String {
    let log_dir = log_dir
        .map(|d| d.display().to_string())
        .unwrap_or_else(|| "?".to_string());
    let (backup_en, backup_mk) = match backup_dir {
        Some(dir) => (
            format!("Backups are in: {dir}"),
            format!("Резервните копии се во: {dir}"),
        ),
        None => (
            "No backup folder is set.".to_string(),
            "Не е поставена папка за резервни копии.".to_string(),
        ),
    };
    format!(
        "Arkivet could not start.\n\
         {error}\n\n\
         The log file is in: {log_dir}\n\
         {backup_en}\n\
         Please call support and read them this message.\n\n\
         ----------\n\n\
         Arkivet не може да се стартува.\n\
         {error}\n\n\
         Дневникот (log) е во: {log_dir}\n\
         {backup_mk}\n\
         Ве молиме јавете се на техничка поддршка и прочитајте им ја оваа порака."
    )
}

/// Log the failure, push the log to Loki (at most 5 s; nothing when Loki is
/// not set up), show it in a native dialog, and return. The caller exits.
///
/// Runs on the main thread after `tauri::Builder::run` returned, so it uses
/// `rfd` directly: Tauri's dialog helpers hop to another thread and wait,
/// which can deadlock on macOS when the main thread is the one waiting.
pub fn report(
    error: &str,
    log_dir: Option<&Path>,
    app_data_dir: Option<&Path>,
    shipper: Option<crate::services::loki_shipper::ShipperConfig>,
) {
    crate::services::telemetry::event(
        log::Level::Error,
        "app.lifecycle",
        &format!("Startup failed: {error}"),
        serde_json::json!({ "failure": "startup", "error": error }),
    );
    log::logger().flush();
    eprintln!("Startup failed: {error}");
    crate::services::loki_shipper::push_pending_now(shipper, std::time::Duration::from_secs(5));

    let backup_dir = app_data_dir
        .and_then(|d| crate::services::backup::BackupService::load_config(d).directory);
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("Arkivet")
        .set_description(&startup_failure_message(error, log_dir, backup_dir.as_deref()))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_has_the_error_in_both_languages() {
        let msg = startup_failure_message("Failed to run migrations: boom", None, None);
        assert!(msg.contains("Failed to run migrations: boom"));
        assert!(msg.contains("Arkivet could not start"));
        assert!(msg.contains("Arkivet не може да се стартува"));
    }

    #[test]
    fn message_names_the_log_and_backup_folders() {
        let log_dir = Path::new("C:/Users/x/AppData/Roaming/vet/logs");
        let msg = startup_failure_message("boom", Some(log_dir), Some("D:/Backups"));
        assert!(msg.contains(&log_dir.display().to_string()));
        assert!(msg.contains("D:/Backups"));
    }

    #[test]
    fn message_says_when_no_backup_folder_is_set() {
        let msg = startup_failure_message("boom", None, None);
        assert!(msg.contains("No backup folder is set"));
        assert!(msg.contains("Не е поставена папка за резервни копии"));
    }
}
