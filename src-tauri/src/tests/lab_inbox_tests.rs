//! Lab inbox (X1) and attach / move (X2).

use crate::models::dto::CreatePatientDto;
use crate::services::file_watcher::split_exigo_samples;
use crate::services::lab_inbox::{self, LabValue};
use crate::services::medical_record::PdfEnv;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

const DAILY: &[u8] = include_bytes!("../../tests/fixtures/exigo_daily_two_samples.xml");

/// The first sample of the fixture (ID2 "KOKO") as its own file.
fn koko_xml() -> Vec<u8> {
    split_exigo_samples(DAILY).into_iter().next().expect("fixture has samples").xml
}

async fn seed_patient(db: &DatabaseConnection, name: &str, chip: Option<&str>) -> i64 {
    PatientService::create(
        db,
        CreatePatientDto {
            name: Some(name.to_string()),
            species_id: Some(1),
            breed_id: None,
            gender: None,
            date_of_birth: None,
            color: None,
            weight: None,
            microchip_id: chip.map(str::to_string),
            medical_notes: None,
            household_id: None,
        },
    )
    .await
    .unwrap()
    .id
}

async fn seed_record(db: &DatabaseConnection, patient_id: i64, name: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', ?, 'Notes', 0, 1, '2026-10-20T10:00:00+00:00', '2026-10-20T10:00:00+00:00')",
        [patient_id.into(), name.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

/// Store `bytes` in `dir` and add a history row for it, as a delivery does.
async fn receive(
    db: &DatabaseConnection,
    dir: &std::path::Path,
    file_id: &str,
    bytes: &[u8],
    status: &str,
    received_at: &str,
) {
    let path = dir.join(file_id);
    std::fs::write(&path, bytes).unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO file_access_history (file_id, original_name, file_path, file_size, mime_type, device_type, device_name, \
         connection_method, received_at, status, error) \
         VALUES (?, 'BM-53672_1219.xml', ?, ?, 'application/xml', 'exigo_eos_vet', 'Exigo', 'file_watch', ?, ?, ?)",
        [
            file_id.into(),
            path.display().to_string().into(),
            (bytes.len() as i64).into(),
            received_at.into(),
            status.into(),
            if status == "failed" { Some("not xml".to_string()) } else { None::<String> }.into(),
        ],
    ))
    .await
    .unwrap();
}

async fn scalar_i64(db: &DatabaseConnection, sql: &str) -> i64 {
    db.query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await
        .unwrap()
        .unwrap()
        .try_get_by_index::<i64>(0)
        .unwrap()
}

async fn scalar_str(db: &DatabaseConnection, sql: &str) -> Option<String> {
    db.query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await
        .unwrap()
        .and_then(|r| r.try_get_by_index::<Option<String>>(0).ok().flatten())
}

fn value<'a>(values: &'a [LabValue], code: &str) -> &'a LabValue {
    values.iter().find(|v| v.code == code).unwrap_or_else(|| panic!("no {} in {:?}", code, values))
}

const DEV_JAR: &str = "../pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar";

fn jar_env(storage: &tempfile::TempDir) -> Option<PdfEnv> {
    let jar = std::path::PathBuf::from(DEV_JAR);
    if !jar.exists() || std::process::Command::new("java").arg("-version").output().is_err() {
        eprintln!("SKIP: JAR not built ({})", DEV_JAR);
        return None;
    }
    Some(PdfEnv { jar_path: jar, storage_dir: storage.path().to_path_buf() })
}

fn broken_env(storage: &tempfile::TempDir) -> PdfEnv {
    PdfEnv { jar_path: storage.path().join("missing.jar"), storage_dir: storage.path().to_path_buf() }
}

// ---------------------------------------------------------------------------
// Values with units and H/L flags
// ---------------------------------------------------------------------------

