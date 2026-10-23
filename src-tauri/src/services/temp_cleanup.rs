//! Reports, invoices, lab PDFs and opened attachments are written to
//! folders in the system temp folder and never removed, so client documents
//! pile up there. At start the app deletes files older than a day in its own
//! folders, and nothing else.

use std::path::Path;
use std::time::{Duration, SystemTime};

/// The temp subfolders the app writes. Files written loose into the temp
/// folder itself are left alone: their names can't be told apart safely.
pub const OUR_TEMP_FOLDERS: &[&str] = &[
    "simple_reports",
    "pharmacy_notes",
    "invoices",
    "device_reports",
    "arkivet-pdf-jobs",
    "vet-clinic-attachments",
    "vet-clinic-device-files",
];

pub const TEMP_FILE_MAX_AGE: Duration = Duration::from_secs(24 * 3600);

/// Deletes files older than `max_age` inside `OUR_TEMP_FOLDERS` under
/// `temp_root`, and the folders they leave empty below those. Returns how
/// many files were deleted. A file that can't be deleted (still open in a
/// PDF viewer) is skipped.
pub fn clean_our_temp_folders(temp_root: &Path, max_age: Duration) -> usize {
    let Some(cutoff) = SystemTime::now().checked_sub(max_age) else { return 0 };
    OUR_TEMP_FOLDERS
        .iter()
        .map(|name| clean_dir(&temp_root.join(name), cutoff))
        .sum()
}

fn clean_dir(dir: &Path, cutoff: SystemTime) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            removed += clean_dir(&path, cutoff);
            let _ = std::fs::remove_dir(&path); // only succeeds when empty
        } else if meta.modified().map(|m| m < cutoff).unwrap_or(false)
            && std::fs::remove_file(&path).is_ok()
        {
            removed += 1;
        }
    }
    removed
}
