//! Integration tests for `MedicalRecordService`.
//!
//! `create_medical_record` and `update_medical_record` currently take
//! `&tauri::AppHandle` (defaulting to the production Wry runtime), so they
//! can't be invoked with `tauri::test::mock_builder` which produces
//! `AppHandle<MockRuntime>`. Tests that need those go through direct SQL to
//! seed fixtures and exercise the runtime-independent service methods
//! (`archive_medical_record`, `search_medical_records`, `get_medical_records`).
//!
//! Follow-up: see task #14 — refactor to runtime-generic to recover full
//! coverage of create/update.

use crate::models::dto::CreatePatientDto;
use crate::models::medical::MedicalRecordFilter;
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn seed_patient(db: &DatabaseConnection) -> i64 {
    PatientService::create(
        db,
        CreatePatientDto {
            name: Some("TestPet".to_string()),
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

/// Insert a medical record via direct SQL so tests don't need an AppHandle.
/// Mirrors the columns `create_medical_record` writes (minus the history snapshot,
/// which isn't relevant for archive/search tests).
async fn insert_record(
    db: &DatabaseConnection,
    patient_id: i64,
    name: &str,
    description: &str,
) -> i64 {
    let result = db
        .execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO medical_records \
             (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
             VALUES (?, 'procedure', ?, ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [patient_id.into(), name.into(), description.into()],
        ))
        .await
        .expect("insert");
    result.last_insert_id() as i64
}

// ---------------------------------------------------------------------------
// archive / unarchive
// ---------------------------------------------------------------------------

#[tokio::test]
async fn archive_sets_flag() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;
    let r1 = insert_record(&test_db, patient_id, "Annual checkup", "Routine").await;

    MedicalRecordService::archive_medical_record(&test_db, r1, true)
        .await
        .expect("archive");

    let row = test_db
        .query_one(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT is_archived FROM medical_records WHERE id = ?",
            [r1.into()],
        ))
        .await
        .unwrap()
        .unwrap();
    let archived: i64 = row.try_get("", "is_archived").unwrap();
    assert_eq!(archived, 1);
}

#[tokio::test]
async fn archive_then_unarchive_round_trip() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;
    let r = insert_record(&test_db, patient_id, "Vaccine", "Annual rabies").await;

    MedicalRecordService::archive_medical_record(&test_db, r, true).await.unwrap();
    MedicalRecordService::archive_medical_record(&test_db, r, false).await.unwrap();

    let row = test_db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT is_archived FROM medical_records WHERE id = ?",
        [r.into()],
    )).await.unwrap().unwrap();
    let archived: i64 = row.try_get("", "is_archived").unwrap();
    assert_eq!(archived, 0);
}

#[tokio::test]
async fn archive_nonexistent_does_not_panic() {
    let test_db = create_test_db_with_migrations().await;
    let result = MedicalRecordService::archive_medical_record(&test_db, 99999, true).await;
    // Implementation may return Ok(()) (UPDATE that affects 0 rows) or Err.
    // Either is acceptable as long as it doesn't panic.
    let _ = result;
}

// ---------------------------------------------------------------------------
// get_medical_records (filter by is_archived)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn list_filters_archived_when_is_archived_false() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    let r1 = insert_record(&test_db, patient_id, "Hidden", "in archive").await;
    insert_record(&test_db, patient_id, "Visible", "in active list").await;
    MedicalRecordService::archive_medical_record(&test_db, r1, true).await.unwrap();

    let filter = MedicalRecordFilter {
        record_type: None,
        is_archived: Some(false),
        search_term: None,
    };
    let response =
        MedicalRecordService::get_medical_records(&test_db, patient_id, Some(filter), None)
            .await
            .unwrap();
    let names: Vec<&str> = response.records.iter().map(|r| r.name.as_str()).collect();
    assert!(!names.contains(&"Hidden"));
    assert!(names.contains(&"Visible"));
}

#[tokio::test]
async fn list_excludes_archived_by_default_even_with_no_filter() {
    // Documents the implicit-default behavior: passing `None` for the filter
    // still hides archived rows. To see them, pass `is_archived: Some(true)`
    // or `is_archived: None` inside an explicit filter struct (which the
    // service treats as "no filter on this column").
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    let r1 = insert_record(&test_db, patient_id, "Archived", "x").await;
    insert_record(&test_db, patient_id, "Active", "y").await;
    MedicalRecordService::archive_medical_record(&test_db, r1, true).await.unwrap();

    let response =
        MedicalRecordService::get_medical_records(&test_db, patient_id, None, None)
            .await
            .unwrap();
    assert_eq!(response.records.len(), 1, "archived hidden by default");
    assert_eq!(response.records[0].name, "Active");
}

#[tokio::test]
async fn list_filters_by_record_type() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    test_db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'note', 'A note', 'desc', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [patient_id.into()],
    )).await.unwrap();
    test_db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'An exam', 'desc', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [patient_id.into()],
    )).await.unwrap();

    let filter = MedicalRecordFilter {
        record_type: Some("note".to_string()),
        is_archived: None,
        search_term: None,
    };
    let response =
        MedicalRecordService::get_medical_records(&test_db, patient_id, Some(filter), None)
            .await
            .unwrap();
    assert_eq!(response.records.len(), 1);
    assert_eq!(response.records[0].record_type, "note");
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

#[tokio::test]
async fn search_matches_by_name() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    insert_record(&test_db, patient_id, "Vaccination Rabies", "left flank").await;
    insert_record(&test_db, patient_id, "Dental cleaning", "yearly").await;

    let results = MedicalRecordService::search_medical_records(
        &test_db,
        patient_id,
        "vacc",
        false,
    )
    .await
    .unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].name.contains("Vaccination"));
}

#[tokio::test]
async fn search_matches_by_description() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    insert_record(
        &test_db,
        patient_id,
        "Annual visit",
        "Administered Rabies vaccine in left flank",
    )
    .await;

    let results = MedicalRecordService::search_medical_records(
        &test_db,
        patient_id,
        "rabies",
        false,
    )
    .await
    .unwrap();
    assert_eq!(results.len(), 1, "search should match across description");
}

#[tokio::test]
async fn search_excludes_archived_by_default_includes_when_requested() {
    let test_db = create_test_db_with_migrations().await;
    let patient_id = seed_patient(&test_db).await;

    let r1 = insert_record(&test_db, patient_id, "Archived Vaccine", "old").await;
    insert_record(&test_db, patient_id, "Active Vaccine", "new").await;
    MedicalRecordService::archive_medical_record(&test_db, r1, true).await.unwrap();

    let active = MedicalRecordService::search_medical_records(&test_db, patient_id, "Vaccine", false)
        .await
        .unwrap();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].name, "Active Vaccine");

    let all = MedicalRecordService::search_medical_records(&test_db, patient_id, "Vaccine", true)
        .await
        .unwrap();
    assert_eq!(all.len(), 2);
}

#[tokio::test]
async fn search_does_not_cross_patient_boundaries() {
    let test_db = create_test_db_with_migrations().await;
    let patient_a = seed_patient(&test_db).await;
    let patient_b = PatientService::create(
        &test_db,
        CreatePatientDto {
            name: Some("PatientB".to_string()),
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
    .id;

    insert_record(&test_db, patient_a, "A's vaccine", "for A").await;
    insert_record(&test_db, patient_b, "B's vaccine", "for B").await;

    let a_results =
        MedicalRecordService::search_medical_records(&test_db, patient_a, "vaccine", false)
            .await
            .unwrap();
    assert_eq!(a_results.len(), 1);
    assert!(a_results[0].name.starts_with("A"));
}