#[test]
fn exigo_values_carry_the_pdf_units_and_flags_from_the_machines_range() {
    let results = serde_json::json!({
        "ID2": "KOKO", "SNO": "53672",
        "RBC": "7.10", "RBC_L": "5.50", "RBC_H": "8.50",
        "MCH": "25.2", "MCH_L": "19.5", "MCH_H": "24.5",
        "EA": "0.0", "EA_F": "ER", "EA_L": "0.1", "EA_H": "1.5",
        "PLT": "285", "PLT_L": "200", "PLT_H": "500",
    });

    let values = lab_inbox::lab_values("exigo_eos_vet", &results);

    assert_eq!(values.iter().map(|v| v.code.as_str()).collect::<Vec<_>>(), ["PLT", "EA", "RBC", "MCH"]);
    assert_eq!(value(&values, "MCH").flag.as_deref(), Some("H"));
    assert_eq!(value(&values, "EA").flag.as_deref(), Some("L"));
    assert_eq!(value(&values, "RBC").flag, None);
    assert_eq!(value(&values, "RBC").unit.as_deref(), Some("10e+12/L"));
    assert_eq!(value(&values, "RBC").range.as_deref(), Some("5.50–8.50"));
}

#[test]
fn hl7_values_use_the_machines_unit_range_and_flag_and_skip_metadata() {
    let results = serde_json::json!({
        "ALT": "120", "ALT_unit": "U/L", "ALT_range": "10-100", "ALT_flag": "H",
        "GLU": "2.0", "GLU_unit": "mmol/L", "GLU_range": "3.9-6.1",
        "sample_id": "45512-10", "patient_name": "Rex", "PID_2": "x", "test_datetime": "20261023",
    });

    let values = lab_inbox::lab_values("mnchip_pointcare_chemistry", &results);

    assert_eq!(values.len(), 2, "{:?}", values);
    let alt = value(&values, "ALT");
    assert_eq!((alt.unit.as_deref(), alt.range.as_deref(), alt.flag.as_deref()), (Some("U/L"), Some("10-100"), Some("H")));
    assert_eq!(value(&values, "GLU").flag.as_deref(), Some("L"), "a missing flag is worked out from the range");
}

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_new_result_waits_in_the_inbox_with_its_values_and_machine_id() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;

    let items = lab_inbox::list_inbox(&db, Some("waiting")).await.unwrap();

    assert_eq!(items.len(), 1);
    let item = &items[0];
    assert_eq!(item.state, "waiting");
    assert_eq!(item.machine_patient_id.as_deref(), Some("KOKO"));
    assert_eq!(item.match_method, "none");
    assert_eq!(value(&item.values, "MCH").flag.as_deref(), Some("H"));
    assert_eq!(lab_inbox::waiting_count(&db).await.unwrap(), 1);
}

#[tokio::test]
async fn a_waiting_result_shows_the_patient_the_machine_id_matches() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let koko = seed_patient(&db, "Koko", None).await;
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;

    let item = lab_inbox::list_inbox(&db, Some("waiting")).await.unwrap().remove(0);

    assert_eq!(item.match_method, "name");
    assert_eq!(item.matched_patient_id, Some(koko));
    assert_eq!(item.matched_patient_name.as_deref(), Some("Koko"));
}

#[tokio::test]
async fn a_result_that_could_not_be_read_waits_with_its_error() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    receive(&db, dir.path(), "bad", b"garbage", "failed", "2026-10-23T08:00:00+00:00").await;

    let item = lab_inbox::list_inbox(&db, Some("waiting")).await.unwrap().remove(0);

    assert_eq!(item.status, "failed");
    assert_eq!(item.error.as_deref(), Some("not xml"));
    assert!(item.values.is_empty());
}

#[tokio::test]
async fn waiting_results_are_listed_oldest_first() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    receive(&db, dir.path(), "new", &koko_xml(), "ok", "2026-10-23T09:00:00+00:00").await;
    receive(&db, dir.path(), "old", &koko_xml(), "ok", "2026-10-22T09:00:00+00:00").await;

    let ids: Vec<String> = lab_inbox::list_inbox(&db, Some("waiting")).await.unwrap().into_iter().map(|i| i.file_id).collect();

    assert_eq!(ids, ["old", "new"]);
}

