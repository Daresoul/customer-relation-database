//! Medical record money paths: invoice number and date, clearing values,
//! one transaction for a record and its line items, PDF replacement.

use crate::models::dto::CreatePatientDto;
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn seed_patient(db: &DatabaseConnection) -> i64 {
    PatientService::create(
        db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
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
    .unwrap()
    .id
}

async fn insert_record_with_invoice(db: &DatabaseConnection, patient_id: i64, invoice: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records \
         (patient_id, record_type, name, description, discount_percent, manual_total, invoice_number, \
          is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'Visit', 'Notes', 10.0, 500.0, ?, 0, 1, \
                 '2026-10-20T10:00:00+00:00', '2026-10-20T10:00:00+00:00')",
        [patient_id.into(), invoice.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

// ---------------------------------------------------------------------------
// D1: every read carries the invoice number
// ---------------------------------------------------------------------------

#[tokio::test]
async fn record_detail_carries_invoice_number() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "007/2026").await;

    let detail = MedicalRecordService::get_medical_record(&db, id, false).await.unwrap();

    assert_eq!(detail.record.invoice_number.as_deref(), Some("007/2026"));
}

#[tokio::test]
async fn record_list_and_search_carry_invoice_number_and_money_fields() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    insert_record_with_invoice(&db, patient_id, "008/2026").await;

    let list = MedicalRecordService::get_medical_records(&db, patient_id, None, None).await.unwrap();
    let r = &list.records[0];
    assert_eq!(r.invoice_number.as_deref(), Some("008/2026"));
    assert_eq!(r.discount_percent, Some(10.0));
    assert_eq!(r.manual_total, Some(500.0));

    let found = MedicalRecordService::search_medical_records(&db, patient_id, "visit", false).await.unwrap();
    assert_eq!(found[0].invoice_number.as_deref(), Some("008/2026"));
    assert_eq!(found[0].discount_percent, Some(10.0));
}

#[tokio::test]
async fn record_at_version_carries_invoice_number() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "009/2026").await;

    let r = MedicalRecordService::get_record_at_version(&db, id, 1).await.unwrap();

    assert_eq!(r.invoice_number.as_deref(), Some("009/2026"));
}

// ---------------------------------------------------------------------------
// D5: a record and its line items are written together or not at all
// (D2/D1 contract checks ride along: clearing values, keeping the number)
// ---------------------------------------------------------------------------

use crate::models::dto::MaybeNull;
use crate::models::line_item::CreateLineItemInput;
use crate::models::medical::{CreateMedicalRecordInput, UpdateMedicalRecordInput};

fn item(name: &str, price: f64) -> CreateLineItemInput {
    CreateLineItemInput {
        template_id: None,
        name: name.to_string(),
        description: None,
        unit_price: price,
        currency_id: 1,
        quantity: 1,
        tax_rate_id: crate::models::dto::MaybeNull::Undefined,
    }
}

fn new_record(patient_id: i64, items: Vec<CreateLineItemInput>) -> CreateMedicalRecordInput {
    CreateMedicalRecordInput {
        patient_id,
        record_type: "procedure".to_string(),
        name: "Visit".to_string(),
        procedure_name: None,
        description: "Notes".to_string(),
        prescription_notes: None,
        price: None,
        currency_id: None,
        discount_percent: Some(10.0),
        manual_total: None,
        device_test_data: None,
        device_type: None,
        device_name: None,
        device_data_list: None,
        line_items: Some(items),
    }
}

fn no_changes() -> UpdateMedicalRecordInput {
    UpdateMedicalRecordInput {
        name: None,
        procedure_name: None,
        description: None,
        prescription_notes: None,
        price: MaybeNull::Undefined,
        currency_id: MaybeNull::Undefined,
        discount_percent: MaybeNull::Undefined,
        manual_total: MaybeNull::Undefined,
        is_archived: None,
        line_items: None,
    }
}

