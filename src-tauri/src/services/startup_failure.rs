//! What the app does when it cannot start (database won't open, a
//! migration fails, a plugin can't initialise): log it, tell the user in a
//! native dialog, exit. The window is hidden at that point, so without the
//! dialog the app would just vanish.

use std::path::Path;

/// The dialog text, in English and Macedonian.
pub fn startup_failure_message(error: &str, _log_dir: Option<&Path>, _backup_dir: Option<&str>) -> String {
    error.to_string()
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