#[tokio::test]
async fn discard_keeps_the_result_with_its_reason() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    receive(&db, dir.path(), "qc1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;

    lab_inbox::discard(&db, "qc1", "qc", Some("morning control".to_string())).await.unwrap();

    assert_eq!(lab_inbox::waiting_count(&db).await.unwrap(), 0);
    let item = lab_inbox::list_inbox(&db, Some("discarded")).await.unwrap().remove(0);
    assert_eq!(item.discard_reason.as_deref(), Some("qc"));
    assert_eq!(item.discard_note.as_deref(), Some("morning control"));
    assert!(item.discarded_at.is_some());
}

#[tokio::test]
async fn discard_refuses_an_unknown_reason_and_an_attached_result() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let patient = seed_patient(&db, "Rex", None).await;
    let record = seed_record(&db, patient, "Visit").await;
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;

    assert!(lab_inbox::discard(&db, "r1", "because", None).await.is_err());
    lab_inbox::attach_to_record(&db, dir.path(), "r1", record).await.unwrap();
    assert!(lab_inbox::discard(&db, "r1", "qc", None).await.is_err());
}

#[tokio::test]
async fn restore_puts_a_discarded_result_back_in_waiting() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;
    lab_inbox::discard(&db, "r1", "duplicate", None).await.unwrap();

    lab_inbox::restore(&db, "r1").await.unwrap();

    let item = lab_inbox::list_inbox(&db, Some("waiting")).await.unwrap().remove(0);
    assert_eq!(item.discard_reason, None);
    assert_eq!(item.discarded_at, None);
}

// ---------------------------------------------------------------------------
// Attaching
// ---------------------------------------------------------------------------

#[tokio::test]
async fn attaching_to_an_existing_record_adds_a_lab_attachment_and_marks_the_result_attached() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let patient = seed_patient(&db, "Rex", None).await;
    let record = seed_record(&db, patient, "Consult").await;
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;

    let attachment = lab_inbox::attach_to_record(&db, dir.path(), "r1", record).await.unwrap();

    let row = db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT medical_record_id, file_id, attachment_type, device_type, device_name, source_file_id \
             FROM medical_attachments WHERE id = ?",
            [attachment.into()],
        ))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.try_get::<i64>("", "medical_record_id").unwrap(), record);
    assert_eq!(row.try_get::<String>("", "attachment_type").unwrap(), "test_result");
    assert_eq!(row.try_get::<String>("", "device_type").unwrap(), "exigo_eos_vet");
    assert_eq!(row.try_get::<String>("", "source_file_id").unwrap(), "r1");
    let stored: String = row.try_get("", "file_id").unwrap();
    assert_eq!(std::fs::read(dir.path().join(stored)).unwrap(), koko_xml());

    let item = lab_inbox::list_inbox(&db, Some("attached")).await.unwrap().remove(0);
    assert_eq!(item.attached_record_id, Some(record));
    assert_eq!(item.attached_record_name.as_deref(), Some("Consult"));
    assert_eq!(item.attached_patient_name.as_deref(), Some("Rex"));
    assert_eq!(item.attachment_id, Some(attachment));
    assert_eq!(lab_inbox::waiting_count(&db).await.unwrap(), 0);
}

#[tokio::test]
async fn an_upload_from_the_import_marks_its_result_attached() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let patient = seed_patient(&db, "Rex", None).await;
    let record = seed_record(&db, patient, "Lab").await;
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;
    let attachment = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, mime_type, attachment_type, device_type, device_name) \
             VALUES (?, 'copy', 'x.xml', 'application/xml', 'test_result', 'exigo_eos_vet', 'Exigo')",
            [record.into()],
        ))
        .await
        .unwrap()
        .last_insert_id() as i64;

    lab_inbox::mark_attached(&db, "r1", record, Some(attachment)).await.unwrap();

    let item = lab_inbox::list_inbox(&db, Some("attached")).await.unwrap().remove(0);
    assert_eq!(item.attached_record_id, Some(record));
    assert_eq!(item.attachment_id, Some(attachment));
}

// ---------------------------------------------------------------------------
// Moving a result to another patient
// ---------------------------------------------------------------------------

