//! Integration tests for `PatientService`.
//!
//! These run against a real production-schema SQLite DB (via
//! [`create_test_db_with_migrations`]). Every test gets its own temp file so
//! they can run in parallel without colliding.

use crate::models::dto::{CreatePatientDto, UpdatePatientDto, MaybeNull};
use crate::services::patient::PatientService;
use crate::test_utils::create_test_db_with_migrations;

/// Build a `CreatePatientDto` with mostly-empty defaults so tests can override
/// only the field(s) they care about.
fn minimal_dto() -> CreatePatientDto {
    CreatePatientDto {
        name: None,
        species_id: None,
        breed_id: None,
        gender: None,
        date_of_birth: None,
        color: None,
        weight: None,
        microchip_id: None,
        medical_notes: None,
        household_id: None,
    }
}

// ---------------------------------------------------------------------------
// create — happy paths
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_with_name_and_species_succeeds() {
    let db = create_test_db_with_migrations().await;

    let dto = CreatePatientDto {
        name: Some("Rex".to_string()),
        species_id: Some(1), // Dog (seeded by migration 023)
        ..minimal_dto()
    };

    let patient = PatientService::create(&db, dto).await.expect("create");
    assert_eq!(patient.name.as_deref(), Some("Rex"));
    assert_eq!(patient.species_id, Some(1));
    assert!(patient.is_active);
    assert!(patient.id > 0);
}

#[tokio::test]
async fn create_chip_only_stores_nulls() {
    // Regression: 6.10 in arc42-runtime-view. A scan-only patient should land
    // in the DB with literal NULL for name and species_id, not a placeholder.
    let db = create_test_db_with_migrations().await;

    let dto = CreatePatientDto {
        name: None,
        species_id: None,
        microchip_id: Some("807010000007678".to_string()),
        ..minimal_dto()
    };

    let patient = PatientService::create(&db, dto).await.expect("create");
    assert_eq!(patient.name, None, "name should be NULL");
    assert_eq!(patient.species_id, None, "species_id should be NULL");
    assert_eq!(patient.microchip_id.as_deref(), Some("807010000007678"));
}

#[tokio::test]
async fn create_with_only_microchip_no_name_succeeds() {
    // Mirrors the user flow: scanner produces a chip, user submits the
    // CreatePatientSection without filling name or species (conditional
    // validation drops the required flag).
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            microchip_id: Some("900000000000001".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert!(patient.name.is_none());
    assert!(patient.species_id.is_none());
}

#[tokio::test]
async fn create_with_only_name_no_species_succeeds() {
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Buddy".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert_eq!(patient.name.as_deref(), Some("Buddy"));
    assert!(patient.species_id.is_none());
}

// ---------------------------------------------------------------------------
// create — name normalization
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_empty_name_string_becomes_null() {
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("".to_string()),
            microchip_id: Some("900000000000002".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert_eq!(patient.name, None, "empty string should normalize to NULL");
}

#[tokio::test]
async fn create_whitespace_name_becomes_null() {
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("   ".to_string()),
            microchip_id: Some("900000000000003".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert_eq!(patient.name, None);
}

#[tokio::test]
async fn create_name_is_trimmed() {
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("  Whiskers  ".to_string()),
            species_id: Some(2),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert_eq!(patient.name.as_deref(), Some("Whiskers"));
}

#[tokio::test]
async fn create_empty_microchip_string_becomes_null() {
    let db = create_test_db_with_migrations().await;

    let patient = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            microchip_id: Some("".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect("create");

    assert!(patient.microchip_id.is_none());
}

// ---------------------------------------------------------------------------
// create — validation guards
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_with_neither_name_nor_microchip_fails() {
    // PatientService::create guards against the both-empty case so the API
    // can't silently insert an unidentifiable patient.
    let db = create_test_db_with_migrations().await;

    let err = PatientService::create(&db, minimal_dto())
        .await
        .expect_err("expected Err on both-empty");
    assert!(err.contains("name or a microchip ID"), "got: {}", err);
}

#[tokio::test]
async fn create_with_empty_name_and_empty_microchip_fails() {
    // Both fields present as empty strings — should normalize to None on both
    // sides and then hit the same guard.
    let db = create_test_db_with_migrations().await;

    let err = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("".to_string()),
            microchip_id: Some("   ".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .expect_err("expected Err");
    assert!(err.contains("name or a microchip ID"), "got: {}", err);
}

#[tokio::test]
async fn create_with_name_over_100_chars_fails_check_constraint() {
    let db = create_test_db_with_migrations().await;
    let long_name = "a".repeat(101);

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some(long_name),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err(), "expected length CHECK violation");
}

#[tokio::test]
async fn create_with_invalid_gender_fails_check_constraint() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            gender: Some("Yes".to_string()),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err(), "expected gender CHECK violation");
}

#[tokio::test]
async fn create_with_zero_weight_fails_check_constraint() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            weight: Some(0.0),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err(), "weight must be > 0");
}