async fn count(db: &DatabaseConnection, sql: &str) -> i64 {
    let row = db
        .query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await
        .unwrap()
        .unwrap();
    row.try_get_by_index::<i64>(0).unwrap()
}

#[tokio::test]
async fn create_saves_record_items_and_first_history_row() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;

    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0), item("Vaccine", 800.0)]))
        .await
        .unwrap();

    assert_eq!(record.line_items.as_ref().map(|v| v.len()), Some(2));
    assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM medical_record_line_items WHERE medical_record_id = {}", record.id)).await, 2);
    assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM medical_record_history WHERE medical_record_id = {}", record.id)).await, 1);
}

#[tokio::test]
async fn create_with_a_bad_line_item_leaves_nothing_behind() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;

    let result = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0), item("  ", 1.0)])).await;

    assert!(result.is_err());
    assert_eq!(count(&db, "SELECT COUNT(*) FROM medical_records").await, 0);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM medical_record_line_items").await, 0);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM medical_record_history").await, 0);
}

#[tokio::test]
async fn update_with_a_bad_line_item_changes_nothing() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)]))
        .await
        .unwrap();

    let mut changes = no_changes();
    changes.name = Some("Renamed".to_string());
    changes.discount_percent = MaybeNull::Value(50.0);
    changes.line_items = Some(vec![item("Vaccine", 800.0), item("", 1.0)]);
    let result = MedicalRecordService::save_record_changes(&db, record.id, changes).await;

    assert!(result.is_err());
    let after = MedicalRecordService::get_medical_record(&db, record.id, true).await.unwrap();
    assert_eq!(after.record.name, "Visit");
    assert_eq!(after.record.discount_percent, Some(10.0));
    assert_eq!(after.record.version, 1);
    let items = after.record.line_items.unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].name, "Exam");
    assert_eq!(after.history.unwrap().len(), 1);
}

#[tokio::test]
async fn update_keeps_the_invoice_number() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "011/2026").await;

    let mut changes = no_changes();
    changes.description = Some("Fixed typo".to_string());
    let updated = MedicalRecordService::save_record_changes(&db, id, changes).await.unwrap();

    assert_eq!(updated.invoice_number.as_deref(), Some("011/2026"));
}

#[tokio::test]
async fn editing_name_and_description_keeps_the_search_index_healthy() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![])).await.unwrap();

    for (name, description) in [("Renamed", "Fixed typo"), ("Again", "Another wording")] {
        let mut changes = no_changes();
        changes.name = Some(name.to_string());
        changes.description = Some(description.to_string());
        MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();
    }

    db.execute_unprepared("INSERT INTO medical_records_fts(medical_records_fts) VALUES('integrity-check')")
        .await
        .expect("search index is corrupt");
    let hits = count(&db, "SELECT COUNT(*) FROM medical_records_fts WHERE medical_records_fts MATCH 'wording'").await;
    assert_eq!(hits, 1);
    let stale = count(&db, "SELECT COUNT(*) FROM medical_records_fts WHERE medical_records_fts MATCH 'typo'").await;
    assert_eq!(stale, 0);
}

// ---------------------------------------------------------------------------
// D4: invoice date in clinic time, set once with the number
// ---------------------------------------------------------------------------

fn skopje_winter(rfc3339_utc: &str) -> chrono::DateTime<chrono::FixedOffset> {
    chrono::DateTime::parse_from_rfc3339(rfc3339_utc)
        .unwrap()
        .with_timezone(&chrono::FixedOffset::east_opt(3600).unwrap())
}

async fn stored_invoice_date(db: &DatabaseConnection, id: i64) -> Option<String> {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT invoice_date FROM medical_records WHERE id = ?",
        [id.into()],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get::<Option<String>>("", "invoice_date")
    .unwrap()
}

