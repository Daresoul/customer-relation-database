//! Tests for FileStorageService.
//!
//! The bulk of FileStorageService takes `&tauri::AppHandle` for path
//! resolution + writes files to disk. We test what we can without spinning
//! up a Tauri runtime: the pure `validate_file` function and the data-layer
//! contracts of the `medical_attachments` table the service relies on.
//!
//! Cross-boundary file I/O (upload + download + delete on disk) is covered
//! by the Layer 3 WebdriverIO suite against a real Tauri binary.

use crate::services::file_storage::FileStorageService;
use crate::services::patient::PatientService;
use crate::models::dto::CreatePatientDto;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

// ---------------------------------------------------------------------------
// validate_file — pure function, no DB / AppHandle
// ---------------------------------------------------------------------------

#[test]
fn validate_file_under_limit_succeeds() {
    let data = vec![0u8; 1024 * 100]; // 100 KB
    let r = FileStorageService::validate_file(&data, "test.pdf", 10);
    assert!(r.is_ok());
}

#[test]
fn validate_file_at_exact_limit_succeeds() {
    let data = vec![0u8; 5 * 1024 * 1024]; // exactly 5 MB
    let r = FileStorageService::validate_file(&data, "test.bin", 5);
    assert!(r.is_ok(), "exactly-at-limit should pass");
}

#[test]
fn validate_file_over_limit_rejected() {
    let data = vec![0u8; 5 * 1024 * 1024 + 1]; // 5 MB + 1 byte
    let r = FileStorageService::validate_file(&data, "huge.bin", 5);
    assert!(r.is_err());
    assert!(r.unwrap_err().contains("5MB"));
}

#[test]
fn validate_file_empty_data_succeeds() {
    // Zero-byte file is a valid edge case (e.g., empty XML stub).
    let data: Vec<u8> = Vec::new();
    let r = FileStorageService::validate_file(&data, "empty.txt", 10);
    assert!(r.is_ok());
}

#[test]
fn validate_file_accepts_any_extension() {
    // Service documentation: "Allow all file types — doctors need to upload
    // various medical records, device data, images, PDFs, videos."
    let data = vec![0u8; 100];
    for ext in [".xml", ".pdf", ".jpg", ".mp4", ".exe", ".unknown"] {
        let r = FileStorageService::validate_file(&data, &format!("test{}", ext), 10);
        assert!(r.is_ok(), "should accept {}", ext);
    }
}

// ---------------------------------------------------------------------------
// medical_attachments table — data-layer contracts
// ---------------------------------------------------------------------------

async fn seed_record(db: &DatabaseConnection) -> i64 {
    let p = PatientService::create(
        db,
        CreatePatientDto {
            name: Some("Pet".to_string()), species_id: Some(1),
            breed_id: None, gender: None, date_of_birth: None,
            color: None, weight: None, microchip_id: None,
            medical_notes: None, household_id: None,
        },
    ).await.unwrap();
    let r = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'Record', 'desc', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [p.id.into()],
    )).await.unwrap();
    r.last_insert_id() as i64
}

async fn insert_attachment(
    db: &DatabaseConnection,
    record_id: i64,
    file_id: &str,
    original_name: &str,
    attachment_type: &str,
) -> i64 {
    let r = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, attachment_type) \
         VALUES (?, ?, ?, 1024, 'application/pdf', CURRENT_TIMESTAMP, ?)",
        [record_id.into(), file_id.into(), original_name.into(), attachment_type.into()],
    )).await.unwrap();
    r.last_insert_id() as i64
}

#[tokio::test]
async fn attachment_with_valid_record_succeeds() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;
    let attach_id = insert_attachment(&db, record_id, "uuid-1", "test.pdf", "file").await;
    assert!(attach_id > 0);
}

#[tokio::test]
async fn attachment_with_invalid_record_id_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let r = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, attachment_type) \
         VALUES (?, 'uuid-x', 'x.pdf', 100, 'application/pdf', CURRENT_TIMESTAMP, 'file')",
        [99999i64.into()],
    )).await;
    assert!(r.is_err(), "FK to medical_records should fail");
}

