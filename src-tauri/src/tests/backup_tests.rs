//! Integration tests for `BackupService`.
//!
//! Each test uses two isolated temp dirs: one as the app's data dir (where
//! `backup_config.json` and the source files live) and one as the chosen
//! backup destination. `tempfile::TempDir` auto-cleans on drop.

use crate::services::backup::{
    is_backup_due, is_pre_update_snapshot, snapshot_file_name, BackupConfig, BackupService, SnapshotKind,
};
use crate::test_utils::create_test_db_with_migrations;
use chrono::{FixedOffset, Local, TimeZone, Utc};
use std::fs;
use std::path::Path;
use std::time::Duration;

/// Spin up an app_data_dir + backup destination, return both temp dirs and the
/// SeaORM connection. Keep the dir handles in scope or the files vanish.
struct BackupFixture {
    app_dir: tempfile::TempDir,
    dest_dir: tempfile::TempDir,
    test_db: crate::test_utils::TestDb,
}

async fn setup() -> BackupFixture {
    BackupFixture {
        app_dir: tempfile::tempdir().unwrap(),
        dest_dir: tempfile::tempdir().unwrap(),
        test_db: create_test_db_with_migrations().await,
    }
}

fn write(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, contents).unwrap();
}

// ---------------------------------------------------------------------------
// config persistence
// ---------------------------------------------------------------------------

#[test]
fn load_config_missing_returns_default() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = BackupService::load_config(dir.path());
    assert!(cfg.directory.is_none());
    assert!(cfg.last_backup_at.is_none());
    assert!(cfg.last_error.is_none());
}

#[test]
fn save_then_load_roundtrips_config() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = BackupConfig {
        directory: Some("/tmp/foo".to_string()),
        last_backup_at: Some("2026-05-18T10:00:00Z".to_string()),
        last_error: Some("boom".to_string()),
    };
    BackupService::save_config(dir.path(), &cfg).unwrap();
    let loaded = BackupService::load_config(dir.path());
    assert_eq!(loaded.directory, cfg.directory);
    assert_eq!(loaded.last_backup_at, cfg.last_backup_at);
    assert_eq!(loaded.last_error, cfg.last_error);
}

#[test]
fn load_config_corrupt_json_returns_default() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("backup_config.json"), "not json{").unwrap();
    let cfg = BackupService::load_config(dir.path());
    assert!(cfg.directory.is_none());
}

// ---------------------------------------------------------------------------
// set_directory
// ---------------------------------------------------------------------------

#[test]
fn set_directory_creates_missing_dir() {
    let app_dir = tempfile::tempdir().unwrap();
    let parent = tempfile::tempdir().unwrap();
    let target = parent.path().join("does-not-exist-yet");
    assert!(!target.exists());

    BackupService::set_directory(app_dir.path(), target.to_str().unwrap()).unwrap();
    assert!(target.is_dir(), "set_directory should create the dir");
}

#[test]
fn set_directory_rejects_empty() {
    let app_dir = tempfile::tempdir().unwrap();
    let err = BackupService::set_directory(app_dir.path(), "").unwrap_err();
    assert!(err.contains("cannot be empty"));
}

#[test]
fn set_directory_rejects_whitespace_only() {
    let app_dir = tempfile::tempdir().unwrap();
    let err = BackupService::set_directory(app_dir.path(), "   ").unwrap_err();
    assert!(err.contains("cannot be empty"));
}

#[test]
fn set_directory_persists_into_config() {
    let app_dir = tempfile::tempdir().unwrap();
    let dest = tempfile::tempdir().unwrap();

    BackupService::set_directory(app_dir.path(), dest.path().to_str().unwrap()).unwrap();
    let cfg = BackupService::load_config(app_dir.path());
    assert_eq!(cfg.directory.as_deref(), Some(dest.path().to_str().unwrap()));
}

// ---------------------------------------------------------------------------
// run_backup
// ---------------------------------------------------------------------------

#[tokio::test]
async fn run_backup_with_no_destination_fails() {
    let fx = setup().await;
    let err = BackupService::run_backup(fx.app_dir.path(), &fx.test_db)
        .await
        .unwrap_err();
    assert!(err.contains("No backup directory"), "got: {}", err);
}

