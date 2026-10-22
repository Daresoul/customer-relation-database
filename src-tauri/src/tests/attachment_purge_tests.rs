//! Purging the files of attachments deleted more than 30 days ago.

use std::path::Path;

use chrono::{DateTime, Duration, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

use crate::models::dto::CreatePatientDto;
use crate::services::attachment_purge::{is_purge_due, purge_deleted_attachments, PurgeReport};
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;

async fn seed_record(db: &DatabaseConnection) -> i64 {
    let p = PatientService::create(
        db,
        CreatePatientDto {
            name: Some("Pet".to_string()),
            species_id: Some(1),
            breed_id: None,
            gender: None,
            date_of_birth: None,
            color: None,
            weight: None,
            microchip_id: None,
            medical_notes: None,
            household_id: None,
        },
    )
    .await
    .unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'Record', 'desc', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [p.id.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

/// Inserts an attachment row; `deleted_at` is stored exactly as given.
async fn add_attachment(
    db: &DatabaseConnection,
    record_id: i64,
    file_id: &str,
    attachment_type: &str,
    deleted_at: Option<String>,
) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, attachment_type, deleted_at) \
         VALUES (?, ?, 'doc.pdf', 0, 'application/pdf', CURRENT_TIMESTAMP, ?, ?)",
        [
            record_id.into(),
            file_id.into(),
            attachment_type.into(),
            sea_orm::Value::String(deleted_at.map(Box::new)),
        ],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

fn write_file(dir: &Path, name: &str, size: usize) {
    std::fs::write(dir.join(name), vec![7u8; size]).unwrap();
}

fn days_ago(now: DateTime<Utc>, days: i64) -> String {
    (now - Duration::days(days)).to_rfc3339()
}

async fn purged_at(db: &DatabaseConnection, id: i64) -> Option<String> {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT purged_at FROM medical_attachments WHERE id = ?",
        [id.into()],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get::<Option<String>>("", "purged_at")
    .unwrap()
}

#[tokio::test]
async fn migration_051_adds_purged_at() {
    let db = create_test_db_with_migrations().await;
    let row = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS c FROM migrations WHERE filename = '051_add_attachment_purged_at'",
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.try_get::<i64>("", "c").unwrap(), 1);
    let col = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS c FROM pragma_table_info('medical_attachments') WHERE name = 'purged_at'",
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(col.try_get::<i64>("", "c").unwrap(), 1);
}

#[tokio::test]
async fn replaced_document_deleted_over_30_days_ago_is_purged_and_row_kept() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "old-note", 1000);
    let id = add_attachment(&db, rec, "old-note", "pharmacy_note", Some(days_ago(now, 31))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report, PurgeReport { purged: 1, bytes_freed: 1000, missing: 0, skipped: 0 });
    assert!(!dir.path().join("old-note").exists(), "file must be gone");
    assert!(purged_at(&db, id).await.is_some(), "row must be kept and marked purged");
}

#[tokio::test]
async fn every_generated_kind_is_purged() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    for kind in ["simple_report", "pharmacy_note", "invoice", "generated_pdf"] {
        write_file(dir.path(), kind, 10);
        add_attachment(&db, rec, kind, kind, Some(days_ago(now, 40))).await;
    }

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 4);
    assert_eq!(report.bytes_freed, 40);
}

#[tokio::test]
async fn user_file_deleted_over_30_days_ago_is_purged() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "upload", 5);
    write_file(dir.path(), "xml", 5);
    let a = add_attachment(&db, rec, "upload", "file", Some(days_ago(now, 31))).await;
    let b = add_attachment(&db, rec, "xml", "test_result", Some(days_ago(now, 31))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 2);
    assert!(purged_at(&db, a).await.is_some());
    assert!(purged_at(&db, b).await.is_some());
}

#[tokio::test]
async fn deleted_less_than_30_days_ago_is_kept() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "recent", 10);
    let id = add_attachment(&db, rec, "recent", "invoice", Some(days_ago(now, 29))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 0);
    assert!(dir.path().join("recent").exists());
    assert!(purged_at(&db, id).await.is_none());
}

#[tokio::test]
async fn live_attachment_is_never_touched() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "live", 10);
    add_attachment(&db, rec, "live", "invoice", None).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 0);
    assert!(dir.path().join("live").exists());
}

#[tokio::test]
async fn sqlite_timestamp_format_is_understood() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "plain", 10);
    let deleted = (now - Duration::days(45)).format("%Y-%m-%d %H:%M:%S").to_string();
    add_attachment(&db, rec, "plain", "invoice", Some(deleted)).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 1);
    assert!(!dir.path().join("plain").exists());
}

