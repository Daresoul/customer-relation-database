//! The household search index (`household_search`, FTS5) against the real
//! migrated schema: the one-off rebuild migration, the triggers that keep it
//! fresh, and the query sanitiser.

use crate::database::migrations::run_migrations;
use crate::database::queries::household_search;
use crate::test_utils::{create_test_db_with_migrations, TestDb};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

async fn exec(db: &DatabaseConnection, sql: &str) {
    db.execute_unprepared(sql).await.unwrap_or_else(|e| panic!("{sql}: {e}"));
}

async fn insert_household(db: &DatabaseConnection, name: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO households (household_name) VALUES (?)",
        [name.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

async fn insert_person(db: &DatabaseConnection, household_id: i64, first: &str, last: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, 1)",
        [household_id.into(), first.into(), last.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

async fn insert_contact(db: &DatabaseConnection, person_id: i64, kind: &str, value: &str) -> i64 {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO person_contacts (person_id, contact_type, contact_value) VALUES (?, ?, ?)",
        [person_id.into(), kind.into(), value.into()],
    ))
    .await
    .unwrap()
    .last_insert_id() as i64
}

async fn hits(db: &DatabaseConnection, query: &str) -> Vec<i32> {
    household_search::search_households(db, query, Some(100), None)
        .await
        .unwrap_or_else(|e| panic!("search {query:?} failed: {e}"))
        .results
        .into_iter()
        .map(|r| r.id)
        .collect()
}

async fn index_rows(db: &DatabaseConnection, household_id: i64) -> i64 {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM household_search WHERE household_id = ?",
        [household_id.into()],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get("", "c")
    .unwrap()
}

/// Puts the DB back in the state migration 044 left at the clinic: an empty
/// index (its back-fill joined a table that never existed), and none of the
/// later migrations recorded.
async fn simulate_failed_044_backfill(db: &TestDb) {
    exec(db, "DELETE FROM household_search").await;
    exec(db, "DELETE FROM migrations WHERE filename >= '046'").await;
}

// ---------------------------------------------------------------------------
// C1: rebuild migration
// ---------------------------------------------------------------------------

#[tokio::test]
async fn migration_reindexes_households_missed_by_the_old_backfill() {
    let db = create_test_db_with_migrations().await;
    let mut ids = Vec::new();
    for (name, first, last, phone) in [
        ("Петровски", "Ана", "Петровска", "070 111 222"),
        ("Smith", "John", "Smithers", "071 333 444"),
        ("Трајковски", "Марко", "Трајков", "072 555 666"),
    ] {
        let h = insert_household(&db, name).await;
        let p = insert_person(&db, h, first, last).await;
        insert_contact(&db, p, "phone", phone).await;
        ids.push(h as i32);
    }
    simulate_failed_044_backfill(&db).await;
    assert!(hits(&db, "Петров").await.is_empty(), "precondition: index is empty");

    run_migrations(db.get_sqlite_connection_pool()).await.unwrap();

    for (id, name, person, phone) in [
        (ids[0], "Петров", "Ана", "111"),
        (ids[1], "Smith", "John", "333"),
        (ids[2], "Трајковски", "Марко", "555"),
    ] {
        assert!(hits(&db, name).await.contains(&id), "household name {name}");
        assert!(hits(&db, person).await.contains(&id), "person name {person}");
        assert!(hits(&db, phone).await.contains(&id), "phone {phone}");
    }
}

#[tokio::test]
async fn migration_indexes_households_without_people() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Самостојни").await;
    simulate_failed_044_backfill(&db).await;

    run_migrations(db.get_sqlite_connection_pool()).await.unwrap();

    assert_eq!(hits(&db, "Самостојни").await, vec![h as i32]);
}

// ---------------------------------------------------------------------------
// C1: triggers keep the index fresh
// ---------------------------------------------------------------------------

#[tokio::test]
async fn renaming_a_household_reindexes_it() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Oldname").await as i32;

    exec(&db, &format!("UPDATE households SET household_name = 'Newname' WHERE id = {h}")).await;

    assert_eq!(hits(&db, "Newname").await, vec![h]);
    assert!(hits(&db, "Oldname").await.is_empty());
}

#[tokio::test]
async fn editing_address_and_city_reindexes_the_household() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Address").await as i32;

    exec(&db, &format!("UPDATE households SET address = 'Партизанска 12', city = 'Битола' WHERE id = {h}")).await;

    assert_eq!(hits(&db, "Партизанска").await, vec![h]);
    assert_eq!(hits(&db, "Битола").await, vec![h]);
}