// Final review (low): the logo lives in <app data>/clinic, outside the
// mirrored files folder, so a restore lost the letterhead logo.
#[tokio::test]
async fn run_backup_copies_the_clinic_logo() {
    let fx = setup().await;
    write(&fx.app_dir.path().join("clinic").join("logo.png"), "png");
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.expect("backup");

    assert!(fx.dest_dir.path().join("clinic").join("logo.png").is_file());
}

// Final review (low): the start-up, scheduled, manual and pre-update backups
// could run at once and fight over the same temporary files.
#[tokio::test]
async fn backups_started_together_all_succeed() {
    let fx = setup().await;
    write(&fx.app_dir.path().join("files").join("a.pdf"), "pdf");
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    let (a, b) = tokio::join!(
        BackupService::run_backup(fx.app_dir.path(), &fx.test_db),
        BackupService::run_backup(fx.app_dir.path(), &fx.test_db),
    );

    assert!(a.is_ok() && b.is_ok(), "{a:?} {b:?}");
}

#[tokio::test]
async fn run_backup_writes_dated_snapshot() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db)
        .await
        .expect("backup");

    let today = Local::now().format("%Y-%m-%d").to_string();
    let expected = fx.dest_dir.path().join("db").join(format!("vet_clinic_{}.db", today));
    assert!(expected.is_file(), "snapshot at {} not found", expected.display());
    let size = fs::metadata(&expected).unwrap().len();
    assert!(size > 0, "snapshot should not be empty");
}

#[tokio::test]
async fn run_backup_creates_files_directory_even_when_source_empty() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db)
        .await
        .unwrap();

    assert!(fx.dest_dir.path().join("files").is_dir());
}

#[tokio::test]
async fn run_backup_mirrors_files_directory_additively() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    // Source files
    write(&fx.app_dir.path().join("files/medical/a.pdf"), "pdf-a");
    write(&fx.app_dir.path().join("files/medical/sub/b.bin"), "bin-b");

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let dest = fx.dest_dir.path();
    assert_eq!(fs::read_to_string(dest.join("files/medical/a.pdf")).unwrap(), "pdf-a");
    assert_eq!(fs::read_to_string(dest.join("files/medical/sub/b.bin")).unwrap(), "bin-b");
}

#[tokio::test]
async fn run_backup_skips_up_to_date_files() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    write(&fx.app_dir.path().join("files/a.txt"), "original");
    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    // Touch the destination so its mtime is newer than the source, then mutate
    // the source contents WITHOUT making it newer — should NOT overwrite.
    let dest_file = fx.dest_dir.path().join("files/a.txt");
    let src_file = fx.app_dir.path().join("files/a.txt");

    // Same size: a destination of another size is what a cut-off copy looks
    // like, and that one is copied again.
    fs::write(&dest_file, "ORIGINAL").unwrap();
    // Push the source's mtime 60s into the past so it's older than dest.
    let older = std::time::SystemTime::now() - Duration::from_secs(60);
    fs::OpenOptions::new()
        .write(true)
        .open(&src_file)
        .unwrap()
        .set_modified(older)
        .unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let dest_content = fs::read_to_string(&dest_file).unwrap();
    assert_eq!(dest_content, "ORIGINAL", "newer dest of the same size should be preserved");
}

#[tokio::test]
async fn run_backup_overwrites_today_snapshot_on_rerun() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();
    let today = Local::now().format("%Y-%m-%d").to_string();
    let snapshot = fx.dest_dir.path().join("db").join(format!("vet_clinic_{}.db", today));
    let size1 = fs::metadata(&snapshot).unwrap().len();

    // Second run shouldn't fail (the prior code path had a bug here pre-fix)
    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();
    let size2 = fs::metadata(&snapshot).unwrap().len();

    // Both runs produce a valid snapshot; size may differ slightly but file
    // must exist and be non-empty.
    assert!(size1 > 0 && size2 > 0);
}

