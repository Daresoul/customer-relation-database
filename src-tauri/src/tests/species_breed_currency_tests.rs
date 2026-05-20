//! CRUD tests for `SpeciesService`, `BreedService`, and the `Currency` getter
//! that lives on `MedicalRecordService`.
//!
//! Migrations seed 9 species (Dog, Cat, Bird, etc.) and 4 currencies (USD, EUR,
//! …). Tests work around the seed data by referencing high-id values for
//! newly-created rows.

use crate::models::breed::{CreateBreedInput, UpdateBreedInput};
use crate::models::dto::CreatePatientDto;
use crate::models::species::{CreateSpeciesInput, UpdateSpeciesInput};
use crate::services::breed::BreedService;
use crate::services::medical_record::MedicalRecordService;
use crate::services::patient::PatientService;
use crate::services::species::SpeciesService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

// ===========================================================================
// SPECIES
// ===========================================================================

#[tokio::test]
async fn get_all_species_returns_seeded_rows() {
    let db = create_test_db_with_migrations().await;
    let species = SpeciesService::get_all(&db, true).await.unwrap();
    assert!(species.len() >= 9, "migrations seed Dog/Cat/Bird/.../Other");
    let names: Vec<&str> = species.iter().map(|s| s.name.as_str()).collect();
    for expected in ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Reptile", "Fish", "Other"] {
        assert!(names.contains(&expected), "missing seeded species: {}", expected);
    }
}

#[tokio::test]
async fn create_species_with_unique_name_succeeds() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "Ferret".to_string(),
        display_order: Some(100),
    }).await.unwrap();
    assert_eq!(s.name, "Ferret");
    assert!(s.id > 9, "should get a fresh id beyond seeds");
    assert!(s.active);
}

#[tokio::test]
async fn create_species_with_duplicate_name_fails_unique_constraint() {
    let db = create_test_db_with_migrations().await;
    // Dog is seeded — creating again should violate UNIQUE on name
    let result = SpeciesService::create(&db, CreateSpeciesInput {
        name: "Dog".to_string(),
        display_order: None,
    }).await;
    assert!(result.is_err(), "duplicate species name should fail");
}

#[tokio::test]
async fn create_species_without_display_order_assigns_default() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "Hedgehog".to_string(),
        display_order: None,
    }).await.unwrap();
    assert!(s.display_order >= 0, "display_order should be set");
}

#[tokio::test]
async fn get_species_by_id_returns_existing() {
    let db = create_test_db_with_migrations().await;
    let dog = SpeciesService::get_by_id(&db, 1).await.unwrap();
    assert_eq!(dog.name, "Dog");
}

#[tokio::test]
async fn get_species_by_id_nonexistent_errors() {
    let db = create_test_db_with_migrations().await;
    let result = SpeciesService::get_by_id(&db, 99999).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn update_species_name_persists() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "OldName".to_string(),
        display_order: Some(99),
    }).await.unwrap();

    let updated = SpeciesService::update(&db, s.id, UpdateSpeciesInput {
        name: Some("NewName".to_string()),
        active: None,
        display_order: None,
    }).await.unwrap();
    assert_eq!(updated.name, "NewName");
    assert_eq!(updated.display_order, 99, "display_order untouched");
}

#[tokio::test]
async fn update_species_rename_to_existing_fails_unique() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "ToRename".to_string(),
        display_order: None,
    }).await.unwrap();

    let result = SpeciesService::update(&db, s.id, UpdateSpeciesInput {
        name: Some("Dog".to_string()),  // conflicts with seeded
        active: None,
        display_order: None,
    }).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn update_species_active_toggle() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "Toggle".to_string(),
        display_order: None,
    }).await.unwrap();

    let updated = SpeciesService::update(&db, s.id, UpdateSpeciesInput {
        name: None, active: Some(false), display_order: None,
    }).await.unwrap();
    assert!(!updated.active);

    let active_only = SpeciesService::get_all(&db, true).await.unwrap();
    assert!(!active_only.iter().any(|x| x.id == s.id), "inactive species should not appear");

    let all = SpeciesService::get_all(&db, false).await.unwrap();
    assert!(all.iter().any(|x| x.id == s.id), "inactive should appear when active_only=false");
}

#[tokio::test]
async fn delete_species_with_no_patients_succeeds() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "DeleteMe".to_string(),
        display_order: None,
    }).await.unwrap();
    SpeciesService::delete(&db, s.id).await.unwrap();
}

#[tokio::test]
async fn hard_delete_species_with_patients_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let s = SpeciesService::create(&db, CreateSpeciesInput {
        name: "Referenced".to_string(),
        display_order: None,
    }).await.unwrap();

    PatientService::create(&db, CreatePatientDto {
        name: Some("Pet".to_string()),
        species_id: Some(s.id),
        breed_id: None, gender: None, date_of_birth: None,
        color: None, weight: None, microchip_id: None,
        medical_notes: None, household_id: None,
    }).await.unwrap();

    let result = SpeciesService::hard_delete(&db, s.id).await;
    assert!(result.is_err(), "hard delete with patient ref should fail FK");
}

// ===========================================================================
// BREED
// ===========================================================================

#[tokio::test]
async fn create_breed_with_valid_species_succeeds() {
    let db = create_test_db_with_migrations().await;
    let b = BreedService::create(&db, CreateBreedInput {
        name: "Golden Retriever".to_string(),
        species_id: 1, // Dog
    }).await.unwrap();
    assert_eq!(b.name, "Golden Retriever");
    assert_eq!(b.species_id, 1);
    assert!(b.active);
}

