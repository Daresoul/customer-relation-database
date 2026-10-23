//! The app header's patient search (pet name, chip, owner name, owner phone)
//! and the dashboard's "seen today" count, against the real migrated schema.

use crate::services::dashboard::count_patients_seen_between;
use crate::services::patient_search::{search_patients_everywhere, PatientSearchHit};
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn insert(db: &DatabaseConnection, sql: &str, values: Vec<sea_orm::Value>) -> i64 {
    db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .last_insert_id() as i64
}

/// A household with one primary owner (and a phone), holding one pet.
async fn family(
    db: &DatabaseConnection,
    pet: &str,
    chip: Option<&str>,
    owner: (&str, &str),
    phone: &str,
) -> i64 {
    let h = insert(db, "INSERT INTO households (household_name) VALUES (?)", vec![owner.1.into()]).await;
    let person = insert(
        db,
        "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, 1)",
        vec![h.into(), owner.0.into(), owner.1.into()],
    )
    .await;
    insert(
        db,
        "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, 'phone', ?, 1)",
        vec![person.into(), phone.into()],
    )
    .await;
    let p = insert(
        db,
        "INSERT INTO patients (name, microchip_id) VALUES (?, ?)",
        vec![pet.into(), chip.map(str::to_string).into()],
    )
    .await;
    insert(
        db,
        "INSERT INTO patient_households (patient_id, household_id, is_primary) VALUES (?, ?, 1)",
        vec![p.into(), h.into()],
    )
    .await;
    p
}

async fn ids(db: &DatabaseConnection, query: &str) -> Vec<i64> {
    search(db, query).await.into_iter().map(|h| h.patient_id).collect()
}

async fn search(db: &DatabaseConnection, query: &str) -> Vec<PatientSearchHit> {
    search_patients_everywhere(db, query, 20)
        .await
        .unwrap_or_else(|e| panic!("search {query:?} failed: {e}"))
}

#[tokio::test]
async fn finds_a_pet_by_its_name_in_any_case_and_script() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Шарко", None, ("Ана", "Петровска"), "070 123 456").await;
    family(&db, "Bella", None, ("John", "Smith"), "071 000 000").await;

    assert_eq!(ids(&db, "шарко").await, vec![rex]);
}

#[tokio::test]
async fn finds_a_pet_by_its_chip() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Rex", Some("807000000123456"), ("Ана", "Петровска"), "070 123 456").await;

    assert_eq!(ids(&db, "807000000123456").await, vec![rex]);
}

#[tokio::test]
async fn finds_every_pet_of_an_owner_by_owner_name_cyrillic_or_latin() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Rex", None, ("Ана", "Петровска"), "070 123 456").await;
    let bella = family(&db, "Bella", None, ("John", "Smith"), "071 000 000").await;

    assert_eq!(ids(&db, "петровска").await, vec![rex]);
    assert_eq!(ids(&db, "Smith").await, vec![bella]);
}

#[tokio::test]
async fn finds_a_pet_by_owner_phone_typed_with_dashes_or_run_together() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Rex", None, ("Ана", "Петровска"), "070 123 456").await;

    assert_eq!(ids(&db, "070-123-456").await, vec![rex]);
    assert_eq!(ids(&db, "070123456").await, vec![rex]);
}

#[tokio::test]
async fn a_hit_carries_the_owner_name_phone_and_household() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Rex", Some("807000000123456"), ("Ана", "Петровска"), "070 123 456").await;

    let hits = search(&db, "Rex").await;

    assert_eq!(hits.len(), 1);
    let hit = &hits[0];
    assert_eq!(hit.patient_id, rex);
    assert_eq!(hit.patient_name.as_deref(), Some("Rex"));
    assert_eq!(hit.microchip_id.as_deref(), Some("807000000123456"));
    assert_eq!(hit.owner_name.as_deref(), Some("Ана Петровска"));
    assert_eq!(hit.owner_phone.as_deref(), Some("070 123 456"));
    assert!(hit.household_id.is_some());
}

#[tokio::test]
async fn a_pet_matching_by_name_and_by_owner_appears_once() {
    let db = create_test_db_with_migrations().await;
    let p = family(&db, "Smith", None, ("John", "Smith"), "071 000 000").await;

    assert_eq!(ids(&db, "Smith").await, vec![p]);
}

#[tokio::test]
async fn a_blank_query_finds_nothing() {
    let db = create_test_db_with_migrations().await;
    family(&db, "Rex", None, ("Ана", "Петровска"), "070 123 456").await;

    assert!(ids(&db, "   ").await.is_empty());
}

// ---------------------------------------------------------------------------
// Seen today
// ---------------------------------------------------------------------------

async fn record(db: &DatabaseConnection, patient_id: i64, created_at: &str) {
    insert(
        db,
        "INSERT INTO medical_records (patient_id, record_type, name, description, created_at, updated_at) \
         VALUES (?, 'note', 'Visit', 'x', ?, ?)",
        vec![patient_id.into(), created_at.into(), created_at.into()],
    )
    .await;
}

#[tokio::test]
async fn seen_today_counts_each_patient_with_a_record_in_the_range_once() {
    let db = create_test_db_with_migrations().await;
    let rex = family(&db, "Rex", None, ("Ана", "Петровска"), "070 123 456").await;
    let bella = family(&db, "Bella", None, ("John", "Smith"), "071 000 000").await;
    let old = family(&db, "Old", None, ("Old", "Timer"), "072 000 000").await;
    // Records are stamped with chrono's RFC 3339 (nanoseconds, +00:00).
    record(&db, rex, "2026-10-23T08:15:00.123456789+00:00").await;
    record(&db, rex, "2026-10-23T09:00:00+00:00").await;
    record(&db, bella, "2026-10-23T21:59:59+00:00").await;
    record(&db, old, "2026-10-22T21:59:59+00:00").await;

    // A local day in UTC+2, as the frontend sends it.
    let seen = count_patients_seen_between(&db, "2026-10-22T22:00:00.000Z", "2026-10-23T22:00:00.000Z")
        .await
        .unwrap();

    assert_eq!(seen, 2);
}