#[tokio::test]
async fn run_backup_updates_last_backup_at_on_success() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    let before = BackupService::load_config(fx.app_dir.path());
    assert!(before.last_backup_at.is_none());

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let after = BackupService::load_config(fx.app_dir.path());
    assert!(after.last_backup_at.is_some(), "should record last_backup_at");
    assert!(after.last_error.is_none(), "no error on success");
}

#[tokio::test]
async fn run_backup_records_error_when_destination_disappears() {
    let fx = setup().await;
    let dest_path = fx.dest_dir.path().to_path_buf();
    BackupService::set_directory(fx.app_dir.path(), dest_path.to_str().unwrap()).unwrap();

    // Drop the dest tempdir handle so the directory is removed
    drop(fx.dest_dir);
    assert!(!dest_path.exists());

    let result = BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await;
    assert!(result.is_err(), "should error when dest is gone");

    let cfg = BackupService::load_config(fx.app_dir.path());
    assert!(cfg.last_error.is_some(), "error should be recorded");
}

// ---------------------------------------------------------------------------
// retention / prune
// ---------------------------------------------------------------------------

#[tokio::test]
async fn run_backup_keeps_old_snapshots_under_retention_limit() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    let db_dir = fx.dest_dir.path().join("db");
    fs::create_dir_all(&db_dir).unwrap();

    // Pre-populate 5 fake snapshots (well under the 30 retention cap)
    for i in 0..5 {
        let f = db_dir.join(format!("vet_clinic_2026-04-{:02}.db", i + 1));
        fs::write(&f, "fake").unwrap();
    }

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let count = fs::read_dir(&db_dir).unwrap().count();
    // 5 pre-existing + 1 from today = 6
    assert_eq!(count, 6, "should keep all when under retention limit");
}

#[tokio::test]
async fn run_backup_prunes_to_retention_limit_when_over() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    let db_dir = fx.dest_dir.path().join("db");
    fs::create_dir_all(&db_dir).unwrap();

    // Pre-populate 35 fake snapshots — backup will add today's, total before
    // prune = 36, after prune ≤ 30 (the DB_SNAPSHOT_RETENTION constant).
    // Each file gets a unique name AND a staggered mtime so prune has a
    // deterministic ordering.
    for i in 0..35 {
        let f = db_dir.join(format!("vet_clinic_old_{:02}.db", i));
        fs::write(&f, format!("fake-{}", i)).unwrap();
        let older = std::time::SystemTime::now() - Duration::from_secs(86400 * (35 - i as u64));
        fs::OpenOptions::new()
            .write(true)
            .open(&f)
            .unwrap()
            .set_modified(older)
            .unwrap();
    }

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let count = fs::read_dir(&db_dir).unwrap().count();
    assert!(count <= 30, "should prune to <= retention limit, got {}", count);
}

#[tokio::test]
async fn run_backup_prune_ignores_non_db_files() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    let db_dir = fx.dest_dir.path().join("db");
    fs::create_dir_all(&db_dir).unwrap();
    // A README and a non-snapshot file should be untouched by prune
    fs::write(db_dir.join("README.txt"), "do not delete").unwrap();
    fs::write(db_dir.join("notes.md"), "## ops notes").unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    assert!(db_dir.join("README.txt").exists());
    assert!(db_dir.join("notes.md").exists());
}

// ---------------------------------------------------------------------------
// pre-update snapshots
// ---------------------------------------------------------------------------

fn pre_update(version: &str) -> SnapshotKind {
    SnapshotKind::PreUpdate { app_version: version.to_string() }
}

fn set_mtime_days_ago(path: &Path, days: u64) {
    let t = std::time::SystemTime::now() - Duration::from_secs(86400 * days);
    fs::OpenOptions::new().write(true).open(path).unwrap().set_modified(t).unwrap();
}

#[test]
fn daily_snapshot_name_is_the_date_of_the_given_time() {
    let now = Utc.with_ymd_and_hms(2026, 10, 22, 9, 5, 7).unwrap();
    assert_eq!(snapshot_file_name(&SnapshotKind::Daily, now), "vet_clinic_2026-10-22.db");
}

