//! Integration tests for household queries + FTS5 search.
//!
//! Exercises the query functions in `crate::database::queries::household` and
//! `::household_search` against the real production schema (via
//! `create_test_db_with_migrations`).

use crate::database::queries::{household as q, household_search};
use crate::models::household::*;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

fn person(first: &str, last: &str, primary: bool) -> CreatePersonWithContactsDto {
    CreatePersonWithContactsDto {
        person: CreatePersonDto {
            first_name: first.to_string(),
            last_name: last.to_string(),
            is_primary: Some(primary),
        },
        contacts: vec![],
    }
}

fn person_with(first: &str, last: &str, contact_type: &str, value: &str) -> CreatePersonWithContactsDto {
    CreatePersonWithContactsDto {
        person: CreatePersonDto {
            first_name: first.to_string(),
            last_name: last.to_string(),
            is_primary: None,
        },
        contacts: vec![CreateContactDto {
            contact_type: contact_type.to_string(),
            contact_value: value.to_string(),
            is_primary: Some(true),
        }],
    }
}

fn dto(name: &str, people: Vec<CreatePersonWithContactsDto>) -> CreateHouseholdWithPeopleDto {
    CreateHouseholdWithPeopleDto {
        household: CreateHouseholdDto {
            household_name: Some(name.to_string()),
            address: None,
            city: None,
            postal_code: None,
            notes: None,
        },
        people,
    }
}

// ---------------------------------------------------------------------------
// Validation (no DB needed)
// ---------------------------------------------------------------------------

#[test]
fn validation_rejects_zero_people() {
    let d = dto("Empty", vec![]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("at least one person"));
}

#[test]
fn validation_rejects_more_than_5_people() {
    let people = (0..6).map(|i| person(&format!("F{}", i), "L", false)).collect();
    let d = dto("Crowded", people);
    let err = d.validate().unwrap_err();
    assert!(err.contains("more than 5"));
}

#[test]
fn validation_accepts_exactly_5_people() {
    let people = (0..5).map(|i| person(&format!("F{}", i), "L", false)).collect();
    let d = dto("Five", people);
    assert!(d.validate().is_ok());
}

#[test]
fn validation_rejects_multiple_primaries() {
    let d = dto("Twins", vec![
        person("Alice", "Smith", true),
        person("Bob", "Smith", true),
    ]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("Only one person"));
}

#[test]
fn validation_rejects_empty_first_name() {
    let d = dto("Nameless", vec![person("", "Smith", true)]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("First name"));
}

#[test]
fn validation_rejects_empty_last_name() {
    let d = dto("Halfname", vec![person("Alice", "", true)]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("Last name"));
}

#[test]
fn validation_rejects_invalid_contact_type() {
    let d = dto("Bad contact", vec![person_with("Alice", "Smith", "fax", "555-1234")]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("Invalid contact type"));
}

#[test]
fn validation_rejects_email_without_at_sign() {
    let d = dto("Bad email", vec![person_with("Alice", "Smith", "email", "not-an-email")]);
    let err = d.validate().unwrap_err();
    assert!(err.contains("Invalid email"));
}

#[test]
fn validation_accepts_all_four_contact_types() {
    for ct in ["phone", "email", "mobile", "work_phone"] {
        let value = if ct == "email" { "x@y.z" } else { "555-0001" };
        let d = dto(&format!("OK {}", ct), vec![person_with("A", "B", ct, value)]);
        assert!(d.validate().is_ok(), "should accept {}", ct);
    }
}

// ---------------------------------------------------------------------------
// create_household_with_people — happy paths
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_single_person_household_succeeds() {
    let test_db = create_test_db_with_migrations().await;
    let result = q::create_household_with_people(
        &test_db,
        dto("Smith family", vec![person("Alice", "Smith", true)]),
    )
    .await
    .unwrap();

    assert_eq!(result.household.household_name.as_deref(), Some("Smith family"));
    assert_eq!(result.people.len(), 1);
    assert!(result.people[0].is_primary);
    assert_eq!(result.pet_count, 0);
}