#[tokio::test]
async fn create_with_negative_weight_fails_check_constraint() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            weight: Some(-5.0),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn create_with_microchip_over_50_chars_fails_check_constraint() {
    let db = create_test_db_with_migrations().await;
    let long_chip = "0".repeat(51);

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            microchip_id: Some(long_chip),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn create_with_invalid_species_id_fails_fk() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(9999),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err(), "should fail FK on species_id");
}

#[tokio::test]
async fn create_with_invalid_breed_id_fails_fk() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            breed_id: Some(9999),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_err(), "should fail FK on breed_id");
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_name_persists() {
    let db = create_test_db_with_migrations().await;
    let created = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Old Name".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let updated = PatientService::update(
        &db,
        created.id,
        UpdatePatientDto {
            name: Some("New Name".to_string()),
            species_id: MaybeNull::Undefined,
            breed_id: MaybeNull::Undefined,
            gender: MaybeNull::Undefined,
            date_of_birth: MaybeNull::Undefined,
            color: MaybeNull::Undefined,
            weight: MaybeNull::Undefined,
            microchip_id: MaybeNull::Undefined,
            medical_notes: MaybeNull::Undefined,
            is_active: None,
        },
    )
    .await
    .unwrap()
    .expect("update returned Some");

    assert_eq!(updated.name.as_deref(), Some("New Name"));
    assert_eq!(updated.species_id, Some(1), "untouched field stays");
}

#[tokio::test]
async fn update_clear_species_with_maybenull_null() {
    // MaybeNull::Null means "set to NULL" — distinct from Undefined (skip).
    let db = create_test_db_with_migrations().await;
    let created = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let updated = PatientService::update(
        &db,
        created.id,
        UpdatePatientDto {
            name: None,
            species_id: MaybeNull::Null,
            breed_id: MaybeNull::Undefined,
            gender: MaybeNull::Undefined,
            date_of_birth: MaybeNull::Undefined,
            color: MaybeNull::Undefined,
            weight: MaybeNull::Undefined,
            microchip_id: MaybeNull::Undefined,
            medical_notes: MaybeNull::Undefined,
            is_active: None,
        },
    )
    .await
    .unwrap()
    .expect("update returned Some");

    assert_eq!(updated.species_id, None, "species_id should be cleared");
    assert_eq!(updated.name.as_deref(), Some("Rex"), "name untouched");
}

