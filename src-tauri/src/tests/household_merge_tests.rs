//! Household merge, moving a pet, the single primary person and the guarded
//! delete, against the real migrated schema.

use crate::database::queries::{household as q, household_merge as m, household_search};
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};

async fn insert(db: &DatabaseConnection, sql: &str, values: Vec<Value>) -> i64 {
    db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .last_insert_id() as i64
}

async fn scalar(db: &DatabaseConnection, sql: &str, values: Vec<Value>) -> i64 {
    db.query_one(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap()
        .unwrap()
        .try_get_by_index::<i64>(0)
        .unwrap()
}

async fn household(db: &DatabaseConnection, name: &str) -> i32 {
    insert(db, "INSERT INTO households (household_name, address, city) VALUES (?, ?, ?)",
        vec![name.into(), format!("{name} street 1").into(), "Skopje".into()]).await as i32
}

async fn person(db: &DatabaseConnection, household_id: i32, first: &str, last: &str, primary: bool) -> i32 {
    insert(db, "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)",
        vec![household_id.into(), first.into(), last.into(), primary.into()]).await as i32
}

async fn contact(db: &DatabaseConnection, person_id: i32, kind: &str, value: &str) -> i64 {
    insert(db, "INSERT INTO person_contacts (person_id, contact_type, contact_value) VALUES (?, ?, ?)",
        vec![person_id.into(), kind.into(), value.into()]).await
}

async fn pet(db: &DatabaseConnection, household_id: i32, name: &str) -> i64 {
    let id = insert(db, "INSERT INTO patients (name, species_id) VALUES (?, 1)", vec![name.into()]).await;
    insert(db, "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, 'Pet', 1)",
        vec![id.into(), household_id.into()]).await;
    id
}

async fn pet_households(db: &DatabaseConnection, patient_id: i64) -> Vec<i32> {
    db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT household_id FROM patient_households WHERE patient_id = ? ORDER BY household_id",
        [patient_id.into()],
    ))
    .await
    .unwrap()
    .iter()
    .map(|r| r.try_get::<i32>("", "household_id").unwrap())
    .collect()
}

async fn primaries(db: &DatabaseConnection, household_id: i32) -> Vec<i32> {
    db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id FROM people WHERE household_id = ? AND is_primary = 1",
        [household_id.into()],
    ))
    .await
    .unwrap()
    .iter()
    .map(|r| r.try_get::<i32>("", "id").unwrap())
    .collect()
}

async fn hits(db: &DatabaseConnection, query: &str) -> Vec<i32> {
    household_search::search_households(db, query, Some(100), None)
        .await
        .unwrap()
        .results
        .into_iter()
        .map(|r| r.id)
        .collect()
}

/// Two households for the same family: "Petrovski" (kept) and "Petrovski
/// Family" (duplicate), with an overlapping phone and one pet each.
struct Family {
    keep: i32,
    dup: i32,
    marko: i32,
    ana: i32,
    rex: i64,
    luna: i64,
}

async fn family(db: &DatabaseConnection) -> Family {
    let keep = household(db, "Petrovski").await;
    let dup = household(db, "Petrovski Family").await;
    let marko = person(db, keep, "Marko", "Petrovski", true).await;
    contact(db, marko, "phone", "070 123 456").await;
    let ana = person(db, dup, "Ana", "Petrovska", true).await;
    contact(db, ana, "phone", "070-123-456").await;
    contact(db, ana, "email", "ana@example.mk").await;
    let rex = pet(db, keep, "Rex").await;
    let luna = pet(db, dup, "Luna").await;
    Family { keep, dup, marko, ana, rex, luna }
}

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

#[tokio::test]
async fn merge_moves_people_and_pets_to_the_kept_household() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    let kept = q::get_household_with_people(&db, f.keep).await.unwrap().unwrap();
    let mut names: Vec<_> = kept.people.iter().map(|p| p.first_name.clone()).collect();
    names.sort();
    assert_eq!(names, ["Ana", "Marko"]);
    assert_eq!(pet_households(&db, f.rex).await, [f.keep]);
    assert_eq!(pet_households(&db, f.luna).await, [f.keep]);
    assert_eq!(kept.pet_count, 2);
}

#[tokio::test]
async fn merge_keeps_one_primary_person_the_kept_households() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    assert_eq!(primaries(&db, f.keep).await, [f.marko]);
}

