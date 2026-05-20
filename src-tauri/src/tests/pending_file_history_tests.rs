//! Data-layer tests for pending device entries + file access history.
//!
//! The commands in commands/pending.rs and commands/file_history.rs take
//! `State<SeaOrmPool>` (Tauri runtime context) which is awkward to mock.
//! Instead, we test the SQL contracts directly — schema constraints,
//! cascading behavior, query shapes — by exercising the same SQL the
//! commands use against a real migrated DB.

use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

/// Insert a file_access_history row; returns its rowid.
async fn insert_file_history(
    db: &DatabaseConnection,
    file_id: &str,
    original_name: &str,
    device_type: &str,
) -> i64 {
    let r = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, connection_method, received_at) \
             VALUES (?, ?, ?, ?, 'TestDev', 'serial', CURRENT_TIMESTAMP)",
            [
                file_id.into(),
                original_name.into(),
                format!("/tmp/{}", file_id).into(),
                device_type.into(),
            ],
        ))
        .await
        .unwrap();
    r.last_insert_id() as i64
}

async fn insert_pending_entry(
    db: &DatabaseConnection,
    file_id: &str,
    patient_serial: &str,
    status: &str,
) -> i64 {
    let r = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO pending_device_entries (file_id, patient_serial, status) VALUES (?, ?, ?)",
            [file_id.into(), patient_serial.into(), status.into()],
        ))
        .await
        .unwrap();
    r.last_insert_id() as i64
}

async fn count(db: &DatabaseConnection, table: &str) -> i64 {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        &format!("SELECT COUNT(*) AS c FROM {}", table),
        vec![],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get("", "c")
    .unwrap()
}

// ---------------------------------------------------------------------------
// file_access_history
// ---------------------------------------------------------------------------

#[tokio::test]
async fn insert_file_history_round_trips() {
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "uuid-1", "test.xml", "exigo_eos_vet").await;
    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT file_id, original_name, device_type FROM file_access_history WHERE file_id = ?",
            ["uuid-1".into()],
        ))
        .await
        .unwrap()
        .unwrap();
    let file_id: String = row.try_get("", "file_id").unwrap();
    let name: String = row.try_get("", "original_name").unwrap();
    let dev: String = row.try_get("", "device_type").unwrap();
    assert_eq!(file_id, "uuid-1");
    assert_eq!(name, "test.xml");
    assert_eq!(dev, "exigo_eos_vet");
}

#[tokio::test]
async fn file_history_duplicate_file_id_rejected_by_unique() {
    // file_access_history has UNIQUE on file_id — a second insert with the
    // same file_id should fail. Pin this behavior so de-duplication logic
    // upstream stays correct.
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "duplicate-id", "a.xml", "exigo_eos_vet").await;
    let dup_result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, connection_method, received_at) \
             VALUES (?, ?, ?, ?, 'TestDev', 'serial', CURRENT_TIMESTAMP)",
            ["duplicate-id".into(), "b.xml".into(), "/tmp/b".into(), "exigo_eos_vet".into()],
        ))
        .await;
    assert!(dup_result.is_err(), "duplicate file_id should violate UNIQUE");
}

#[tokio::test]
async fn file_history_recent_window_query_pattern() {
    // Sanity-check the WHERE received_at >= datetime(...) pattern used by
    // get_recent_device_files. Inserts two rows, one with a back-dated
    // received_at, and verifies the recent filter picks only the new one.
    let db = create_test_db_with_migrations().await;
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, connection_method, received_at) \
         VALUES ('old-file', 'old.xml', '/tmp/old', 'exigo_eos_vet', 'd', 's', datetime('now', '-30 days'))".to_string(),
    )).await.unwrap();
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, connection_method, received_at) \
         VALUES ('new-file', 'new.xml', '/tmp/new', 'exigo_eos_vet', 'd', 's', datetime('now'))".to_string(),
    )).await.unwrap();

    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM file_access_history WHERE received_at >= datetime('now', '-14 days')".to_string(),
    )).await.unwrap().unwrap();
    let recent: i64 = row.try_get("", "c").unwrap();
    assert_eq!(recent, 1, "only the new file falls in the 14-day window");
}

#[tokio::test]
async fn file_history_cleanup_drops_old_rows() {
    // Pin the cleanup query — delete rows older than N days.
    let db = create_test_db_with_migrations().await;
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name, connection_method, received_at) \
         VALUES ('ancient', 'old.xml', '/tmp/old', 'x', 'd', 's', datetime('now', '-100 days')), \
                ('recent', 'new.xml', '/tmp/new', 'x', 'd', 's', datetime('now', '-1 days'))".to_string(),
    )).await.unwrap();

    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "DELETE FROM file_access_history WHERE received_at < datetime('now', '-30 days')".to_string(),
    )).await.unwrap();

    let remaining: i64 = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM file_access_history".to_string(),
    )).await.unwrap().unwrap().try_get("", "c").unwrap();
    assert_eq!(remaining, 1);

    let only = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT file_id FROM file_access_history".to_string(),
    )).await.unwrap().unwrap();
    let fid: String = only.try_get("", "file_id").unwrap();
    assert_eq!(fid, "recent");
}