#[tokio::test]
async fn editing_a_person_reindexes_their_household() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Family").await;
    let p = insert_person(&db, h, "Ана", "Петровска").await;

    exec(&db, &format!("UPDATE people SET last_name = 'Николовска' WHERE id = {p}")).await;

    assert_eq!(hits(&db, "Николовска").await, vec![h as i32]);
    assert!(hits(&db, "Петровска").await.is_empty());
}

#[tokio::test]
async fn deleting_a_person_removes_their_name_and_contacts() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Family").await;
    insert_person(&db, h, "Keep", "Keeper").await;
    let p = insert_person(&db, h, "Gone", "Goner").await;
    insert_contact(&db, p, "email", "goner@example.com").await;

    exec(&db, &format!("DELETE FROM people WHERE id = {p}")).await;

    assert!(hits(&db, "Goner").await.is_empty());
    assert!(hits(&db, "goner").await.is_empty());
    assert_eq!(hits(&db, "Keeper").await, vec![h as i32]);
}

#[tokio::test]
async fn editing_and_deleting_contacts_reindexes_the_household() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Contacts").await;
    let p = insert_person(&db, h, "A", "B").await;
    let c = insert_contact(&db, p, "phone", "070 999 888").await;

    exec(&db, &format!("UPDATE person_contacts SET contact_value = '075 444 333' WHERE id = {c}")).await;
    assert_eq!(hits(&db, "444").await, vec![h as i32]);
    assert!(hits(&db, "999").await.is_empty());

    exec(&db, &format!("DELETE FROM person_contacts WHERE id = {c}")).await;
    assert!(hits(&db, "444").await.is_empty());
}

#[tokio::test]
async fn adding_a_person_restores_a_missing_index_row() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Lost").await;
    exec(&db, &format!("DELETE FROM household_search WHERE household_id = {h}")).await;

    insert_person(&db, h, "Found", "Again").await;

    assert_eq!(hits(&db, "Lost").await, vec![h as i32]);
    assert_eq!(hits(&db, "Again").await, vec![h as i32]);
}

#[tokio::test]
async fn deleting_a_household_drops_its_index_row() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Doomed").await;
    let p = insert_person(&db, h, "A", "B").await;
    insert_contact(&db, p, "phone", "070 000 111").await;

    exec(&db, &format!("DELETE FROM households WHERE id = {h}")).await;

    assert_eq!(index_rows(&db, h).await, 0);
}

#[tokio::test]
async fn each_household_has_exactly_one_index_row_after_edits() {
    let db = create_test_db_with_migrations().await;
    let h = insert_household(&db, "Once").await;
    let p = insert_person(&db, h, "A", "B").await;
    insert_contact(&db, p, "phone", "070").await;
    exec(&db, &format!("UPDATE households SET household_name = 'Twice' WHERE id = {h}")).await;
    exec(&db, &format!("UPDATE people SET first_name = 'C' WHERE id = {p}")).await;

    assert_eq!(index_rows(&db, h).await, 1);
}

// ---------------------------------------------------------------------------
// C3: the household list has no hidden cap
// ---------------------------------------------------------------------------

async fn insert_households(db: &DatabaseConnection, n: usize) {
    for i in 0..n {
        insert_household(db, &format!("H{i:04}")).await;
    }
}

#[tokio::test]
async fn household_list_without_limit_returns_every_household() {
    let db = create_test_db_with_migrations().await;
    insert_households(&db, 150).await;

    let all = household_search::list_households(&db, None, None).await.unwrap();

    assert_eq!(all.results.len(), 150);
    assert_eq!(all.total, 150);
    assert!(!all.has_more);
}

#[tokio::test]
async fn household_list_honours_a_limit_above_100() {
    let db = create_test_db_with_migrations().await;
    insert_households(&db, 150).await;

    let page = household_search::list_households(&db, Some(120), None).await.unwrap();
    assert_eq!(page.results.len(), 120);
    assert!(page.has_more);

    let rest = household_search::list_households(&db, Some(120), Some(120)).await.unwrap();
    assert_eq!(rest.results.len(), 30);
    assert!(!rest.has_more);
}

// ---------------------------------------------------------------------------
// C2: FTS5 special characters in the query
// ---------------------------------------------------------------------------

async fn household_with(db: &DatabaseConnection, name: &str, first: &str, last: &str, phone: &str) -> i32 {
    let h = insert_household(db, name).await;
    let p = insert_person(db, h, first, last).await;
    insert_contact(db, p, "phone", phone).await;
    h as i32
}

#[tokio::test]
async fn phone_typed_with_dashes_finds_the_household() {
    let db = create_test_db_with_migrations().await;
    let spaced = household_with(&db, "Spaced", "A", "B", "070 123 456").await;
    let plain = household_with(&db, "Plain", "C", "D", "071987654").await;

    assert!(hits(&db, "070-123-456").await.contains(&spaced));
    assert!(hits(&db, "071-987-654").await.contains(&plain));
    assert!(hits(&db, "070123456").await.contains(&spaced));
}

