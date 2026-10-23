//! Copies of reports, invoices and opened attachments pile up in the
//! system temp folder (security-privacy.md M5). At start the app deletes
//! its own temp files older than a day, and nothing else.

use crate::services::temp_cleanup::{clean_our_temp_folders, OUR_TEMP_FOLDERS};
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

const DAY: Duration = Duration::from_secs(24 * 3600);

fn file_aged(path: &Path, age: Duration) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, "x").unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(SystemTime::now() - age)
        .unwrap();
}

#[test]
fn our_folders_are_the_ones_the_app_writes() {
    for name in [
        "simple_reports",
        "pharmacy_notes",
        "invoices",
        "device_reports",
        "arkivet-pdf-jobs",
        "vet-clinic-attachments",
        "vet-clinic-device-files",
    ] {
        assert!(OUR_TEMP_FOLDERS.contains(&name), "{name} missing");
    }
}

#[test]
fn deletes_our_files_older_than_a_day_and_keeps_newer_ones() {
    let temp = tempfile::tempdir().unwrap();
    let old_invoice = temp.path().join("invoices/Invoice - Rex.pdf");
    let new_invoice = temp.path().join("invoices/Invoice - Max.pdf");
    let old_preview = temp.path().join("vet-clinic-attachments/previews/attachment_1_p1_w900.png");
    let old_job = temp.path().join("arkivet-pdf-jobs/0b1c/job.json");
    file_aged(&old_invoice, 2 * DAY);
    file_aged(&new_invoice, Duration::from_secs(3600));
    file_aged(&old_preview, 3 * DAY);
    file_aged(&old_job, 2 * DAY);

    let removed = clean_our_temp_folders(temp.path(), DAY);

    assert_eq!(removed, 3);
    assert!(!old_invoice.exists());
    assert!(!old_preview.exists());
    assert!(!old_job.exists());
    assert!(new_invoice.exists());
    assert!(!temp.path().join("arkivet-pdf-jobs/0b1c").exists(), "empty job folder left behind");
    assert!(temp.path().join("invoices").is_dir(), "our top folder itself stays");
}

#[test]
fn never_touches_anything_outside_our_folders() {
    let temp = tempfile::tempdir().unwrap();
    let someone_elses = temp.path().join("other-app/report.pdf");
    let loose = temp.path().join("loose.pdf");
    file_aged(&someone_elses, 30 * DAY);
    file_aged(&loose, 30 * DAY);

    assert_eq!(clean_our_temp_folders(temp.path(), DAY), 0);

    assert!(someone_elses.exists());
    assert!(loose.exists());
}

#[test]
fn missing_folders_are_fine() {
    let temp = tempfile::tempdir().unwrap();
    assert_eq!(clean_our_temp_folders(&temp.path().join("nope"), DAY), 0);
}