#[tokio::test]
async fn merge_drops_a_phone_the_kept_household_already_has() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    let phones = scalar(&db,
        "SELECT COUNT(*) FROM person_contacts pc JOIN people p ON p.id = pc.person_id \
         WHERE p.household_id = ? AND pc.contact_type = 'phone'", vec![f.keep.into()]).await;
    assert_eq!(phones, 1, "070-123-456 and 070 123 456 are the same number");
    let emails = scalar(&db,
        "SELECT COUNT(*) FROM person_contacts WHERE person_id = ? AND contact_type = 'email'",
        vec![f.ana.into()]).await;
    assert_eq!(emails, 1, "a contact the kept household lacks moves with its person");
}

#[tokio::test]
async fn merge_folds_the_same_person_into_one() {
    let db = create_test_db_with_migrations().await;
    let keep = household(&db, "Petrovski").await;
    let dup = household(&db, "Петровски").await;
    let marko = person(&db, keep, "Marko", "Petrovski", true).await;
    let marko_dup = person(&db, dup, "Марко", "Петровски", true).await;
    contact(&db, marko_dup, "email", "marko@example.mk").await;

    m::merge_households(&db, keep, dup, keep).await.unwrap();

    let kept = q::get_household_with_people(&db, keep).await.unwrap().unwrap();
    assert_eq!(kept.people.len(), 1, "Марко Петровски is Marko Petrovski");
    assert_eq!(kept.people[0].id, marko);
    assert_eq!(kept.people[0].contacts.len(), 1, "his email moves to the kept person");
}

#[tokio::test]
async fn merge_can_keep_the_other_households_name_and_address() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.dup).await.unwrap();

    let kept = q::get_household_with_people(&db, f.keep).await.unwrap().unwrap();
    assert_eq!(kept.household.id, f.keep);
    assert_eq!(kept.household.household_name.as_deref(), Some("Petrovski Family"));
    assert_eq!(kept.household.address.as_deref(), Some("Petrovski Family street 1"));
}

#[tokio::test]
async fn merged_away_household_is_kept_hidden_and_redirects() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    let merged_into = scalar(&db, "SELECT merged_into_id FROM households WHERE id = ?", vec![f.dup.into()]).await;
    assert_eq!(merged_into, f.keep as i64, "the row stays, pointing at the kept household");
    assert_eq!(m::resolve_household_id(&db, f.dup).await.unwrap(), Some(f.keep));
    let opened = q::get_household_with_people(&db, f.dup).await.unwrap().unwrap();
    assert_eq!(opened.household.id, f.keep, "an old link opens the kept household");

    let listed: Vec<i32> = household_search::list_households(&db, None, None).await.unwrap()
        .results.into_iter().map(|r| r.id).collect();
    assert_eq!(listed, [f.keep]);
    assert_eq!(household_search::list_households(&db, None, None).await.unwrap().total, 1);
}

#[tokio::test]
async fn search_index_follows_a_merge() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    assert_eq!(hits(&db, "Ana").await, [f.keep], "moved person is found under the kept household");
    assert_eq!(hits(&db, "ana@example.mk").await, [f.keep]);
    assert_eq!(hits(&db, "Family").await, Vec::<i32>::new(), "merged-away name is gone");
    let quick: Vec<i32> = household_search::quick_search_households(&db, "Petrovski", 10).await.unwrap()
        .into_iter().map(|(id, _)| id).collect();
    assert_eq!(quick, [f.keep]);
    let rows = scalar(&db, "SELECT COUNT(*) FROM household_search WHERE household_id = ?", vec![f.dup.into()]).await;
    assert_eq!(rows, 0);
}

#[tokio::test]
async fn merge_is_logged() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    let logged = scalar(&db,
        "SELECT COUNT(*) FROM household_merges WHERE kept_household_id = ? AND merged_household_id = ? \
         AND merged_household_name = 'Petrovski Family'", vec![f.keep.into(), f.dup.into()]).await;
    assert_eq!(logged, 1);
}

#[tokio::test]
async fn merge_refuses_the_same_household_or_one_already_merged() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;
    let other = household(&db, "Other").await;

    assert!(m::merge_households(&db, f.keep, f.keep, f.keep).await.is_err());
    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();
    assert!(m::merge_households(&db, other, f.dup, other).await.is_err());
    assert!(m::merge_households(&db, f.dup, other, other).await.is_err());
    assert!(m::merge_households(&db, f.keep, other, 999).await.is_err(), "details must come from one of the two");
}

