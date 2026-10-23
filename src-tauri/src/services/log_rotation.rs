//! Daily rotation and retention for the app's log files.
//!
//! Two surfaces are kept tidy by this module:
//!   1. The main app log written by `tauri-plugin-log` (single file, e.g.
//!      `Arkivet.log`) — rotated at app startup based on the file's
//!      last-modified date. The plugin opens its file handle for the whole
//!      session and we can't make it re-open mid-run, so rotation here is
//!      a startup-only pass: if today is not the file's last-modified
//!      day, the file is renamed to `vet-clinic-YYYY-MM-DD.log` and the
//!      plugin then creates a fresh current-day file.
//!   2. The per-port raw serial logs (`raw_COM5-YYYY-MM-DD.log`, …) — the
//!      filename itself carries today's date (see [`crate::services::device_input::get_raw_log_path`]).
//!      Rotation is automatic since the writer reopens the file on every
//!      read, so a write after midnight lands in the next day's file
//!      without any extra plumbing. This module only contributes the
//!      retention sweep for that directory.
//!
//! The plugin itself never deletes the main log (see [`main_log_rotation`]);
//! past 50 MB it renames it at startup to `<base>_YYYY-MM-DD_HH-MM-SS.log`.
//!
//! All surfaces share [`prune_old_logs`] which deletes files matching
//! `<base>-YYYY-MM-DD.log` or `<base>_YYYY-MM-DD_HH-MM-SS.log` whose
//! embedded date is older than the retention window.
//!
//! Failures here are logged to stderr and otherwise swallowed — log
//! rotation is best-effort housekeeping, never a reason to refuse to
//! start. Code calling this runs before the logger is up, so stderr is
//! the only sink available anyway.

use chrono::{Local, NaiveDate};
use std::path::Path;
use tauri_plugin_log::RotationStrategy;

/// Rotation settings for `tauri-plugin-log`'s main log file.
///
/// The plugin's default (KeepOne, 40 KB) deletes the live log at startup once
/// it passes 40 KB, so a same-day restart lost the day's log. KeepAll renames
/// an oversized file to `<name>_YYYY-MM-DD_HH-MM-SS.log` instead; this module
/// recognises that name and prunes it with the other archives.
pub fn main_log_rotation() -> (RotationStrategy, u128) {
    (RotationStrategy::KeepAll, 50 * 1024 * 1024)
}

/// Rotate any `<name>.log` files in `dir` whose last-modified date is
/// not today. The file is renamed in place to `<name>-YYYY-MM-DD.log`
/// using its last-modified date as the suffix. Files that already carry
/// a `-YYYY-MM-DD` suffix are skipped (they're previous-day archives,
/// not the current open log).
///
/// Silently no-ops if `dir` doesn't exist yet — that's the normal first-
/// launch case where `tauri-plugin-log` hasn't created the directory.
///
/// Must be called BEFORE `tauri-plugin-log` initializes. On all
/// platforms the plugin opens its file handle for the lifetime of the
/// process, and renaming under an open handle either fails (Unix:
/// rename works but the handle keeps writing to the moved inode) or
/// produces split-brain logs (Windows: handle stays valid for the
/// renamed file, so today's writes land in yesterday's archive).
pub fn rotate_main_log_at_startup(dir: &Path) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // first launch, log dir not created yet
    };

    let today = Local::now().date_naive();

    for entry in entries.flatten() {
        let path = entry.path();
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        // Already archived — skip. Without this guard we'd append
        // another `-YYYY-MM-DD` suffix to it every startup.
        if is_already_archived(stem) {
            continue;
        }

        let mtime = match entry.metadata().and_then(|m| m.modified()) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let mtime_date = chrono::DateTime::<Local>::from(mtime).date_naive();
        if mtime_date >= today {
            continue; // current-day file, leave it alone
        }

        let archive_path = dir.join(format!(
            "{}-{}.log",
            stem,
            mtime_date.format("%Y-%m-%d"),
        ));
        if let Err(e) = std::fs::rename(&path, &archive_path) {
            // Logger isn't up yet — stderr is all we've got. Don't
            // bail; a failed rotation just means today's lines append
            // to yesterday's file, which is annoying but not fatal.
            eprintln!(
                "log_rotation: failed to archive {:?} → {:?}: {}",
                path, archive_path, e
            );
        }
    }
}

/// Delete archived `<base>-YYYY-MM-DD.log` files in `dir` whose embedded
/// date is older than `days_to_keep` days. Files without a parseable
/// date suffix are ignored (including the live current-day log).
///
/// Silently no-ops if `dir` doesn't exist.
pub fn prune_old_logs(dir: &Path, days_to_keep: i64) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let cutoff = Local::now().date_naive() - chrono::Duration::days(days_to_keep);

    for entry in entries.flatten() {
        let path = entry.path();
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let date = match parse_date_suffix(stem) {
            Some(d) => d,
            None => continue, // unarchived or unrecognized — leave alone
        };
        if date < cutoff {
            if let Err(e) = std::fs::remove_file(&path) {
                eprintln!("log_rotation: failed to prune {:?}: {}", path, e);
            }
        }
    }
}