#[tokio::test]
async fn create_breed_with_invalid_species_id_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let result = BreedService::create(&db, CreateBreedInput {
        name: "Phantom".to_string(),
        species_id: 99999,
    }).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn get_breeds_filtered_by_species() {
    let db = create_test_db_with_migrations().await;
    BreedService::create(&db, CreateBreedInput {
        name: "Golden".to_string(), species_id: 1,
    }).await.unwrap();
    BreedService::create(&db, CreateBreedInput {
        name: "Persian".to_string(), species_id: 2,
    }).await.unwrap();

    let dogs = BreedService::get_all(&db, Some(1), true).await.unwrap();
    let cats = BreedService::get_all(&db, Some(2), true).await.unwrap();
    assert!(dogs.iter().any(|b| b.name == "Golden"));
    assert!(!dogs.iter().any(|b| b.name == "Persian"));
    assert!(cats.iter().any(|b| b.name == "Persian"));
}

#[tokio::test]
async fn get_breeds_no_species_filter_returns_all() {
    let db = create_test_db_with_migrations().await;
    BreedService::create(&db, CreateBreedInput {
        name: "Golden".to_string(), species_id: 1,
    }).await.unwrap();
    BreedService::create(&db, CreateBreedInput {
        name: "Persian".to_string(), species_id: 2,
    }).await.unwrap();

    let all = BreedService::get_all(&db, None, true).await.unwrap();
    assert!(all.len() >= 2);
}

#[tokio::test]
async fn update_breed_name_and_species() {
    let db = create_test_db_with_migrations().await;
    let b = BreedService::create(&db, CreateBreedInput {
        name: "Original".to_string(), species_id: 1,
    }).await.unwrap();

    let updated = BreedService::update(&db, b.id, UpdateBreedInput {
        name: Some("Renamed".to_string()),
        species_id: Some(2), // Cat
        active: None,
    }).await.unwrap();
    assert_eq!(updated.name, "Renamed");
    assert_eq!(updated.species_id, 2);
}

#[tokio::test]
async fn update_breed_to_invalid_species_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let b = BreedService::create(&db, CreateBreedInput {
        name: "X".to_string(), species_id: 1,
    }).await.unwrap();

    let result = BreedService::update(&db, b.id, UpdateBreedInput {
        name: None, species_id: Some(99999), active: None,
    }).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn soft_delete_breed_sets_active_false() {
    let db = create_test_db_with_migrations().await;
    let b = BreedService::create(&db, CreateBreedInput {
        name: "Soft".to_string(), species_id: 1,
    }).await.unwrap();
    BreedService::soft_delete(&db, b.id).await.unwrap();

    let fetched = BreedService::get_by_id(&db, b.id).await.unwrap();
    assert!(!fetched.active);
}

#[tokio::test]
async fn hard_delete_breed_with_patient_ref_silently_soft_deletes() {
    // BreedService::hard_delete intentionally degrades to soft_delete when
    // patients reference the breed — avoids leaving dangling FK references
    // AND avoids surfacing a confusing constraint error to the user.
    // See services/breed.rs:154-157.
    let db = create_test_db_with_migrations().await;
    let b = BreedService::create(&db, CreateBreedInput {
        name: "Linked".to_string(), species_id: 1,
    }).await.unwrap();

    PatientService::create(&db, CreatePatientDto {
        name: Some("X".to_string()),
        species_id: Some(1),
        breed_id: Some(b.id),
        gender: None, date_of_birth: None, color: None,
        weight: None, microchip_id: None, medical_notes: None, household_id: None,
    }).await.unwrap();

    BreedService::hard_delete(&db, b.id).await.expect("downgrades to soft delete");
    let fetched = BreedService::get_by_id(&db, b.id).await.unwrap();
    assert!(!fetched.active, "should be marked inactive, not removed");
}

// ===========================================================================
// CURRENCY
// ===========================================================================

#[tokio::test]
async fn get_currencies_returns_seeded_rows() {
    let db = create_test_db_with_migrations().await;
    let currencies = MedicalRecordService::get_currencies(&db).await.unwrap();
    assert!(currencies.len() >= 1, "migrations seed at least one currency");
    let codes: Vec<&str> = currencies.iter().map(|c| c.code.as_str()).collect();
    // The seed data inserts USD, EUR, MKD at minimum (per migration 009)
    assert!(codes.contains(&"USD") || codes.contains(&"EUR"), "expected major currency: {:?}", codes);
}

#[tokio::test]
async fn currency_cannot_be_deleted_when_referenced_by_record() {
    // Pin behavior: delete a currency that's in use by a medical record.
    // No public service method exists for delete-currency today; this test
    // documents the constraint at the DB level so any future "delete
    // currency" service hits the FK.
    let db = create_test_db_with_migrations().await;

    // Seed a patient + record using currency 1
    let patient = PatientService::create(&db, CreatePatientDto {
        name: Some("P".to_string()), species_id: Some(1),
        breed_id: None, gender: None, date_of_birth: None, color: None,
        weight: None, microchip_id: None, medical_notes: None, household_id: None,
    }).await.unwrap();

    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO medical_records (patient_id, record_type, name, description, currency_id, is_archived, version, created_at, updated_at) \
         VALUES (?, 'procedure', 'with currency', 'desc', 1, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [patient.id.into()],
    )).await.unwrap();

    // Attempt raw delete on currency 1
    let result = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM currencies WHERE id = 1",
        vec![],
    )).await;

    assert!(result.is_err(), "FK should block deleting a referenced currency");
}
