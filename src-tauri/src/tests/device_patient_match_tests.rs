//! Lab result → patient matching by microchip (`commands::device_input`).

use crate::commands::device_input::resolve_patient;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

const CHIP: &str = "807010000007678";

async fn insert(db: &DatabaseConnection, sql: &str, values: Vec<sea_orm::Value>) -> i64 {
    db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .last_insert_id() as i64
}

async fn patient(db: &DatabaseConnection, name: &str, chip: &str, active: bool) -> i64 {
    insert(
        db,
        "INSERT INTO patients (name, microchip_id, is_active) VALUES (?, ?, ?)",
        vec![name.into(), chip.into(), active.into()],
    )
    .await
}

#[tokio::test]
async fn one_chip_match_selects_the_patient() {
    let db = create_test_db_with_migrations().await;
    let id = patient(&db, "Бобо", CHIP, true).await;

    let m = resolve_patient(&db, CHIP.to_string()).await.unwrap();

    assert_eq!(m.method, "microchip");
    assert!(!m.ambiguous);
    assert_eq!(m.patient.map(|p| p.id), Some(id));
}

#[tokio::test]
async fn two_active_patients_with_the_chip_are_ambiguous() {
    let db = create_test_db_with_migrations().await;
    patient(&db, "Бобо", CHIP, true).await;
    patient(&db, "Бобо 2", CHIP, true).await;

    let m = resolve_patient(&db, CHIP.to_string()).await.unwrap();

    assert!(m.patient.is_none(), "must not auto-pick one of two chip matches");
    assert!(m.ambiguous);
    assert_eq!(m.candidate_count, 2);
    assert_eq!(m.method, "microchip");
}

#[tokio::test]
async fn an_inactive_duplicate_does_not_make_the_chip_ambiguous() {
    let db = create_test_db_with_migrations().await;
    let active = patient(&db, "Бобо", CHIP, true).await;
    patient(&db, "Old Бобо", CHIP, false).await;

    let m = resolve_patient(&db, CHIP.to_string()).await.unwrap();

    assert_eq!(m.patient.map(|p| p.id), Some(active));
    assert!(!m.ambiguous);
}

#[tokio::test]
async fn chip_match_carries_the_patients_household() {
    let db = create_test_db_with_migrations().await;
    let id = patient(&db, "Бобо", CHIP, true).await;
    let h = insert(&db, "INSERT INTO households (household_name) VALUES ('Петровски')", vec![]).await;
    insert(
        &db,
        "INSERT INTO patient_households (patient_id, household_id, is_primary) VALUES (?, ?, 1)",
        vec![id.into(), h.into()],
    )
    .await;

    let m = resolve_patient(&db, CHIP.to_string()).await.unwrap();

    assert_eq!(m.patient.and_then(|p| p.household_id), Some(h));
}