/// Returns true if `stem` ends with a 10-char `-YYYY-MM-DD` suffix.
/// Pure for testing.
fn is_already_archived(stem: &str) -> bool {
    parse_date_suffix(stem).is_some()
}

/// Extract the archive date from a filename stem: our own trailing
/// `-YYYY-MM-DD`, or the plugin's size-rotation `_YYYY-MM-DD_HH-MM-SS`.
/// Returns `None` if neither is present or parseable.
fn parse_date_suffix(stem: &str) -> Option<NaiveDate> {
    parse_daily_suffix(stem).or_else(|| parse_plugin_rotated_suffix(stem))
}

fn parse_plugin_rotated_suffix(stem: &str) -> Option<NaiveDate> {
    // `x_YYYY-MM-DD_HH-MM-SS` → 1 base char + `_` + 19.
    let len = stem.len();
    if len < 21 || !stem.is_char_boundary(len - 19) || !stem[..len - 19].ends_with('_') {
        return None;
    }
    chrono::NaiveDateTime::parse_from_str(&stem[len - 19..], "%Y-%m-%d_%H-%M-%S")
        .ok()
        .map(|dt| dt.date())
}

fn parse_daily_suffix(stem: &str) -> Option<NaiveDate> {
    // Need at least `x-YYYY-MM-DD` → 12 chars (1 base char + dash + 10).
    let len = stem.len();
    if len < 12 {
        return None;
    }
    let date_part = &stem[len - 10..];
    // The char right before the date must be the separator. Without
    // this guard `vet-clinic2026-06-01` (no hyphen) would parse as
    // archived, and weirdly-named files could be misclassified.
    if !stem[..len - 10].ends_with('-') {
        return None;
    }
    NaiveDate::parse_from_str(date_part, "%Y-%m-%d").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------
    // parse_date_suffix: extraction logic. Edge cases matter — a wrong
    // classification here either rotates archives twice (suffix
    // misidentified as live) or skips rotation of live logs (live
    // misidentified as archive).
    // -------------------------------------------------------------------

    #[test]
    fn parses_standard_archive_name() {
        assert_eq!(
            parse_date_suffix("vet-clinic-2026-06-02"),
            Some(NaiveDate::from_ymd_opt(2026, 6, 2).unwrap()),
        );
    }

    #[test]
    fn parses_raw_serial_archive_name() {
        assert_eq!(
            parse_date_suffix("raw_COM5-2026-06-02"),
            Some(NaiveDate::from_ymd_opt(2026, 6, 2).unwrap()),
        );
    }

    #[test]
    fn live_logs_have_no_date_suffix() {
        assert_eq!(parse_date_suffix("vet-clinic"), None);
        assert_eq!(parse_date_suffix("raw_COM5"), None);
    }

    #[test]
    fn missing_separator_before_date_is_not_archive() {
        // No hyphen between base and date — could be a coincidence.
        assert_eq!(parse_date_suffix("vetclinic2026-06-02"), None);
    }

    #[test]
    fn invalid_date_returns_none() {
        assert_eq!(parse_date_suffix("vet-clinic-2026-13-99"), None);
        assert_eq!(parse_date_suffix("vet-clinic-not-a-date"), None);
    }

    #[test]
    fn too_short_returns_none() {
        assert_eq!(parse_date_suffix(""), None);
        assert_eq!(parse_date_suffix("short"), None);
        assert_eq!(parse_date_suffix("2026-06-02"), None); // just a date, no base
    }

    #[test]
    fn parses_plugin_size_rotated_archive_name() {
        assert_eq!(
            parse_date_suffix("Arkivet_2026-06-02_10-11-12"),
            Some(NaiveDate::from_ymd_opt(2026, 6, 2).unwrap()),
        );
        assert_eq!(parse_date_suffix("Arkivet_2026-06-02_10-11-1x"), None);
    }

    #[test]
    fn main_log_plugin_never_deletes_and_allows_large_files() {
        let (strategy, max_size) = main_log_rotation();
        assert!(matches!(strategy, RotationStrategy::KeepAll));
        assert!(max_size >= 10 * 1024 * 1024, "cap too small: {}", max_size);
    }

    #[test]
    fn is_already_archived_agrees_with_parse() {
        assert!(is_already_archived("vet-clinic-2026-06-02"));
        assert!(!is_already_archived("vet-clinic"));
    }

    // -------------------------------------------------------------------
    // prune_old_logs: end-to-end against a temp directory. Hits the
    // filesystem on purpose because the bug class we're guarding
    // against (deleting the wrong files, or none at all) only shows up
    // with real fs semantics.
    // -------------------------------------------------------------------

    use std::fs::File;

    fn touch(dir: &Path, name: &str) {
        File::create(dir.join(name)).unwrap();
    }

    #[test]
    fn prune_deletes_archives_older_than_retention() {
        let tmp = tempfile::tempdir().unwrap();
        let today = Local::now().date_naive();
        let old = today - chrono::Duration::days(100);
        let recent = today - chrono::Duration::days(5);

        touch(tmp.path(), &format!("vet-clinic-{}.log", old));
        touch(tmp.path(), &format!("vet-clinic-{}.log", recent));
        touch(tmp.path(), "Arkivet.log"); // live, no date

        prune_old_logs(tmp.path(), 30);

        assert!(!tmp.path().join(format!("vet-clinic-{}.log", old)).exists());
        assert!(tmp.path().join(format!("vet-clinic-{}.log", recent)).exists());
        assert!(tmp.path().join("Arkivet.log").exists());
    }

    #[test]
    fn prune_ignores_non_log_files() {
        let tmp = tempfile::tempdir().unwrap();
        let old = Local::now().date_naive() - chrono::Duration::days(100);
        touch(tmp.path(), &format!("vet-clinic-{}.txt", old)); // wrong extension
        touch(tmp.path(), "README.md");

        prune_old_logs(tmp.path(), 30);

        assert!(tmp.path().join(format!("vet-clinic-{}.txt", old)).exists());
        assert!(tmp.path().join("README.md").exists());
    }

    #[test]
    fn prune_handles_missing_dir() {
        // Should not panic on nonexistent dir — first-launch case.
        prune_old_logs(Path::new("/nonexistent/path/that/does/not/exist"), 30);
    }

    fn touch_days_ago(dir: &Path, name: &str, days: u64) {
        let f = File::create(dir.join(name)).unwrap();
        let t = std::time::SystemTime::now() - std::time::Duration::from_secs(86400 * days);
        f.set_modified(t).unwrap();
    }

    #[test]
    fn startup_rotation_leaves_plugin_rotated_archives_alone() {
        let tmp = tempfile::tempdir().unwrap();
        touch_days_ago(tmp.path(), "Arkivet_2026-06-02_10-11-12.log", 5);

        rotate_main_log_at_startup(tmp.path());

        assert!(tmp.path().join("Arkivet_2026-06-02_10-11-12.log").exists());
        assert_eq!(std::fs::read_dir(tmp.path()).unwrap().count(), 1);
    }

    #[test]
    fn startup_rotation_keeps_todays_live_log() {
        let tmp = tempfile::tempdir().unwrap();
        touch(tmp.path(), "Arkivet.log");

        rotate_main_log_at_startup(tmp.path());

        assert!(tmp.path().join("Arkivet.log").exists());
    }

    #[test]
    fn prune_deletes_old_plugin_rotated_archives_only() {
        let tmp = tempfile::tempdir().unwrap();
        let today = Local::now().date_naive();
        let old = format!("Arkivet_{}_10-11-12.log", today - chrono::Duration::days(100));
        let recent = format!("Arkivet_{}_10-11-12.log", today - chrono::Duration::days(5));
        touch(tmp.path(), &old);
        touch(tmp.path(), &recent);

        prune_old_logs(tmp.path(), 30);

        assert!(!tmp.path().join(&old).exists());
        assert!(tmp.path().join(&recent).exists());
    }

    // Raw serial logs from older builds have no date in their name
    // (`raw_COM3.log`) and were kept forever.
    #[test]
    fn prune_dates_undated_raw_serial_logs_by_their_last_change() {
        let tmp = tempfile::tempdir().unwrap();
        touch_days_ago(tmp.path(), "raw_COM3.log", 100);
        touch_days_ago(tmp.path(), "raw__tmp_ttyV0.log", 5);
        touch_days_ago(tmp.path(), "Arkivet.log", 100); // the live main log stays

        prune_old_logs(tmp.path(), 30);

        assert!(!tmp.path().join("raw_COM3.log").exists());
        assert!(tmp.path().join("raw__tmp_ttyV0.log").exists());
        assert!(tmp.path().join("Arkivet.log").exists());
    }

    #[test]
    fn prune_zero_days_keeps_only_today() {
        let tmp = tempfile::tempdir().unwrap();
        let today = Local::now().date_naive();
        let yesterday = today - chrono::Duration::days(1);

        touch(tmp.path(), &format!("vet-clinic-{}.log", today));
        touch(tmp.path(), &format!("vet-clinic-{}.log", yesterday));

        // days_to_keep=0 means cutoff = today, anything strictly before today goes.
        prune_old_logs(tmp.path(), 0);

        assert!(tmp.path().join(format!("vet-clinic-{}.log", today)).exists());
        assert!(!tmp.path().join(format!("vet-clinic-{}.log", yesterday)).exists());
    }
}