// ---------------------------------------------------------------------------
// pending_device_entries
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_pending_entry_with_valid_file_id() {
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "f1", "x.xml", "exigo_eos_vet").await;
    let id = insert_pending_entry(&db, "f1", "patient-001", "pending").await;
    assert!(id > 0);
    assert_eq!(count(&db, "pending_device_entries").await, 1);
}

#[tokio::test]
async fn pending_entry_with_invalid_file_id_fails_fk() {
    // pending_device_entries.file_id should FK to file_access_history.file_id.
    // Inserting a pending row referencing a missing file_id should fail.
    let db = create_test_db_with_migrations().await;
    let r = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO pending_device_entries (file_id, patient_serial, status) VALUES (?, ?, 'pending')",
            ["nonexistent".into(), "p1".into()],
        ))
        .await;
    assert!(r.is_err(), "FK to file_access_history should fail");
}

#[tokio::test]
async fn pending_entry_cascade_when_file_history_deleted() {
    // Schema declares ON DELETE CASCADE on the pending_device_entries.file_id
    // FK. Pin this behavior — deleting the underlying file_access_history row
    // automatically cleans up the pending entry.
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "f1", "x.xml", "exigo_eos_vet").await;
    insert_pending_entry(&db, "f1", "patient-001", "pending").await;
    assert_eq!(count(&db, "pending_device_entries").await, 1);

    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM file_access_history WHERE file_id = ?",
        ["f1".into()],
    ))
    .await
    .unwrap();

    assert_eq!(count(&db, "pending_device_entries").await, 0, "should have cascaded");
}

#[tokio::test]
async fn mark_pending_entry_processed_flips_status() {
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "f1", "x.xml", "exigo_eos_vet").await;
    let entry_id = insert_pending_entry(&db, "f1", "p1", "pending").await;

    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE pending_device_entries SET status = 'processed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [entry_id.into()],
    )).await.unwrap();

    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT status FROM pending_device_entries WHERE id = ?",
        [entry_id.into()],
    )).await.unwrap().unwrap();
    let s: String = row.try_get("", "status").unwrap();
    assert_eq!(s, "processed");
}

#[tokio::test]
async fn list_pending_filters_by_status() {
    let db = create_test_db_with_migrations().await;
    // status CHECK allows pending / processed / cancelled only.
    for (i, status) in ["pending", "processed", "pending", "cancelled"].iter().enumerate() {
        let fid = format!("f-{}", i);
        insert_file_history(&db, &fid, "x.xml", "exigo_eos_vet").await;
        insert_pending_entry(&db, &fid, &format!("p-{}", i), status).await;
    }

    // The list query in pending.rs defaults to status = 'pending'
    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM pending_device_entries WHERE status = 'pending'".to_string(),
    )).await.unwrap().unwrap();
    let pending: i64 = row.try_get("", "c").unwrap();
    assert_eq!(pending, 2);
}

#[tokio::test]
async fn list_pending_filters_by_patient_serial_substring() {
    // The LIKE '%query%' pattern used by list_pending_device_entries.
    let db = create_test_db_with_migrations().await;
    for (i, serial) in ["acme-001", "acme-002", "petco-A1", "other"].iter().enumerate() {
        let fid = format!("f-{}", i);
        insert_file_history(&db, &fid, "x.xml", "exigo_eos_vet").await;
        insert_pending_entry(&db, &fid, serial, "pending").await;
    }

    let row = db.query_one(Statement::from_string(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM pending_device_entries \
         WHERE status = 'pending' AND patient_serial LIKE '%acme%'".to_string(),
    )).await.unwrap().unwrap();
    let matches: i64 = row.try_get("", "c").unwrap();
    assert_eq!(matches, 2, "matches both acme- entries");
}

#[tokio::test]
async fn pending_entry_unique_per_file_id_via_upsert() {
    // save_device_files_for_later uses INSERT … ON CONFLICT(file_id) DO UPDATE.
    // Verify the UNIQUE constraint backing that exists by trying a duplicate.
    let db = create_test_db_with_migrations().await;
    insert_file_history(&db, "f1", "x.xml", "exigo_eos_vet").await;
    insert_pending_entry(&db, "f1", "first-serial", "pending").await;

    let dup = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO pending_device_entries (file_id, patient_serial, status) VALUES (?, ?, 'pending')",
        ["f1".into(), "second-serial".into()],
    )).await;
    assert!(dup.is_err(), "second pending entry for same file_id should fail UNIQUE");

    // The actual upsert path uses ON CONFLICT — verify it works
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO pending_device_entries (file_id, patient_serial, status) VALUES (?, ?, 'pending') \
         ON CONFLICT(file_id) DO UPDATE SET patient_serial = excluded.patient_serial, updated_at = CURRENT_TIMESTAMP",
        ["f1".into(), "upserted-serial".into()],
    )).await.unwrap();

    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT patient_serial FROM pending_device_entries WHERE file_id = ?",
        ["f1".into()],
    )).await.unwrap().unwrap();
    let serial: String = row.try_get("", "patient_serial").unwrap();
    assert_eq!(serial, "upserted-serial");
}
