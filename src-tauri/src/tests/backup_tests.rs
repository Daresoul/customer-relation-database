//! Integration tests for `BackupService`.
//!
//! Each test uses two isolated temp dirs: one as the app's data dir (where
//! `backup_config.json` and the source files live) and one as the chosen
//! backup destination. `tempfile::TempDir` auto-cleans on drop.

use crate::services::backup::{BackupConfig, BackupService};
use crate::test_utils::create_test_db_with_migrations;
use chrono::Utc;
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

#[tokio::test]
async fn run_backup_writes_dated_snapshot() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db)
        .await
        .expect("backup");

    let today = Utc::now().format("%Y-%m-%d").to_string();
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

    fs::write(&dest_file, "destination-edited").unwrap();
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
    assert_eq!(dest_content, "destination-edited", "newer dest should be preserved");
}

#[tokio::test]
async fn run_backup_overwrites_today_snapshot_on_rerun() {
    let fx = setup().await;
    BackupService::set_directory(fx.app_dir.path(), fx.dest_dir.path().to_str().unwrap()).unwrap();

    BackupService::run_backup(fx.app_dir.path(), &fx.test_db).await.unwrap();
    let today = Utc::now().format("%Y-%m-%d").to_string();
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