#[tokio::test]
async fn create_multi_person_household_first_defaults_to_primary() {
    // When `is_primary` is None on every person, the create function defaults
    // the first person to primary. Explicit `false` is honored (see the
    // sibling test below).
    let test_db = create_test_db_with_migrations().await;
    let none_primary = |first: &str, last: &str| CreatePersonWithContactsDto {
        person: CreatePersonDto {
            first_name: first.to_string(),
            last_name: last.to_string(),
            is_primary: None,
        },
        contacts: vec![],
    };
    let result = q::create_household_with_people(
        &test_db,
        dto("Jones family", vec![
            none_primary("Alice", "Jones"),
            none_primary("Bob", "Jones"),
        ]),
    )
    .await
    .unwrap();

    assert_eq!(result.people.len(), 2);
    assert!(result.people[0].is_primary, "first person defaults to primary when none marked");
    assert!(!result.people[1].is_primary);
}

#[tokio::test]
async fn create_multi_person_household_honors_explicit_false_primary() {
    // Documenting the alternate branch: if every person has `Some(false)` for
    // is_primary, the default doesn't kick in and no one is primary.
    let test_db = create_test_db_with_migrations().await;
    let result = q::create_household_with_people(
        &test_db,
        dto("No-primary household", vec![
            person("Alice", "Jones", false),
            person("Bob", "Jones", false),
        ]),
    )
    .await
    .unwrap();

    assert!(!result.people.iter().any(|p| p.is_primary), "no one is primary when all explicit false");
}

#[tokio::test]
async fn create_with_contacts_persists_them() {
    let test_db = create_test_db_with_migrations().await;
    let result = q::create_household_with_people(
        &test_db,
        CreateHouseholdWithPeopleDto {
            household: CreateHouseholdDto {
                household_name: Some("Contactful".to_string()),
                address: Some("123 Main St".to_string()),
                city: None,
                postal_code: None,
                notes: None,
            },
            people: vec![CreatePersonWithContactsDto {
                person: CreatePersonDto {
                    first_name: "Alice".to_string(),
                    last_name: "Smith".to_string(),
                    is_primary: Some(true),
                },
                contacts: vec![
                    CreateContactDto {
                        contact_type: "email".to_string(),
                        contact_value: "alice@example.com".to_string(),
                        is_primary: Some(true),
                    },
                    CreateContactDto {
                        contact_type: "phone".to_string(),
                        contact_value: "+1-555-0100".to_string(),
                        is_primary: Some(false),
                    },
                ],
            }],
        },
    )
    .await
    .unwrap();

    let contacts = &result.people[0].contacts;
    assert_eq!(contacts.len(), 2);
    let emails: Vec<&str> = contacts.iter().filter(|c| c.contact_type == "email").map(|c| c.contact_value.as_str()).collect();
    assert_eq!(emails, vec!["alice@example.com"]);
}

#[tokio::test]
async fn create_household_with_nullable_fields_omitted() {
    let test_db = create_test_db_with_migrations().await;
    let result = q::create_household_with_people(
        &test_db,
        CreateHouseholdWithPeopleDto {
            household: CreateHouseholdDto {
                household_name: None,
                address: None,
                city: None,
                postal_code: None,
                notes: None,
            },
            people: vec![person("X", "Y", true)],
        },
    )
    .await
    .unwrap();

    assert!(result.household.household_name.is_none());
    assert!(result.household.address.is_none());
    assert!(result.household.notes.is_none());
}

#[tokio::test]
async fn create_household_rejects_validation_failure_before_touching_db() {
    let test_db = create_test_db_with_migrations().await;
    let initial_count = household_count(&test_db).await;

    let result = q::create_household_with_people(
        &test_db,
        dto("Bad", vec![]),  // zero people = validation error
    )
    .await;
    assert!(result.is_err());
    assert_eq!(household_count(&test_db).await, initial_count, "no row should be inserted");
}

// ---------------------------------------------------------------------------
// get_household_with_people
// ---------------------------------------------------------------------------

#[tokio::test]
async fn get_household_with_people_roundtrips() {
    let test_db = create_test_db_with_migrations().await;
    let created = q::create_household_with_people(
        &test_db,
        dto("Roundtrip", vec![person("Alice", "S", true)]),
    )
    .await
    .unwrap();

    let fetched = q::get_household_with_people(&test_db, created.household.id as i32).await.unwrap().expect("Some(household)");
    assert_eq!(fetched.household.id, created.household.id);
    assert_eq!(fetched.people.len(), 1);
    assert_eq!(fetched.people[0].first_name, "Alice");
}

#[tokio::test]
async fn get_household_nonexistent_returns_ok_none() {
    let test_db = create_test_db_with_migrations().await;
    let result = q::get_household_with_people(&test_db, 99999).await.unwrap();
    assert!(result.is_none());
}