#[tokio::test]
async fn first_invoice_after_local_midnight_takes_the_local_date_and_year() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)])).await.unwrap();

    // 00:30 on 1 Jan in Skopje is still 31 Dec in UTC.
    let invoice = MedicalRecordService::assign_invoice(&db, record.id, skopje_winter("2025-12-31T23:30:00Z")).await.unwrap();

    assert_eq!(invoice.number, "001/2026");
    assert_eq!(invoice.date, chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap());
    assert_eq!(stored_invoice_date(&db, record.id).await.as_deref(), Some("2026-01-01"));
}

#[tokio::test]
async fn a_later_edit_keeps_the_invoice_number_and_date() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)])).await.unwrap();
    let first = MedicalRecordService::assign_invoice(&db, record.id, skopje_winter("2025-12-20T10:00:00Z")).await.unwrap();

    let again = MedicalRecordService::assign_invoice(&db, record.id, skopje_winter("2026-01-05T10:00:00Z")).await.unwrap();

    assert_eq!(first.number, "001/2025");
    assert_eq!(again.number, "001/2025");
    assert_eq!(again.date, chrono::NaiveDate::from_ymd_opt(2025, 12, 20).unwrap());
}

#[tokio::test]
async fn numbers_count_up_within_the_local_year() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let a = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1.0)])).await.unwrap();
    let b = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1.0)])).await.unwrap();

    MedicalRecordService::assign_invoice(&db, a.id, skopje_winter("2026-02-01T10:00:00Z")).await.unwrap();
    let second = MedicalRecordService::assign_invoice(&db, b.id, skopje_winter("2026-02-01T11:00:00Z")).await.unwrap();

    assert_eq!(second.number, "002/2026");
}

#[tokio::test]
async fn an_old_invoice_without_a_stored_date_gets_its_record_date() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    // created 2026-10-20T10:00Z, numbered before invoice dates were stored
    let id = insert_record_with_invoice(&db, patient_id, "012/2026").await;

    let invoice = MedicalRecordService::assign_invoice(&db, id, skopje_winter("2026-10-25T10:00:00Z")).await.unwrap();

    assert_eq!(invoice.number, "012/2026");
    assert_eq!(invoice.date, chrono::NaiveDate::from_ymd_opt(2026, 10, 20).unwrap());
    assert_eq!(stored_invoice_date(&db, id).await.as_deref(), Some("2026-10-20"));
}

#[tokio::test]
async fn update_can_clear_discount_manual_total_and_the_last_line_item() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let mut input = new_record(patient_id, vec![item("Exam", 1500.0)]);
    input.manual_total = Some(2000.0);
    let record = MedicalRecordService::save_new_record(&db, input).await.unwrap();

    let mut changes = no_changes();
    changes.discount_percent = MaybeNull::Null;
    changes.manual_total = MaybeNull::Null;
    changes.line_items = Some(vec![]);
    let updated = MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();

    assert_eq!(updated.discount_percent, None);
    assert_eq!(updated.manual_total, None);
    assert!(updated.line_items.is_none());
    assert_eq!(count(&db, &format!("SELECT COUNT(*) FROM medical_record_line_items WHERE medical_record_id = {}", record.id)).await, 0);
}

#[tokio::test]
async fn lab_reports_fall_back_to_the_records_own_time() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let id = insert_record_with_invoice(&db, patient_id, "013/2026").await;

    let time = MedicalRecordService::record_time(&db, id).await.unwrap();

    assert_eq!(time.to_rfc3339(), "2026-10-20T10:00:00+00:00");
}

// ---------------------------------------------------------------------------
// D9/D10: an edit regenerates every document, replaces the old one only after
// the new one is stored, and reports each document's outcome
// ---------------------------------------------------------------------------

use crate::services::medical_record::{PdfEnv, PdfStatus};

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
    PdfEnv {
        jar_path: storage.path().join("missing.jar"),
        storage_dir: storage.path().to_path_buf(),
    }
}