async fn attached_to_wrong_patient(db: &DatabaseConnection, dir: &std::path::Path) -> (i64, i64, i64) {
    let wrong = seed_patient(db, "Max", None).await;
    let right = seed_patient(db, "Koko", None).await;
    let wrong_record = seed_record(db, wrong, "Max bloods").await;
    let right_record = seed_record(db, right, "Koko consult").await;
    receive(db, dir, "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;
    let attachment = lab_inbox::attach_to_record(db, dir, "r1", wrong_record).await.unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, mime_type, attachment_type) \
         VALUES (?, 'old-pdf', 'Device Report - Max.pdf', 'application/pdf', 'generated_pdf')",
        [wrong_record.into()],
    ))
    .await
    .unwrap();
    (attachment, wrong_record, right_record)
}

#[tokio::test]
async fn moving_detaches_the_result_and_its_lab_pdf_and_attaches_it_to_the_chosen_record() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let (attachment, wrong_record, right_record) = attached_to_wrong_patient(&db, dir.path()).await;

    let outcome = lab_inbox::move_result(&broken_env(&dir), &db, attachment, right_record, Some("ana".to_string()))
        .await
        .unwrap();

    assert_eq!((outcome.from_record_id, outcome.to_record_id), (wrong_record, right_record));
    // Nothing is hard-deleted: the old rows stay, soft-deleted.
    assert_eq!(scalar_i64(&db, &format!("SELECT COUNT(*) FROM medical_attachments WHERE medical_record_id = {}", wrong_record)).await, 2);
    assert_eq!(
        scalar_i64(&db, &format!("SELECT COUNT(*) FROM medical_attachments WHERE medical_record_id = {} AND deleted_at IS NULL", wrong_record)).await,
        0
    );
    let moved: String = scalar_str(&db, &format!("SELECT file_id FROM medical_attachments WHERE id = {}", outcome.attachment_id)).await.unwrap();
    assert_eq!(std::fs::read(dir.path().join(moved)).unwrap(), koko_xml());
    assert_eq!(
        scalar_i64(&db, &format!(
            "SELECT COUNT(*) FROM medical_attachments WHERE id = {} AND medical_record_id = {} AND attachment_type = 'test_result' \
             AND device_type = 'exigo_eos_vet' AND source_file_id = 'r1' AND deleted_at IS NULL",
            outcome.attachment_id, right_record
        )).await,
        1
    );
    assert_eq!(
        scalar_i64(&db, &format!(
            "SELECT COUNT(*) FROM lab_result_moves WHERE from_attachment_id = {} AND to_attachment_id = {} \
             AND from_record_id = {} AND to_record_id = {} AND moved_by = 'ana' AND moved_at IS NOT NULL AND file_id = 'r1'",
            attachment, outcome.attachment_id, wrong_record, right_record
        )).await,
        1
    );
    let item = lab_inbox::list_inbox(&db, Some("attached")).await.unwrap().remove(0);
    assert_eq!(item.attached_record_id, Some(right_record));
    assert_eq!(item.attachment_id, Some(outcome.attachment_id));
    // The lab report could not be built here; the move still stands and says so.
    assert!(outcome.pdfs.iter().any(|p| p.kind == "device_report" && !p.ok));
}

#[tokio::test]
async fn moving_refuses_the_same_record_and_a_non_lab_file() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let (attachment, wrong_record, right_record) = attached_to_wrong_patient(&db, dir.path()).await;
    let pdf = scalar_i64(&db, "SELECT id FROM medical_attachments WHERE file_id = 'old-pdf'").await;

    assert!(lab_inbox::move_result(&broken_env(&dir), &db, attachment, wrong_record, None).await.is_err());
    assert!(lab_inbox::move_result(&broken_env(&dir), &db, pdf, right_record, None).await.is_err());
    assert!(lab_inbox::move_result(&broken_env(&dir), &db, attachment, 9999, None).await.is_err());
    assert_eq!(scalar_i64(&db, "SELECT COUNT(*) FROM medical_attachments WHERE deleted_at IS NOT NULL").await, 0);
}

#[tokio::test]
async fn moving_rebuilds_the_lab_report_on_the_chosen_record() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&dir) else { return };
    let (attachment, _wrong_record, right_record) = attached_to_wrong_patient(&db, dir.path()).await;

    let outcome = lab_inbox::move_result(&env, &db, attachment, right_record, None).await.unwrap();

    assert!(outcome.pdfs.iter().all(|p| p.ok), "{:?}", outcome.pdfs);
    assert_eq!(
        scalar_i64(&db, &format!(
            "SELECT COUNT(*) FROM medical_attachments WHERE medical_record_id = {} AND attachment_type = 'generated_pdf' AND deleted_at IS NULL",
            right_record
        )).await,
        1
    );
}