#[tokio::test]
async fn update_nonexistent_patient_returns_none() {
    let db = create_test_db_with_migrations().await;

    let result = PatientService::update(
        &db,
        99999,
        UpdatePatientDto {
            name: Some("Ghost".to_string()),
            species_id: MaybeNull::Undefined,
            breed_id: MaybeNull::Undefined,
            gender: MaybeNull::Undefined,
            date_of_birth: MaybeNull::Undefined,
            color: MaybeNull::Undefined,
            weight: MaybeNull::Undefined,
            microchip_id: MaybeNull::Undefined,
            medical_notes: MaybeNull::Undefined,
            is_active: None,
        },
    )
    .await
    .unwrap();
    assert!(result.is_none(), "nonexistent id should return None");
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

#[tokio::test]
async fn delete_with_no_references_succeeds() {
    let db = create_test_db_with_migrations().await;
    let created = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Rex".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let deleted = PatientService::delete(&db, created.id).await.unwrap();
    assert!(deleted);

    let fetched = PatientService::get_by_id(&db, created.id).await.unwrap();
    assert!(fetched.is_none(), "should be gone");
}

#[tokio::test]
async fn delete_nonexistent_returns_false() {
    let db = create_test_db_with_migrations().await;
    let deleted = PatientService::delete(&db, 99999).await.unwrap();
    assert!(!deleted);
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

#[tokio::test]
async fn search_by_exact_microchip_match() {
    let db = create_test_db_with_migrations().await;

    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Findme".to_string()),
            species_id: Some(1),
            microchip_id: Some("807010000007678".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();
    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Other".to_string()),
            species_id: Some(1),
            microchip_id: Some("900000000000001".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let results = PatientService::search(&db, "807010000007678").await.unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name.as_deref(), Some("Findme"));
}

#[tokio::test]
async fn search_by_partial_name() {
    let db = create_test_db_with_migrations().await;

    for n in ["Rex", "Rexy", "Buddy"] {
        PatientService::create(
            &db,
            CreatePatientDto {
                name: Some(n.to_string()),
                species_id: Some(1),
                ..minimal_dto()
            },
        )
        .await
        .unwrap();
    }

    let results = PatientService::search(&db, "Rex").await.unwrap();
    assert_eq!(results.len(), 2, "Rex and Rexy match prefix");
}

#[tokio::test]
async fn search_empty_query_returns_all() {
    let db = create_test_db_with_migrations().await;

    for n in ["A", "B", "C"] {
        PatientService::create(
            &db,
            CreatePatientDto {
                name: Some(n.to_string()),
                species_id: Some(1),
                ..minimal_dto()
            },
        )
        .await
        .unwrap();
    }

    let results = PatientService::search(&db, "").await.unwrap();
    assert_eq!(results.len(), 3);
}

#[tokio::test]
async fn search_is_case_insensitive_for_cyrillic() {
    // Regression: SQLite LIKE / LOWER() only fold ASCII a-z/A-Z, so the
    // old `name LIKE ?` search couldn't match Macedonian Cyrillic names
    // differing only in case. search() now folds case in Rust.
    let db = create_test_db_with_migrations().await;

    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Шарко".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    // Lowercase query must find the capitalized stored name.
    let lower = PatientService::search(&db, "шарко").await.unwrap();
    assert_eq!(lower.len(), 1, "lowercase Cyrillic query should match");

    // Uppercase query must also match.
    let upper = PatientService::search(&db, "ШАРКО").await.unwrap();
    assert_eq!(upper.len(), 1, "uppercase Cyrillic query should match");

    // Partial (substring) Cyrillic match.
    let partial = PatientService::search(&db, "арк").await.unwrap();
    assert_eq!(partial.len(), 1, "Cyrillic substring should match");
}

#[tokio::test]
async fn search_chip_only_patient_findable_by_chip() {
    // Sanity check that chip-only patients (no name, no species) are still
    // discoverable via search.
    let db = create_test_db_with_migrations().await;

    PatientService::create(
        &db,
        CreatePatientDto {
            microchip_id: Some("807010000007678".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let results = PatientService::search(&db, "807010000007678").await.unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].name.is_none());
}

// ---------------------------------------------------------------------------
// Round 2 — extra edge cases (task #15)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_with_unicode_name_persists_exactly() {
    let db = create_test_db_with_migrations().await;
    let unicode = "Лили-Цветочек 🌸 (Lili)";
    let p = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some(unicode.to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();
    assert_eq!(p.name.as_deref(), Some(unicode));
}

#[tokio::test]
async fn create_with_name_exactly_100_chars_succeeds() {
    let db = create_test_db_with_migrations().await;
    let name = "a".repeat(100);
    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some(name.clone()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_ok(), "100 chars should be on the boundary, inclusive");
    assert_eq!(result.unwrap().name.as_deref(), Some(name.as_str()));
}

#[tokio::test]
async fn create_with_microchip_exactly_50_chars_succeeds() {
    let db = create_test_db_with_migrations().await;
    let chip = "0".repeat(50);
    let result = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Boundary".to_string()),
            species_id: Some(1),
            microchip_id: Some(chip.clone()),
            ..minimal_dto()
        },
    )
    .await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().microchip_id.as_deref(), Some(chip.as_str()));
}

#[tokio::test]
async fn create_with_weight_at_min_boundary_001_succeeds() {
    let db = create_test_db_with_migrations().await;
    let r = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Tiny".to_string()),
            species_id: Some(1),
            weight: Some(0.01),
            ..minimal_dto()
        },
    )
    .await;
    assert!(r.is_ok(), "0.01 is the floor — should pass");
}

#[tokio::test]
async fn create_with_weight_at_500_succeeds() {
    let db = create_test_db_with_migrations().await;
    let r = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Big".to_string()),
            species_id: Some(1),
            weight: Some(500.0),
            ..minimal_dto()
        },
    )
    .await;
    // The CHECK constraint is `weight IS NULL OR weight > 0` — there's no
    // upper bound today. 500.0 is documented as a soft maximum in the form
    // validator; if a backend constraint is added later this test surfaces it.
    assert!(r.is_ok(), "no upper-bound CHECK exists today; if added, update this test");
}

