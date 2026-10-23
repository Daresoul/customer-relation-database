//! Old logs were pruned only at start; a PC that sleeps instead of shutting
//! down kept them forever (lifecycle.md #15). The prune now also runs daily
//! over the app log folder and the raw serial log folder.

use crate::services::log_rotation::{prune_log_dirs, LOG_PRUNE_INTERVAL};
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