async fn active_documents(db: &DatabaseConnection, record_id: i64, attachment_type: &str) -> i64 {
    count(
        db,
        &format!(
            "SELECT COUNT(*) FROM medical_attachments WHERE medical_record_id = {} \
             AND attachment_type = '{}' AND deleted_at IS NULL",
            record_id, attachment_type
        ),
    )
    .await
}

fn status<'a>(statuses: &'a [PdfStatus], kind: &str) -> &'a PdfStatus {
    statuses.iter().find(|s| s.kind == kind).unwrap_or_else(|| panic!("no {} status in {:?}", kind, statuses))
}

async fn full_record(db: &DatabaseConnection) -> crate::models::medical::MedicalRecord {
    let patient_id = seed_patient(db).await;
    let mut input = new_record(patient_id, vec![item("Exam", 1500.0)]);
    input.prescription_notes = Some("Amoxicillin 2x daily".to_string());
    MedicalRecordService::save_new_record(db, input).await.unwrap()
}

#[tokio::test]
async fn an_edit_regenerates_each_document_and_replaces_the_old_one() {
    let storage = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&storage) else { return };
    let db = create_test_db_with_migrations().await;
    let record = full_record(&db).await;

    let first = MedicalRecordService::generate_record_documents(&env, &db, &record).await;
    let mut changes = no_changes();
    changes.description = Some("Corrected notes".to_string());
    let edited = MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();
    let second = MedicalRecordService::generate_record_documents(&env, &db, &edited).await;

    for statuses in [&first, &second] {
        for kind in ["report", "pharmacy_note", "invoice"] {
            assert!(status(statuses, kind).ok, "{:?}", statuses);
        }
    }
    for attachment_type in ["simple_report", "pharmacy_note", "invoice"] {
        assert_eq!(active_documents(&db, record.id, attachment_type).await, 1, "{}", attachment_type);
    }
}

#[tokio::test]
async fn a_failed_document_keeps_the_old_one_and_says_why() {
    let storage = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&storage) else { return };
    let db = create_test_db_with_migrations().await;
    let record = full_record(&db).await;
    MedicalRecordService::generate_record_documents(&env, &db, &record).await;

    let statuses = MedicalRecordService::generate_record_documents(&broken_env(&storage), &db, &record).await;

    for kind in ["report", "pharmacy_note", "invoice"] {
        let s = status(&statuses, kind);
        assert!(!s.ok);
        assert!(s.error.as_deref().is_some_and(|e| !e.is_empty()));
    }
    for attachment_type in ["simple_report", "pharmacy_note", "invoice"] {
        assert_eq!(active_documents(&db, record.id, attachment_type).await, 1, "{}", attachment_type);
    }
}

#[tokio::test]
async fn clearing_items_and_prescription_retires_their_documents() {
    let storage = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&storage) else { return };
    let db = create_test_db_with_migrations().await;
    let record = full_record(&db).await;
    MedicalRecordService::generate_record_documents(&env, &db, &record).await;

    let mut changes = no_changes();
    changes.prescription_notes = Some(String::new());
    changes.line_items = Some(vec![]);
    let edited = MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();
    let statuses = MedicalRecordService::generate_record_documents(&env, &db, &edited).await;

    assert!(status(&statuses, "report").ok);
    assert_eq!(active_documents(&db, record.id, "pharmacy_note").await, 0);
    assert_eq!(active_documents(&db, record.id, "invoice").await, 0);
}

#[tokio::test]
async fn one_document_can_be_retried_on_its_own() {
    let storage = tempfile::tempdir().unwrap();
    let Some(env) = jar_env(&storage) else { return };
    let db = create_test_db_with_migrations().await;
    let record = full_record(&db).await;
    MedicalRecordService::generate_record_documents(&broken_env(&storage), &db, &record).await;

    let retried = MedicalRecordService::regenerate_document(&env, &db, record.id, "invoice").await;

    assert!(retried.ok, "{:?}", retried);
    assert_eq!(active_documents(&db, record.id, "invoice").await, 1);
    assert_eq!(active_documents(&db, record.id, "simple_report").await, 0);
}

