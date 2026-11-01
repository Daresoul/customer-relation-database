//! Old logs were pruned only at start; a PC that sleeps instead of shutting
//! down kept them forever (lifecycle.md #15). The prune now also runs daily
//! over the app log folder and the raw serial log folder.

use crate::services::log_rotation::{cap_live_logs, prune_log_dirs, LOG_PRUNE_INTERVAL};
use chrono::Local;
use std::time::Duration;

fn archive(dir: &std::path::Path, base: &str, days_ago: i64) -> std::path::PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let date = (Local::now().date_naive() - chrono::Duration::days(days_ago)).format("%Y-%m-%d");
    let path = dir.join(format!("{base}-{date}.log"));
    std::fs::write(&path, "x").unwrap();
    path
}

#[test]
fn one_pass_prunes_every_folder_given() {
    let root = tempfile::tempdir().unwrap();
    let logs = root.path().join("logs");
    let raw = root.path().join("raw_serial_logs");
    let old_main = archive(&logs, "Arkivet", 40);
    let new_main = archive(&logs, "Arkivet", 2);
    let old_raw = archive(&raw, "raw_COM5", 31);
    let new_raw = archive(&raw, "raw_COM5", 1);

    prune_log_dirs(&[logs, raw, root.path().join("missing")], 30);

    assert!(!old_main.exists());
    assert!(!old_raw.exists());
    assert!(new_main.exists());
    assert!(new_raw.exists());
}

#[test]
fn the_prune_repeats_daily() {
    assert_eq!(LOG_PRUNE_INTERVAL, Duration::from_secs(24 * 3600));
}

// Final review (low): the size limit was checked only at start, so in a tray
// session of weeks Arkivet.log grew without end (and outlived the 30 days).
#[test]
fn an_oversized_live_log_is_archived_and_emptied() {
    let dir = tempfile::tempdir().unwrap();
    let live = dir.path().join("Arkivet.log");
    std::fs::write(&live, "a".repeat(2000)).unwrap();
    let small = dir.path().join("Other.log");
    std::fs::write(&small, "b".repeat(10)).unwrap();
    let old = archive(dir.path(), "Arkivet", 3);

    let archived = cap_live_logs(dir.path(), 1000);

    assert_eq!(archived.len(), 1);
    assert_eq!(std::fs::read_to_string(&archived[0]).unwrap().len(), 2000, "the archive keeps what was logged");
    assert_eq!(std::fs::metadata(&live).unwrap().len(), 0, "logging goes on in an empty file");
    assert_eq!(std::fs::metadata(&small).unwrap().len(), 10);
    assert!(old.exists());
}