#[tokio::test]
async fn hyphenated_surname_finds_the_household() {
    let db = create_test_db_with_migrations().await;
    let h = household_with(&db, "Двојни", "Ана", "Петровска-Николовска", "070").await;

    assert_eq!(hits(&db, "Петровска-Николовска").await, vec![h]);
    assert_eq!(hits(&db, "Петровска-Никол").await, vec![h]);
}

#[tokio::test]
async fn apostrophe_in_name_finds_the_household() {
    let db = create_test_db_with_migrations().await;
    let h = household_with(&db, "Irish", "Sean", "O'Brien", "070").await;

    assert_eq!(hits(&db, "O'Brien").await, vec![h]);
}

#[tokio::test]
async fn fts_syntax_in_the_query_never_errors() {
    let db = create_test_db_with_migrations().await;
    household_with(&db, "Syntax", "Not", "Near", "070 111").await;

    for q in [
        "*", "**", "\"", "\"unclosed", "a\"b", "NOT", "OR", "AND", "NEAR", "not or", "(abc",
        "abc)", "-abc", "^abc", "a:b", "col:value", "{x}", "+", "--", "a*b", "'", "''",
    ] {
        household_search::search_households(&db, q, None, None)
            .await
            .unwrap_or_else(|e| panic!("search {q:?}: {e}"));
        household_search::quick_search_households(&db, q, 10)
            .await
            .unwrap_or_else(|e| panic!("quick search {q:?}: {e}"));
    }
}

#[tokio::test]
async fn search_terms_that_are_fts_keywords_match_as_words() {
    let db = create_test_db_with_migrations().await;
    let h = household_with(&db, "Syntax", "Not", "Near", "070 111").await;

    assert_eq!(hits(&db, "NOT").await, vec![h]);
    assert_eq!(hits(&db, "near").await, vec![h]);
}

#[tokio::test]
async fn quick_search_handles_dashes_and_empty_queries() {
    let db = create_test_db_with_migrations().await;
    let h = household_with(&db, "Quick", "A", "B", "070 123 456").await;

    let found = household_search::quick_search_households(&db, "070-123", 10).await.unwrap();
    assert_eq!(found.iter().map(|(id, _)| *id).collect::<Vec<_>>(), vec![h]);
    assert!(household_search::quick_search_households(&db, "", 10).await.unwrap().is_empty());
    assert!(household_search::quick_search_households(&db, "--", 10).await.unwrap().is_empty());
}

// ---------------------------------------------------------------------------
// wave2/flow-frontdesk #5: Macedonian alphabetical order
// ---------------------------------------------------------------------------

#[tokio::test]
async fn household_list_follows_the_macedonian_alphabet_in_any_case() {
    let db = create_test_db_with_migrations().await;
    for name in ["Јованови", "Ѓорѓиеви", "ана", "Борисови", "Живкови", "Џамбазови", "Ѕвездини", "Andrews"] {
        insert_household(&db, name).await;
    }

    let names: Vec<String> = household_search::list_households(&db, None, None)
        .await
        .unwrap()
        .results
        .into_iter()
        .filter_map(|r| r.household_name)
        .collect();
    assert_eq!(
        names,
        ["Andrews", "ана", "Борисови", "Ѓорѓиеви", "Живкови", "Ѕвездини", "Јованови", "Џамбазови"]
    );

    let second_page: Vec<String> = household_search::list_households(&db, Some(3), Some(3))
        .await
        .unwrap()
        .results
        .into_iter()
        .filter_map(|r| r.household_name)
        .collect();
    assert_eq!(second_page, ["Ѓорѓиеви", "Живкови", "Ѕвездини"]);
}

// ---------------------------------------------------------------------------
// wave2/forms-validation #7: +389 and a leading 0 are the same phone
// ---------------------------------------------------------------------------

#[tokio::test]
async fn phone_search_reads_the_country_code_as_a_leading_zero() {
    let db = create_test_db_with_migrations().await;
    let local = household_with(&db, "Local", "A", "B", "070 123 456").await;
    let international = household_with(&db, "Intl", "C", "D", "+389 71 987 654").await;

    assert!(hits(&db, "+389 70 123 456").await.contains(&local));
    assert!(hits(&db, "0038970123456").await.contains(&local));
    assert!(hits(&db, "071987654").await.contains(&international));
    assert!(hits(&db, "071 987 654").await.contains(&international));

    let quick = household_search::quick_search_households(&db, "+38970123456", 10).await.unwrap();
    assert!(quick.iter().any(|(id, _)| *id == local));
}