#[tokio::test]
async fn a_second_result_on_a_record_gives_one_lab_report_for_both() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&dir) else { return };
    let patient = seed_patient(&db, "Bella", None).await;
    let record = seed_record(&db, patient, "Consult").await;
    receive(&db, dir.path(), "r1", &koko_xml(), "ok", "2026-10-23T08:00:00+00:00").await;
    receive(&db, dir.path(), "r2", &koko_xml(), "ok", "2026-10-23T08:10:00+00:00").await;

    lab_inbox::attach_to_record(&db, dir.path(), "r1", record).await.unwrap();
    let first = lab_inbox::regenerate_lab_report(&env, &db, record).await.unwrap();
    lab_inbox::attach_to_record(&db, dir.path(), "r2", record).await.unwrap();
    let second = lab_inbox::regenerate_lab_report(&env, &db, record).await.unwrap();

    assert_ne!(first, second);
    let live: Vec<i64> = db
        .query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id FROM medical_attachments WHERE medical_record_id = ? AND attachment_type = 'generated_pdf' AND deleted_at IS NULL",
            [record.into()],
        ))
        .await
        .unwrap()
        .iter()
        .map(|r| r.try_get::<i64>("", "id").unwrap())
        .collect();
    assert_eq!(live, [second]);
}

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

#[tokio::test]
async fn upgrade_sorts_existing_results_into_the_inbox() {
    let db = create_test_db_with_migrations().await;
    let dir = tempfile::tempdir().unwrap();
    let patient = seed_patient(&db, "Rex", None).await;
    let record = seed_record(&db, patient, "Old visit").await;
    for id in ["attached", "parked", "old"] {
        receive(&db, dir.path(), id, &koko_xml(), "ok", "2026-09-01T08:00:00+00:00").await;
    }
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE file_access_history SET first_attached_to_record_id = ?, first_attached_at = '2026-09-01T09:00:00+00:00' WHERE file_id = 'attached'",
        [record.into()],
    ))
    .await
    .unwrap();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_attachments (medical_record_id, file_id, original_name, mime_type, attachment_type, device_type, device_name) \
         VALUES (?, 'copy', 'BM-53672_1219.xml', 'application/xml', 'test_result', 'exigo_eos_vet', 'Exigo')",
        [record.into()],
    ))
    .await
    .unwrap();
    db.execute_unprepared("INSERT INTO pending_device_entries (file_id, patient_serial, status) VALUES ('parked', 'REX', 'pending')")
        .await
        .unwrap();
    db.execute_unprepared("DELETE FROM migrations WHERE filename = '05x_lab_inbox'").await.unwrap();

    crate::database::migrations::run_migrations(db.get_sqlite_connection_pool()).await.unwrap();

    let state = |id: &str| format!("SELECT inbox_state FROM file_access_history WHERE file_id = '{}'", id);
    assert_eq!(scalar_str(&db, &state("attached")).await.as_deref(), Some("attached"));
    assert_eq!(scalar_str(&db, &state("parked")).await.as_deref(), Some("waiting"));
    assert_eq!(scalar_str(&db, &state("old")).await.as_deref(), Some("discarded"));
    assert_eq!(
        scalar_str(&db, "SELECT discard_reason FROM file_access_history WHERE file_id = 'old'").await.as_deref(),
        Some("before_inbox")
    );
    assert_eq!(
        scalar_i64(&db, "SELECT attached_record_id FROM file_access_history WHERE file_id = 'attached'").await,
        record
    );
    assert_eq!(
        scalar_str(&db, "SELECT source_file_id FROM medical_attachments WHERE file_id = 'copy'").await.as_deref(),
        Some("attached")
    );
    // The saved-for-later rows stay as they were.
    assert_eq!(scalar_i64(&db, "SELECT COUNT(*) FROM pending_device_entries").await, 1);
}