#[tokio::test]
async fn a_failed_merge_changes_nothing() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    assert!(m::merge_households(&db, f.keep, 999, f.keep).await.is_err());

    assert_eq!(pet_households(&db, f.luna).await, [f.dup]);
    assert_eq!(primaries(&db, f.dup).await, [f.ana]);
}

#[tokio::test]
async fn preview_counts_both_sides() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;
    insert(&db, "INSERT INTO medical_records (patient_id, record_type, name, description) VALUES (?, 'procedure', 'Vaccine', 'x')",
        vec![f.luna.into()]).await;
    insert(&db, "INSERT INTO appointments (patient_id, title, start_time, end_time, created_by) \
         VALUES (?, 'Check-up', '2030-01-10T09:00:00Z', '2030-01-10T09:30:00Z', 'test')", vec![f.luna.into()]).await;

    let preview = m::merge_preview(&db, f.keep, f.dup).await.unwrap();

    assert_eq!(preview.keep.household.id, f.keep);
    assert_eq!(preview.merge.people.len(), 1);
    assert_eq!(preview.merge.pets.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Luna"]);
    assert_eq!(preview.merge.record_count, 1);
    assert_eq!(preview.merge.appointment_count, 1);
    assert_eq!(preview.keep.record_count, 0);
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_is_refused_while_the_household_has_pets() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    let err = q::delete_household(&db, f.dup).await.unwrap_err();

    assert!(err.starts_with("HOUSEHOLD_HAS_PETS"), "{err}");
    assert_eq!(pet_households(&db, f.luna).await, [f.dup], "the pet keeps its owner");
}

#[tokio::test]
async fn deleting_a_kept_household_removes_the_shells_merged_into_it() {
    let db = create_test_db_with_migrations().await;
    let keep = household(&db, "A").await;
    let dup = household(&db, "B").await;
    person(&db, keep, "Ana", "A", true).await;
    m::merge_households(&db, keep, dup, keep).await.unwrap();

    q::delete_household(&db, keep).await.unwrap();

    assert_eq!(scalar(&db, "SELECT COUNT(*) FROM households", vec![]).await, 0);
}

// ---------------------------------------------------------------------------
// move a pet
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_pet_moves_to_another_household() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    m::set_patient_household(&db, f.rex, Some(f.dup)).await.unwrap();

    assert_eq!(pet_households(&db, f.rex).await, [f.dup]);
}

#[tokio::test]
async fn moving_to_a_missing_household_keeps_the_old_owner() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    assert!(m::set_patient_household(&db, f.rex, Some(999)).await.is_err());

    assert_eq!(pet_households(&db, f.rex).await, [f.keep]);
}

#[tokio::test]
async fn moving_a_missing_pet_is_refused() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    assert!(m::set_patient_household(&db, 999, Some(f.keep)).await.is_err());
    assert_eq!(scalar(&db, "SELECT COUNT(*) FROM patient_households WHERE patient_id = 999", vec![]).await, 0);
}

#[tokio::test]
async fn moving_to_a_merged_away_household_lands_in_the_kept_one() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;
    let third = household(&db, "Third").await;
    let cat = pet(&db, third, "Cat").await;
    m::merge_households(&db, f.keep, f.dup, f.keep).await.unwrap();

    m::set_patient_household(&db, cat, Some(f.dup)).await.unwrap();

    assert_eq!(pet_households(&db, cat).await, [f.keep]);
}

// ---------------------------------------------------------------------------
// primary person
// ---------------------------------------------------------------------------

#[tokio::test]
async fn making_a_person_primary_unsets_the_others() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;
    let jana = person(&db, f.keep, "Jana", "Petrovska", false).await;

    m::set_primary_person(&db, jana).await.unwrap();

    assert_eq!(primaries(&db, f.keep).await, [jana]);
    assert_eq!(primaries(&db, f.dup).await, [f.ana], "other households are untouched");
}

#[tokio::test]
async fn deleting_the_primary_person_promotes_another() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;
    let jana = person(&db, f.keep, "Jana", "Petrovska", false).await;

    m::delete_person(&db, f.marko).await.unwrap();

    assert_eq!(primaries(&db, f.keep).await, [jana]);
}

#[tokio::test]
async fn the_last_person_cannot_be_deleted() {
    let db = create_test_db_with_migrations().await;
    let f = family(&db).await;

    assert!(m::delete_person(&db, f.marko).await.is_err());
    assert_eq!(primaries(&db, f.keep).await, [f.marko]);
}