#[tokio::test]
async fn unreadable_deleted_at_is_left_alone() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "odd", 10);
    let id = add_attachment(&db, rec, "odd", "invoice", Some("yesterday".to_string())).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 0);
    assert_eq!(report.skipped, 1);
    assert!(dir.path().join("odd").exists());
    assert!(purged_at(&db, id).await.is_none());
}

#[tokio::test]
async fn second_run_does_not_count_again() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "once", 10);
    add_attachment(&db, rec, "once", "invoice", Some(days_ago(now, 31))).await;

    purge_deleted_attachments(&db, dir.path(), now).await.unwrap();
    let again = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(again, PurgeReport::default());
}

#[tokio::test]
async fn already_missing_file_is_marked_purged() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    let id = add_attachment(&db, rec, "gone", "invoice", Some(days_ago(now, 31))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report, PurgeReport { purged: 0, bytes_freed: 0, missing: 1, skipped: 0 });
    assert!(purged_at(&db, id).await.is_some());
}

#[tokio::test]
async fn file_ids_that_point_outside_storage_are_skipped() {
    let db = create_test_db_with_migrations().await;
    let root = tempfile::tempdir().unwrap();
    let storage = root.path().join("files").join("medical");
    std::fs::create_dir_all(&storage).unwrap();
    write_file(root.path(), "outside.txt", 10);
    write_file(&root.path().join("files"), "sibling.txt", 10);
    let absolute = root.path().join("outside.txt").display().to_string();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    let ids = [
        add_attachment(&db, rec, "../../outside.txt", "invoice", Some(days_ago(now, 31))).await,
        add_attachment(&db, rec, "../sibling.txt", "invoice", Some(days_ago(now, 31))).await,
        add_attachment(&db, rec, &absolute, "invoice", Some(days_ago(now, 31))).await,
        add_attachment(&db, rec, "", "invoice", Some(days_ago(now, 31))).await,
        add_attachment(&db, rec, ".", "invoice", Some(days_ago(now, 31))).await,
    ];

    let report = purge_deleted_attachments(&db, &storage, now).await.unwrap();

    assert_eq!(report, PurgeReport { purged: 0, bytes_freed: 0, missing: 0, skipped: 5 });
    assert!(root.path().join("outside.txt").exists());
    assert!(root.path().join("files").join("sibling.txt").exists());
    assert!(storage.exists());
    for id in ids {
        assert!(purged_at(&db, id).await.is_none());
    }
}

#[tokio::test]
async fn a_directory_in_storage_is_never_removed() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("sub")).unwrap();
    write_file(&dir.path().join("sub"), "inner", 10);
    let now = Utc::now();
    let rec = seed_record(&db).await;
    add_attachment(&db, rec, "sub", "invoice", Some(days_ago(now, 31))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.skipped, 1);
    assert!(dir.path().join("sub").join("inner").exists());
}

#[tokio::test]
async fn file_still_listed_in_device_file_history_is_kept() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "shared", 10);
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, device_type, device_name) \
         VALUES ('shared', 'r.xml', ?, 'exigo', 'Exigo')",
        [dir.path().join("shared").display().to_string().into()],
    ))
    .await
    .unwrap();
    let id = add_attachment(&db, rec, "shared", "test_result", Some(days_ago(now, 31))).await;

    let report = purge_deleted_attachments(&db, dir.path(), now).await.unwrap();

    assert_eq!(report.purged, 0);
    assert!(dir.path().join("shared").exists());
    assert!(purged_at(&db, id).await.is_none());
}

#[tokio::test]
async fn missing_storage_dir_is_an_error_and_marks_nothing() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let storage = dir.path().join("not-there");
    let now = Utc::now();
    let rec = seed_record(&db).await;
    let id = add_attachment(&db, rec, "x", "invoice", Some(days_ago(now, 31))).await;

    assert!(purge_deleted_attachments(&db, &storage, now).await.is_err());
    assert!(purged_at(&db, id).await.is_none());
}

#[tokio::test]
async fn purged_attachment_is_not_listed_on_the_record() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let now = Utc::now();
    let rec = seed_record(&db).await;
    write_file(dir.path(), "old", 10);
    write_file(dir.path(), "new", 10);
    add_attachment(&db, rec, "old", "invoice", Some(days_ago(now, 31))).await;
    let live = add_attachment(&db, rec, "new", "invoice", None).await;

    purge_deleted_attachments(&db, dir.path(), now).await.unwrap();
    let detail = MedicalRecordService::get_medical_record(&db, rec, false).await.unwrap();

    let ids: Vec<i64> = detail.attachments.iter().map(|a| a.id).collect();
    assert_eq!(ids, vec![live]);
}

#[test]
fn purge_is_due_on_first_run_and_after_a_day() {
    let now = Utc::now();
    assert!(is_purge_due(None, now));
    assert!(!is_purge_due(Some(now - Duration::hours(23)), now));
    assert!(is_purge_due(Some(now - Duration::hours(24)), now));
}