// ---------------------------------------------------------------------------
// A record whose line items or files can't be read is an error, not an empty
// list (a save would then drop the invoice)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_record_whose_line_items_cant_be_read_is_an_error() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)])).await.unwrap();
    db.execute_unprepared("DROP TABLE medical_record_line_items").await.unwrap();

    assert!(MedicalRecordService::get_medical_record(&db, record.id, false).await.is_err());

    let mut changes = no_changes();
    changes.name = Some("Renamed".to_string());
    assert!(MedicalRecordService::save_record_changes(&db, record.id, changes).await.is_err());
}

#[tokio::test]
async fn a_record_whose_files_cant_be_read_is_an_error() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![])).await.unwrap();
    db.execute_unprepared("PRAGMA foreign_keys = OFF").await.unwrap();
    db.execute_unprepared("DROP TABLE medical_attachments").await.unwrap();

    assert!(MedicalRecordService::get_medical_record(&db, record.id, false).await.is_err());
    assert!(MedicalRecordService::get_medical_records(&db, patient_id, None, None).await.is_err());
}

// ---------------------------------------------------------------------------
// Versions: an invoice-only edit is a new version; an edit that changes
// nothing writes no history
// ---------------------------------------------------------------------------

async fn history_versions(db: &DatabaseConnection, record_id: i64) -> Vec<(i64, String)> {
    db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT version, changed_fields FROM medical_record_history WHERE medical_record_id = ? ORDER BY id",
        [record_id.into()],
    ))
    .await
    .unwrap()
    .iter()
    .map(|r| (r.try_get::<i64>("", "version").unwrap(), r.try_get::<String>("", "changed_fields").unwrap()))
    .collect()
}

#[tokio::test]
async fn an_edit_of_only_the_invoice_lines_is_a_new_version() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)])).await.unwrap();

    let mut changes = no_changes();
    changes.line_items = Some(vec![item("Exam", 1500.0), item("Vaccine", 800.0)]);
    let updated = MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();

    assert_eq!(updated.version, 2);
    let history = history_versions(&db, record.id).await;
    assert_eq!(history.len(), 2);
    assert_eq!(history[1].0, 2);
    assert!(history[1].1.contains("line_items"), "{:?}", history);
}

#[tokio::test]
async fn an_edit_that_changes_nothing_keeps_the_version_and_writes_no_history() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let record = MedicalRecordService::save_new_record(&db, new_record(patient_id, vec![item("Exam", 1500.0)])).await.unwrap();

    let mut changes = no_changes();
    changes.name = Some("Visit".to_string());
    changes.line_items = Some(vec![item("Exam", 1500.0)]);
    let updated = MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();

    assert_eq!(updated.version, 1);
    assert_eq!(history_versions(&db, record.id).await.len(), 1);
}

// ---------------------------------------------------------------------------
// An old version shows that version's values, empty ones included
// ---------------------------------------------------------------------------

#[tokio::test]
async fn an_old_version_shows_its_own_values_including_empty_ones() {
    let db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&db).await;
    let mut input = new_record(patient_id, vec![item("Exam", 1500.0)]);
    input.prescription_notes = None;
    let record = MedicalRecordService::save_new_record(&db, input).await.unwrap();

    let mut changes = no_changes();
    changes.prescription_notes = Some("Amoxicillin".to_string());
    changes.discount_percent = MaybeNull::Null;
    changes.manual_total = MaybeNull::Value(2000.0);
    MedicalRecordService::save_record_changes(&db, record.id, changes).await.unwrap();

    let v1 = MedicalRecordService::get_record_at_version(&db, record.id, 1).await.unwrap();

    assert_eq!(v1.version, 1);
    assert_eq!(v1.prescription_notes, None);
    assert_eq!(v1.discount_percent, Some(10.0));
    assert_eq!(v1.manual_total, None);
    assert!(v1.line_items.is_none(), "a snapshot has no invoice lines");
}