#[tokio::test]
async fn create_each_valid_gender_value_succeeds() {
    let db = create_test_db_with_migrations().await;
    for gender in ["Male", "Female", "Unknown"] {
        let r = PatientService::create(
            &db,
            CreatePatientDto {
                name: Some(format!("Pet-{}", gender)),
                species_id: Some(1),
                gender: Some(gender.to_string()),
                ..minimal_dto()
            },
        )
        .await;
        assert!(r.is_ok(), "{} should pass CHECK constraint", gender);
    }
}

#[tokio::test]
async fn get_all_on_empty_database_returns_empty_vec() {
    let db = create_test_db_with_migrations().await;
    let patients = PatientService::get_all(&db).await.unwrap();
    assert!(patients.is_empty());
}

#[tokio::test]
async fn get_by_id_nonexistent_returns_none() {
    let db = create_test_db_with_migrations().await;
    let result = PatientService::get_by_id(&db, 99999).await.unwrap();
    assert!(result.is_none());
}

#[tokio::test]
async fn search_special_characters_does_not_panic() {
    // SQL injection / FTS5 sanitization sanity check. Queries with quotes,
    // wildcards, semicolons should be treated as literal substrings, not
    // executed as SQL.
    let db = create_test_db_with_migrations().await;
    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Bobby Tables".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    // Each of these should return Ok (possibly empty), never panic / error
    for q in ["'", "\"", ";", "DROP TABLE patients;", "%", "_", "*"] {
        let result = PatientService::search(&db, q).await;
        assert!(result.is_ok(), "search panicked on input: {}", q);
    }

    // Verify the table is still intact afterward
    let all = PatientService::get_all(&db).await.unwrap();
    assert_eq!(all.len(), 1, "Bobby Tables should still exist");
}

#[tokio::test]
async fn case_insensitive_name_search() {
    let db = create_test_db_with_migrations().await;
    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("BUDDY".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();
    let upper = PatientService::search(&db, "BUDDY").await.unwrap();
    let lower = PatientService::search(&db, "buddy").await.unwrap();
    let mixed = PatientService::search(&db, "Buddy").await.unwrap();
    assert_eq!(upper.len(), 1);
    assert_eq!(lower.len(), 1, "search should be case-insensitive");
    assert_eq!(mixed.len(), 1);
}

#[tokio::test]
async fn update_with_all_undefined_is_no_op_but_succeeds() {
    let db = create_test_db_with_migrations().await;
    let created = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Stable".to_string()),
            species_id: Some(1),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let unchanged = PatientService::update(
        &db,
        created.id,
        UpdatePatientDto {
            name: None,
            species_id: MaybeNull::Undefined,
            breed_id: MaybeNull::Undefined,
            gender: MaybeNull::Undefined,
            date_of_birth: MaybeNull::Undefined,
            color: MaybeNull::Undefined,
            weight: MaybeNull::Undefined,
            microchip_id: MaybeNull::Undefined,
            medical_notes: MaybeNull::Undefined,
            is_active: None,
        },
    )
    .await
    .unwrap()
    .expect("Some");

    assert_eq!(unchanged.name.as_deref(), Some("Stable"));
    assert_eq!(unchanged.species_id, Some(1));
}

// ---------------------------------------------------------------------------
// Microchip uniqueness pinning (task #20)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn microchip_id_is_not_unique_today() {
    // No UNIQUE index exists on patients.microchip_id (verify via the schema).
    // If a future migration adds one, this test fails — that's the signal to
    // either rip out duplicate-microchip data or update this test to assert
    // the new constraint.
    let db = create_test_db_with_migrations().await;

    PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("First".to_string()),
            species_id: Some(1),
            microchip_id: Some("807010000007678".to_string()),
            ..minimal_dto()
        },
    )
    .await
    .unwrap();

    let dup = PatientService::create(
        &db,
        CreatePatientDto {
            name: Some("Duplicate-chip".to_string()),
            species_id: Some(1),
            microchip_id: Some("807010000007678".to_string()),
            ..minimal_dto()
        },
    )
    .await;

    // Pin current behavior — duplicates ARE allowed today. Domain-wise this is
    // wrong (a chip should be globally unique), but adding a UNIQUE constraint
    // requires deduplication of existing data first. See: ARC42 §6 / task list.
    assert!(dup.is_ok(), "duplicates allowed today; revisit if UNIQUE added");

    let matches = PatientService::search(&db, "807010000007678").await.unwrap();
    assert_eq!(matches.len(), 2, "both patients share the chip — both findable");
}