// dates-time.md #13: a backup at 00:30 in Skopje (22:30 UTC the day before)
// was named for yesterday and overwrote that morning's snapshot.
#[test]
fn daily_snapshot_name_is_the_clinic_wall_date_not_the_utc_date() {
    let skopje = FixedOffset::east_opt(2 * 3600).unwrap();
    let just_after_midnight = skopje.with_ymd_and_hms(2026, 10, 23, 0, 30, 0).unwrap();
    assert_eq!(
        snapshot_file_name(&SnapshotKind::Daily, just_after_midnight),
        "vet_clinic_2026-10-23.db"
    );
}

#[test]
fn pre_update_snapshot_name_carries_time_and_version() {
    let now = Utc.with_ymd_and_hms(2026, 10, 22, 9, 5, 7).unwrap();
    assert_eq!(
        snapshot_file_name(&pre_update("0.7.3"), now),
        "vet_clinic_2026-10-22_09-05-07_pre-update-0.7.3.db"
    );
}

#[test]
fn pre_update_names_are_recognised_and_daily_names_are_not() {
    let now = Utc.with_ymd_and_hms(2026, 10, 22, 9, 5, 7).unwrap();
    assert!(is_pre_update_snapshot(&snapshot_file_name(&pre_update("0.7.3"), now)));
    assert!(!is_pre_update_snapshot(&snapshot_file_name(&SnapshotKind::Daily, now)));
    assert!(!is_pre_update_snapshot("vet_clinic_old_01.db"));
}

#[tokio::test]
async fn daily_backup_on_the_same_day_keeps_the_pre_update_snapshot() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup_with_kind(fx.app_dir.path(), &fx.test_db, pre_update("0.7.3"))
        .await
        .unwrap();
    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let db_dir = fx.dest_dir.path().join("db");
    let names: Vec<String> = fs::read_dir(&db_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    let today = Local::now().format("%Y-%m-%d").to_string();
    assert!(names.contains(&format!("vet_clinic_{}.db", today)), "daily missing: {:?}", names);
    let pre: Vec<_> = names.iter().filter(|n| is_pre_update_snapshot(n)).collect();
    assert_eq!(pre.len(), 1, "pre-update snapshot should survive: {:?}", names);
    assert!(fs::metadata(db_dir.join(pre[0])).unwrap().len() > 0);
}

#[tokio::test]
async fn daily_prune_never_deletes_pre_update_snapshots() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    let db_dir = fx.dest_dir.path().join("db");
    fs::create_dir_all(&db_dir).unwrap();

    let old_pre = db_dir.join("vet_clinic_2026-01-01_10-00-00_pre-update-0.6.0.db");
    fs::write(&old_pre, "pre").unwrap();
    set_mtime_days_ago(&old_pre, 300);
    for i in 0..35 {
        let f = db_dir.join(format!("vet_clinic_old_{:02}.db", i));
        fs::write(&f, "fake").unwrap();
        set_mtime_days_ago(&f, 35 - i as u64);
    }

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    assert!(old_pre.exists(), "daily prune removed a pre-update snapshot");
    let daily = fs::read_dir(&db_dir)
        .unwrap()
        .filter(|e| !is_pre_update_snapshot(&e.as_ref().unwrap().file_name().to_string_lossy()))
        .count();
    assert_eq!(daily, 30);
}

#[tokio::test]
async fn pre_update_snapshots_keep_their_own_newest_ten() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    let db_dir = fx.dest_dir.path().join("db");
    fs::create_dir_all(&db_dir).unwrap();

    let daily_old = db_dir.join("vet_clinic_2026-01-01.db");
    fs::write(&daily_old, "daily").unwrap();
    set_mtime_days_ago(&daily_old, 400);
    for i in 0..12 {
        let f = db_dir.join(format!("vet_clinic_2026-02-{:02}_10-00-00_pre-update-0.6.{}.db", i + 1, i));
        fs::write(&f, "pre").unwrap();
        set_mtime_days_ago(&f, 100 - i as u64);
    }

    BackupService::run_backup_with_kind(fx.app_dir.path(), &fx.test_db, pre_update("0.7.3"))
        .await
        .unwrap();

    let pre: Vec<String> = fs::read_dir(&db_dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| is_pre_update_snapshot(n))
        .collect();
    assert_eq!(pre.len(), 10, "got {:?}", pre);
    assert!(pre.iter().any(|n| n.ends_with("_pre-update-0.7.3.db")), "new one kept: {:?}", pre);
    assert!(!pre.iter().any(|n| n.contains("2026-02-01_")), "oldest pruned: {:?}", pre);
    assert!(daily_old.exists(), "pre-update prune must not touch daily snapshots");
}

