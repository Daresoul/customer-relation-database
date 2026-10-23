//! Owner name printed on lab and record PDFs (`commands::medical`).

use crate::commands::medical::lookup_owner_name;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn insert(db: &DatabaseConnection, sql: &str, values: Vec<sea_orm::Value>) -> i64 {
    db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .last_insert_id() as i64
}

async fn patient_in_household(db: &DatabaseConnection, household_name: Option<&str>) -> (i64, i64) {
    let h = insert(
        db,
        "INSERT INTO households (household_name) VALUES (?)",
        vec![household_name.map(str::to_string).into()],
    )
    .await;
    let p = insert(db, "INSERT INTO patients (name) VALUES ('Rex')", vec![]).await;
    insert(
        db,
        "INSERT INTO patient_households (patient_id, household_id, is_primary) VALUES (?, ?, 1)",
        vec![p.into(), h.into()],
    )
    .await;
    (p, h)
}

async fn add_person(db: &DatabaseConnection, household_id: i64, first: &str, last: &str, primary: bool) {
    insert(
        db,
        "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)",
        vec![household_id.into(), first.into(), last.into(), primary.into()],
    )
    .await;
}

#[tokio::test]
async fn owner_is_the_primary_person() {
    let db = create_test_db_with_migrations().await;
    let (patient, household) = patient_in_household(&db, Some("Петровски")).await;
    add_person(&db, household, "Марко", "Петровски", false).await;
    add_person(&db, household, "Ана", "Петровска", true).await;

    assert_eq!(lookup_owner_name(&db, patient).await.unwrap(), "Ана Петровска");
}

#[tokio::test]
async fn owner_falls_back_to_the_household_name() {
    let db = create_test_db_with_migrations().await;
    let (patient, _) = patient_in_household(&db, Some("Петровски")).await;

    assert_eq!(lookup_owner_name(&db, patient).await.unwrap(), "Петровски");
}

#[tokio::test]
async fn owner_falls_back_to_any_person_when_household_has_no_name() {
    let db = create_test_db_with_migrations().await;
    let (patient, household) = patient_in_household(&db, None).await;
    add_person(&db, household, "Ана", "Петровска", false).await;

    assert_eq!(lookup_owner_name(&db, patient).await.unwrap(), "Ана Петровска");
}

#[tokio::test]
async fn owner_is_empty_without_a_household() {
    let db = create_test_db_with_migrations().await;
    let p = insert(&db, "INSERT INTO patients (name) VALUES ('Stray')", vec![]).await;

    assert_eq!(lookup_owner_name(&db, p).await.unwrap(), "");
}

#[tokio::test]
async fn record_pdfs_use_the_same_owner_and_macedonian_placeholders() {
    use crate::services::medical_record::MedicalRecordService;
    let db = create_test_db_with_migrations().await;
    let (patient, household) = patient_in_household(&db, Some("Петровски")).await;
    add_person(&db, household, "Ана", "Петровска", false).await;

    let data = MedicalRecordService::get_patient_for_pdf(&db, patient).await.unwrap();

    assert_eq!(data.owner, "Петровски");
    assert_eq!(data.species, "Непознат Вид");
    assert_eq!(data.gender, "Непознат");
}

#[tokio::test]
async fn a_failed_owner_lookup_fails_the_record_pdf() {
    use crate::services::medical_record::MedicalRecordService;
    let db = create_test_db_with_migrations().await;
    let (patient, _) = patient_in_household(&db, Some("Петровски")).await;
    db.execute_unprepared("PRAGMA foreign_keys = OFF").await.unwrap();
    db.execute_unprepared("DROP TABLE patient_households").await.unwrap();

    assert!(MedicalRecordService::get_patient_for_pdf(&db, patient).await.is_err());
}