// ---------------------------------------------------------------------------
// update_household
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_household_name_persists() {
    let test_db = create_test_db_with_migrations().await;
    let created = q::create_household_with_people(
        &test_db,
        dto("Original", vec![person("A", "B", true)]),
    )
    .await
    .unwrap();

    q::update_household(
        &test_db,
        created.household.id as i32,
        Some("Renamed".to_string()),
        None, // address unchanged
        None, // city unchanged
        None, // postal_code unchanged
        None, // notes unchanged
    )
    .await
    .unwrap();

    let fetched = q::get_household_with_people(&test_db, created.household.id as i32).await.unwrap().expect("Some(household)");
    assert_eq!(fetched.household.household_name.as_deref(), Some("Renamed"));
}

#[tokio::test]
async fn update_household_none_preserves_existing_via_coalesce() {
    // Pinning the COALESCE behavior: passing None for a field should keep the
    // current value (not clear to NULL).
    let test_db = create_test_db_with_migrations().await;
    let created = q::create_household_with_people(
        &test_db,
        CreateHouseholdWithPeopleDto {
            household: CreateHouseholdDto {
                household_name: Some("Keep me".to_string()),
                address: Some("Keep me too".to_string()),
                city: None,
                postal_code: None,
                notes: None,
            },
            people: vec![person("A", "B", true)],
        },
    )
    .await
    .unwrap();

    q::update_household(
        &test_db,
        created.household.id as i32,
        None, // household_name unchanged
        None, // address unchanged
        None, // city unchanged
        None, // postal_code unchanged
        Some("Added notes".to_string()),
    )
    .await
    .unwrap();

    let fetched = q::get_household_with_people(&test_db, created.household.id as i32).await.unwrap().expect("Some(household)");
    assert_eq!(fetched.household.household_name.as_deref(), Some("Keep me"));
    assert_eq!(fetched.household.address.as_deref(), Some("Keep me too"));
    assert_eq!(fetched.household.notes.as_deref(), Some("Added notes"));
}

// ---------------------------------------------------------------------------
// delete_household
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_household_removes_row() {
    let test_db = create_test_db_with_migrations().await;
    let created = q::create_household_with_people(
        &test_db,
        dto("Doomed", vec![person("A", "B", true)]),
    )
    .await
    .unwrap();

    q::delete_household(&test_db, created.household.id as i32).await.unwrap();
    let result = q::get_household_with_people(&test_db, created.household.id as i32).await.unwrap();
    assert!(result.is_none(), "should be gone");
}

#[tokio::test]
async fn delete_household_cascades_to_people_and_contacts() {
    let test_db = create_test_db_with_migrations().await;
    let created = q::create_household_with_people(
        &test_db,
        CreateHouseholdWithPeopleDto {
            household: CreateHouseholdDto {
                household_name: Some("Cascade".to_string()),
                address: None,
                city: None,
                postal_code: None,
                notes: None,
            },
            people: vec![CreatePersonWithContactsDto {
                person: CreatePersonDto {
                    first_name: "A".to_string(), last_name: "B".to_string(), is_primary: Some(true),
                },
                contacts: vec![CreateContactDto {
                    contact_type: "phone".to_string(), contact_value: "555".to_string(), is_primary: Some(true),
                }],
            }],
        },
    )
    .await
    .unwrap();
    let person_id = created.people[0].id as i64;

    q::delete_household(&test_db, created.household.id as i32).await.unwrap();

    // people row should be gone (FK CASCADE expected)
    let person_count: i64 = test_db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM people WHERE id = ?",
        [person_id.into()],
    )).await.unwrap().unwrap().try_get("", "c").unwrap();
    assert_eq!(person_count, 0, "person should cascade-delete with household");

    // contacts row should be gone too
    let contact_count: i64 = test_db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM person_contacts WHERE person_id = ?",
        [person_id.into()],
    )).await.unwrap().unwrap().try_get("", "c").unwrap();
    assert_eq!(contact_count, 0, "contacts should cascade-delete with person");
}

#[tokio::test]
async fn delete_nonexistent_household_does_not_error() {
    let test_db = create_test_db_with_migrations().await;
    // DELETE … WHERE id = 99999 just affects 0 rows; should be Ok.
    let result = q::delete_household(&test_db, 99999).await;
    assert!(result.is_ok());
}

// ---------------------------------------------------------------------------
// FTS5 search
// ---------------------------------------------------------------------------

