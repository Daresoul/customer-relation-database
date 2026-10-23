//! Duplicate warning on household create: phone, email and person name
//! (Latin or Cyrillic) against the real migrated schema.

use crate::database::queries::household_duplicates::{find_household_duplicates, DuplicateCheck};
use crate::database::queries::household_merge as m;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, Value};

async fn insert(db: &DatabaseConnection, sql: &str, values: Vec<Value>) -> i32 {
    db.execute(Statement::from_sql_and_values(DbBackend::Sqlite, sql, values))
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"))
        .last_insert_id() as i32
}

/// A household with one primary person and their contacts.
async fn client(db: &DatabaseConnection, household: &str, first: &str, last: &str, contacts: &[(&str, &str)]) -> i32 {
    let h = insert(db, "INSERT INTO households (household_name) VALUES (?)", vec![household.into()]).await;
    let p = insert(db, "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, 1)",
        vec![h.into(), first.into(), last.into()]).await;
    for (kind, value) in contacts {
        insert(db, "INSERT INTO person_contacts (person_id, contact_type, contact_value) VALUES (?, ?, ?)",
            vec![p.into(), (*kind).into(), (*value).into()]).await;
    }
    h
}

fn check() -> DuplicateCheck {
    DuplicateCheck::default()
}

async fn found(db: &DatabaseConnection, c: DuplicateCheck) -> Vec<(i32, Vec<String>)> {
    find_household_duplicates(db, &c)
        .await
        .unwrap()
        .into_iter()
        .map(|d| (d.household_id, d.reasons))
        .collect()
}

#[tokio::test]
async fn a_phone_matches_whatever_its_format() {
    let db = create_test_db_with_migrations().await;
    let h = client(&db, "Petrovski", "Marko", "Petrovski", &[("mobile", "+389 70 123 456")]).await;

    let hits = found(&db, DuplicateCheck { phones: vec!["070-123-456".into()], ..check() }).await;

    assert_eq!(hits, [(h, vec!["phone".to_string()])]);
}

#[tokio::test]
async fn a_short_phone_fragment_does_not_match() {
    let db = create_test_db_with_migrations().await;
    client(&db, "Petrovski", "Marko", "Petrovski", &[("phone", "070 123 456")]).await;

    assert!(found(&db, DuplicateCheck { phones: vec!["456".into()], ..check() }).await.is_empty());
}

#[tokio::test]
async fn an_email_matches_ignoring_case() {
    let db = create_test_db_with_migrations().await;
    let h = client(&db, "Petrovski", "Marko", "Petrovski", &[("email", "Marko@Example.mk")]).await;

    let hits = found(&db, DuplicateCheck { emails: vec![" marko@example.MK ".into()], ..check() }).await;

    assert_eq!(hits, [(h, vec!["email".to_string()])]);
}

#[tokio::test]
async fn a_latin_name_finds_a_cyrillic_person() {
    let db = create_test_db_with_migrations().await;
    let h = client(&db, "Петровски", "Марко", "Петровски", &[]).await;

    let hits = found(&db, DuplicateCheck {
        first_name: Some("marko".into()),
        last_name: Some("PETROVSKI".into()),
        ..check()
    }).await;

    assert_eq!(hits, [(h, vec!["name".to_string()])]);
}

#[tokio::test]
async fn a_cyrillic_name_finds_a_latin_person() {
    let db = create_test_db_with_migrations().await;
    let h = client(&db, "Zhivkovski", "Dzhemal", "Zhivkovski", &[]).await;

    let hits = found(&db, DuplicateCheck {
        first_name: Some("Џемал".into()),
        last_name: Some("Живковски".into()),
        ..check()
    }).await;

    assert_eq!(hits, [(h, vec!["name".to_string()])]);
}

#[tokio::test]
async fn the_same_surname_with_another_first_name_is_not_a_duplicate() {
    let db = create_test_db_with_migrations().await;
    client(&db, "Petrovski", "Marko", "Petrovski", &[]).await;

    let hits = found(&db, DuplicateCheck {
        household_name: Some("Petrovski".into()),
        first_name: Some("Ana".into()),
        last_name: Some("Petrovski".into()),
        ..check()
    }).await;

    assert!(hits.is_empty(), "{hits:?}");
}

#[tokio::test]
async fn a_household_name_alone_matches_in_either_script() {
    let db = create_test_db_with_migrations().await;
    let h = client(&db, "Петровски", "Марко", "Петровски", &[]).await;

    let hits = found(&db, DuplicateCheck { household_name: Some("Petrovski".into()), ..check() }).await;

    assert_eq!(hits, [(h, vec!["name".to_string()])]);
}

#[tokio::test]
async fn several_reasons_rank_first_and_are_all_listed() {
    let db = create_test_db_with_migrations().await;
    let name_only = client(&db, "Petrovski", "Marko", "Petrovski", &[]).await;
    let both = client(&db, "Petrovski 2", "Marko", "Petrovski", &[("phone", "070123456")]).await;

    let hits = found(&db, DuplicateCheck {
        first_name: Some("Marko".into()),
        last_name: Some("Petrovski".into()),
        phones: vec!["070 123 456".into()],
        ..check()
    }).await;

    assert_eq!(hits, [
        (both, vec!["phone".to_string(), "name".to_string()]),
        (name_only, vec!["name".to_string()]),
    ]);
}

#[tokio::test]
async fn a_match_shows_who_and_how_to_reach_them() {
    let db = create_test_db_with_migrations().await;
    client(&db, "Petrovski", "Marko", "Petrovski", &[("phone", "070 123 456")]).await;

    let hit = find_household_duplicates(&db, &DuplicateCheck { phones: vec!["070123456".into()], ..check() })
        .await
        .unwrap()
        .remove(0);

    assert_eq!(hit.household_name.as_deref(), Some("Petrovski"));
    assert_eq!(hit.primary_person.as_deref(), Some("Marko Petrovski"));
    assert_eq!(hit.phone.as_deref(), Some("070 123 456"));
    assert_eq!(hit.pet_count, 0);
}

#[tokio::test]
async fn at_most_five_matches() {
    let db = create_test_db_with_migrations().await;
    for i in 0..7 {
        client(&db, &format!("Petrovski {i}"), "Marko", "Petrovski", &[]).await;
    }

    let hits = found(&db, DuplicateCheck {
        first_name: Some("Marko".into()),
        last_name: Some("Petrovski".into()),
        ..check()
    }).await;

    assert_eq!(hits.len(), 5);
}

#[tokio::test]
async fn a_merged_away_household_is_never_suggested() {
    let db = create_test_db_with_migrations().await;
    let keep = client(&db, "Petrovski", "Marko", "Petrovski", &[]).await;
    let dup = client(&db, "Petrovski Family", "Ana", "Petrovska", &[("email", "ana@example.mk")]).await;
    m::merge_households(&db, keep, dup, keep).await.unwrap();

    let hits = found(&db, DuplicateCheck { emails: vec!["ana@example.mk".into()], ..check() }).await;

    assert_eq!(hits, [(keep, vec!["email".to_string()])]);
}

#[tokio::test]
async fn an_empty_check_finds_nothing() {
    let db = create_test_db_with_migrations().await;
    client(&db, "Petrovski", "Marko", "Petrovski", &[("phone", "070 123 456")]).await;

    assert!(found(&db, DuplicateCheck { phones: vec!["  ".into()], emails: vec!["".into()], ..check() }).await.is_empty());
}