// ---------------------------------------------------------------------------
// scheduled backups
// ---------------------------------------------------------------------------

fn cfg_with(directory: Option<&str>, last_backup_at: Option<String>) -> BackupConfig {
    BackupConfig {
        directory: directory.map(str::to_string),
        last_backup_at,
        last_error: None,
    }
}

#[test]
fn backup_is_not_due_without_a_folder() {
    assert!(!is_backup_due(&cfg_with(None, None), Utc::now()));
}

#[test]
fn backup_is_due_when_there_never_was_one() {
    assert!(is_backup_due(&cfg_with(Some("/b"), None), Utc::now()));
}

#[test]
fn backup_is_due_once_the_last_success_is_a_day_old() {
    let now = Utc::now();
    let recent = (now - chrono::Duration::hours(23)).to_rfc3339();
    let old = (now - chrono::Duration::hours(25)).to_rfc3339();
    assert!(!is_backup_due(&cfg_with(Some("/b"), Some(recent)), now));
    assert!(is_backup_due(&cfg_with(Some("/b"), Some(old)), now));
}

#[test]
fn backup_is_due_when_the_last_time_is_unreadable() {
    assert!(is_backup_due(&cfg_with(Some("/b"), Some("garbage".into())), Utc::now()));
}

// settings.md #6: the rerun deleted today's snapshot before writing the new
// one, so a failed write left no snapshot for today at all.
#[tokio::test]
async fn a_rerun_that_cannot_write_keeps_todays_earlier_snapshot() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    let name = snapshot_file_name(&SnapshotKind::Daily, Local::now());
    let snapshot = fx.dest_dir.path().join("db").join(&name);
    write(&snapshot, "EARLIER SNAPSHOT");
    // Something in the way of the new copy: a folder where the temporary
    // file has to go.
    fs::create_dir_all(fx.dest_dir.path().join("db").join(format!("{name}.part")).join("x")).unwrap();

    let result = BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await;

    assert!(result.is_err(), "the run must report the failed write");
    assert_eq!(fs::read_to_string(&snapshot).unwrap(), "EARLIER SNAPSHOT");
}

#[tokio::test]
async fn a_rerun_replaces_todays_snapshot_and_leaves_no_temporary_file() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    let name = snapshot_file_name(&SnapshotKind::Daily, Local::now());
    let snapshot = fx.dest_dir.path().join("db").join(&name);
    write(&snapshot, "EARLIER SNAPSHOT");

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    assert_ne!(fs::read(&snapshot).unwrap(), b"EARLIER SNAPSHOT");
    assert!(!fx.dest_dir.path().join("db").join(format!("{name}.part")).exists());
}

// backend-errors.md L6: an unreadable config silently became "no backup
// folder", so backups stopped with nothing on screen but "not set up".
#[test]
fn an_unreadable_config_is_reported_not_silently_reset() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("backup_config.json"), "{\"directory\": \"D:\\\\Backup").unwrap();

    let cfg = BackupService::load_config(dir.path());

    assert!(cfg.directory.is_none());
    let err = cfg.last_error.expect("the broken settings file must show as an error");
    assert!(err.contains("backup_config.json"), "got: {err}");
}

// A save is written to a temporary file and swapped in, so a failed write
// can't leave half a config behind.
#[test]
fn a_config_save_that_cannot_finish_keeps_the_old_file() {
    let dir = tempfile::tempdir().unwrap();
    let old = BackupConfig { directory: Some("D:/Backup".into()), last_backup_at: None, last_error: None };
    BackupService::save_config(dir.path(), &old).unwrap();
    fs::create_dir_all(dir.path().join("backup_config.json.tmp").join("x")).unwrap();

    let new = BackupConfig { directory: Some("E:/Other".into()), last_backup_at: None, last_error: None };
    assert!(BackupService::save_config(dir.path(), &new).is_err());

    assert_eq!(BackupService::load_config(dir.path()).directory.as_deref(), Some("D:/Backup"));
}