#[tokio::test]
async fn attachments_cascade_when_medical_record_deleted() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;
    insert_attachment(&db, record_id, "uuid-1", "a.pdf", "file").await;
    insert_attachment(&db, record_id, "uuid-2", "b.pdf", "generated_pdf").await;

    // Delete the medical_record
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM medical_records WHERE id = ?",
        [record_id.into()],
    )).await.unwrap();

    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM medical_attachments WHERE medical_record_id = ?",
        [record_id.into()],
    )).await.unwrap().unwrap();
    let leftover: i64 = row.try_get("", "c").unwrap();
    assert_eq!(leftover, 0, "attachments should cascade-delete with record");
}

#[tokio::test]
async fn multiple_attachments_per_record() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;
    for i in 0..5 {
        insert_attachment(&db, record_id, &format!("uuid-{}", i), &format!("file{}.pdf", i), "file").await;
    }
    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM medical_attachments WHERE medical_record_id = ?",
        [record_id.into()],
    )).await.unwrap().unwrap();
    let count: i64 = row.try_get("", "c").unwrap();
    assert_eq!(count, 5);
}

#[tokio::test]
async fn attachment_types_recorded_in_attachment_type_column() {
    // The three documented attachment_type values:
    //   'file'           — user-uploaded
    //   'test_result'    — raw device data
    //   'generated_pdf'  — Java PDF output
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;
    insert_attachment(&db, record_id, "u1", "x.pdf", "file").await;
    insert_attachment(&db, record_id, "u2", "y.xml", "test_result").await;
    insert_attachment(&db, record_id, "u3", "z.pdf", "generated_pdf").await;

    let rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT attachment_type FROM medical_attachments WHERE medical_record_id = ? ORDER BY id",
        [record_id.into()],
    )).await.unwrap();
    let types: Vec<String> = rows.iter().map(|r| r.try_get("", "attachment_type").unwrap()).collect();
    assert_eq!(types, vec!["file", "test_result", "generated_pdf"]);
}

#[tokio::test]
async fn attachment_device_metadata_optional() {
    // device_type / device_name / connection_method are nullable. Generated
    // PDFs don't have device metadata; only device-imported test results do.
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;

    // Insert without device metadata
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, attachment_type) \
         VALUES (?, 'no-device', 'report.pdf', 100, 'application/pdf', CURRENT_TIMESTAMP, 'generated_pdf')",
        [record_id.into()],
    )).await.unwrap();

    // Insert WITH device metadata
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, file_size, mime_type, uploaded_at, attachment_type, device_type, device_name, connection_method) \
         VALUES (?, 'with-device', 'data.xml', 100, 'application/xml', CURRENT_TIMESTAMP, 'test_result', 'exigo_eos_vet', 'Exigo Eos Vet', 'file_watch')",
        [record_id.into()],
    )).await.unwrap();

    let rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT file_id, device_type FROM medical_attachments WHERE medical_record_id = ? ORDER BY id",
        [record_id.into()],
    )).await.unwrap();
    assert_eq!(rows.len(), 2);

    let dev0: Option<String> = rows[0].try_get("", "device_type").ok();
    let dev1: Option<String> = rows[1].try_get("", "device_type").ok();
    assert!(dev0.is_none(), "generated_pdf has no device");
    assert_eq!(dev1.as_deref(), Some("exigo_eos_vet"));
}

#[tokio::test]
async fn delete_single_attachment_leaves_others_intact() {
    let db = create_test_db_with_migrations().await;
    let record_id = seed_record(&db).await;
    let id1 = insert_attachment(&db, record_id, "u1", "a.pdf", "file").await;
    insert_attachment(&db, record_id, "u2", "b.pdf", "file").await;

    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM medical_attachments WHERE id = ?",
        [id1.into()],
    )).await.unwrap();

    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM medical_attachments WHERE medical_record_id = ?",
        [record_id.into()],
    )).await.unwrap().unwrap();
    let remaining: i64 = row.try_get("", "c").unwrap();
    assert_eq!(remaining, 1);
}