#[tokio::test]
async fn search_finds_household_by_name() {
    let test_db = create_test_db_with_migrations().await;
    q::create_household_with_people(&test_db, dto("Anderson", vec![person("A", "B", true)])).await.unwrap();
    q::create_household_with_people(&test_db, dto("Brown", vec![person("C", "D", true)])).await.unwrap();

    let results = household_search::search_households(&test_db, "Anderson", None, None).await.unwrap();
    assert_eq!(results.results.len(), 1);
    assert_eq!(results.results[0].household_name.as_deref(), Some("Anderson"));
}

#[tokio::test]
async fn search_finds_household_by_person_name() {
    let test_db = create_test_db_with_migrations().await;
    q::create_household_with_people(
        &test_db,
        dto("Household1", vec![person("Charlotte", "Walker", true)]),
    )
    .await
    .unwrap();

    let results = household_search::search_households(&test_db, "Charlotte", None, None).await.unwrap();
    assert!(results.results.iter().any(|h| h.household_name.as_deref() == Some("Household1")));
}

#[tokio::test]
async fn search_finds_household_by_contact_email() {
    let test_db = create_test_db_with_migrations().await;
    q::create_household_with_people(
        &test_db,
        dto("EmailMatch", vec![person_with("A", "B", "email", "uniquetestemail@example.com")]),
    )
    .await
    .unwrap();

    let results = household_search::search_households(&test_db, "uniquetestemail", None, None).await.unwrap();
    assert!(
        results.results.iter().any(|h| h.household_name.as_deref() == Some("EmailMatch")),
        "should match by email contact"
    );
}

#[tokio::test]
async fn search_short_query_returns_all() {
    // Queries shorter than 2 chars bypass FTS5 and just list all households.
    let test_db = create_test_db_with_migrations().await;
    for n in ["A", "B", "C"] {
        q::create_household_with_people(&test_db, dto(n, vec![person("F", "L", true)])).await.unwrap();
    }
    let results = household_search::search_households(&test_db, "x", None, None).await.unwrap();
    assert_eq!(results.results.len(), 3);
}

#[tokio::test]
async fn search_empty_query_returns_all() {
    let test_db = create_test_db_with_migrations().await;
    for n in ["A", "B"] {
        q::create_household_with_people(&test_db, dto(n, vec![person("F", "L", true)])).await.unwrap();
    }
    let results = household_search::search_households(&test_db, "", None, None).await.unwrap();
    assert_eq!(results.results.len(), 2);
}

#[tokio::test]
async fn search_pagination_caps_limit_at_100() {
    let test_db = create_test_db_with_migrations().await;
    // Insert 3 households to confirm Some(200) doesn't blow up (max 100 cap)
    for n in ["A", "B", "C"] {
        q::create_household_with_people(&test_db, dto(n, vec![person("F", "L", true)])).await.unwrap();
    }
    let results = household_search::search_households(&test_db, "", Some(200), None).await.unwrap();
    assert!(results.results.len() <= 100);
}

#[tokio::test]
async fn search_handles_special_fts5_characters_safely() {
    // FTS5 sanitizer should strip syntax chars; query "ali@ce.com" must not panic.
    let test_db = create_test_db_with_migrations().await;
    q::create_household_with_people(
        &test_db,
        dto("X", vec![person_with("Alice", "Smith", "email", "alice@example.com")]),
    )
    .await
    .unwrap();

    let result = household_search::search_households(&test_db, "ali@ce.com", None, None).await;
    assert!(result.is_ok(), "should not panic on special chars: {:?}", result.err());
}

#[tokio::test]
async fn rebuild_search_index_does_not_panic_on_fresh_db() {
    let test_db = create_test_db_with_migrations().await;
    let result = household_search::rebuild_search_index(&test_db).await;
    assert!(result.is_ok(), "rebuild error: {:?}", result.err());
}

#[tokio::test]
async fn rebuild_search_index_restores_searchability() {
    let test_db = create_test_db_with_migrations().await;
    q::create_household_with_people(&test_db, dto("RebuildTest", vec![person("A", "B", true)])).await.unwrap();
    household_search::rebuild_search_index(&test_db).await.unwrap();

    let results = household_search::search_households(&test_db, "RebuildTest", None, None).await.unwrap();
    assert!(results.results.iter().any(|h| h.household_name.as_deref() == Some("RebuildTest")));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async fn household_count(db: &sea_orm::DatabaseConnection) -> i64 {
    db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) AS c FROM households",
        vec![],
    ))
    .await
    .unwrap()
    .unwrap()
    .try_get("", "c")
    .unwrap()
}