// lifecycle.md #10: a copy cut off mid-way (Quit, shutdown) was newer than
// the source, so every later mirror skipped it and the backup kept a broken
// file.
#[tokio::test]
async fn mirror_copies_again_when_the_backup_copy_has_another_size() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    let src_file = fx.app_dir.path().join("files/medical/note.pdf");
    let dest_file = fx.dest_dir.path().join("files/medical/note.pdf");
    write(&src_file, "the whole pharmacy note");
    set_mtime_days_ago(&src_file, 1);
    write(&dest_file, "the who");

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    assert_eq!(fs::read_to_string(&dest_file).unwrap(), "the whole pharmacy note");
}

#[tokio::test]
async fn mirror_leaves_no_temporary_files_behind() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    write(&fx.app_dir.path().join("files/medical/a.pdf"), "pdf-a");
    write(&fx.app_dir.path().join("files/medical/sub/b.bin"), "bin-b");
    // A leftover from an interrupted run.
    write(&fx.dest_dir.path().join("files/medical/a.pdf.part"), "pd");

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let mut leftovers = Vec::new();
    let mut stack = vec![fx.dest_dir.path().join("files")];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else if path.to_string_lossy().ends_with(".part") {
                leftovers.push(path);
            }
        }
    }
    assert!(leftovers.is_empty(), "{leftovers:?}");
    assert_eq!(fs::read_to_string(fx.dest_dir.path().join("files/medical/a.pdf")).unwrap(), "pdf-a");
}

// database.md L2: a lost backup stick carried a working Google login.
async fn google_connected(db: &sea_orm::DatabaseConnection) {
    use sea_orm::ConnectionTrait;
    db.execute_unprepared(
        "UPDATE google_calendar_settings SET access_token = 'ya29.secret', refresh_token = '1//refresh', \
         calendar_id = 'cal', sync_enabled = 1, needs_reauth = 0 WHERE user_id = 'default'",
    )
    .await
    .unwrap();
}

fn todays_snapshot(fx: &BackupFixture) -> std::path::PathBuf {
    fx.dest_dir.path().join("db").join(snapshot_file_name(&SnapshotKind::Daily, Local::now()))
}

async fn open_snapshot(fx: &BackupFixture) -> sea_orm::DatabaseConnection {
    let url = format!("sqlite://{}?mode=ro", todays_snapshot(fx).display());
    sea_orm::Database::connect(url).await.unwrap()
}

#[tokio::test]
async fn the_snapshot_carries_no_google_login() {
    use sea_orm::{ConnectionTrait, DbBackend, Statement};
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    google_connected(&fx.test_db).await;

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let copy = open_snapshot(&fx).await;
    let row = copy
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT access_token, refresh_token, needs_reauth FROM google_calendar_settings".to_string(),
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.try_get::<Option<String>>("", "access_token").unwrap(), None);
    assert_eq!(row.try_get::<Option<String>>("", "refresh_token").unwrap(), None);
    assert_eq!(row.try_get::<i64>("", "needs_reauth").unwrap(), 1);
    let bytes = fs::read(todays_snapshot(&fx)).unwrap();
    let text = String::from_utf8_lossy(&bytes);
    assert!(!text.contains("ya29.secret") && !text.contains("1//refresh"), "token bytes left in the file");

    let live = crate::services::google_calendar::load_sync_status(&fx.test_db).await.unwrap();
    assert!(live.connected, "the running app keeps its login");
}

#[tokio::test]
async fn a_restored_snapshot_asks_to_reconnect_google() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();
    google_connected(&fx.test_db).await;

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();

    let status = crate::services::google_calendar::load_sync_status(&open_snapshot(&fx).await)
        .await
        .unwrap();
    assert!(!status.connected);
    assert!(status.needs_reauth, "Settings shows Reconnect");
}
