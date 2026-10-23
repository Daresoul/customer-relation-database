//! Names of master data (species, breeds, rooms, price list items, people):
//! blank names are refused, names are saved trimmed, and a name that only
//! differs in case or spaces from an existing one is a duplicate, in Cyrillic
//! too (SQLite NOCASE folds ASCII only).

use crate::database::queries::household;
use crate::models::breed::{CreateBreedInput, UpdateBreedInput};
use crate::models::dto::MaybeNull;
use crate::models::household::{CreatePersonDto, CreatePersonWithContactsDto};
use crate::models::line_item::{CreateLineItemTemplateInput, UpdateLineItemTemplateInput};
use crate::models::rooms::{CreateRoomInput, UpdateRoomInput};
use crate::models::species::{CreateSpeciesInput, UpdateSpeciesInput};
use crate::services::breed::BreedService;
use crate::services::line_item::LineItemService;
use crate::services::rooms::RoomService;
use crate::services::species::SpeciesService;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

fn species(name: &str) -> CreateSpeciesInput {
    CreateSpeciesInput { name: name.to_string(), display_order: None }
}

fn rename_species(name: &str) -> UpdateSpeciesInput {
    UpdateSpeciesInput { name: Some(name.to_string()), active: None, display_order: None }
}

fn room(name: &str) -> CreateRoomInput {
    CreateRoomInput { name: name.to_string(), description: None, capacity: None, color: None }
}

fn rename_room(name: &str) -> UpdateRoomInput {
    UpdateRoomInput {
        name: Some(name.to_string()),
        description: None,
        capacity: None,
        color: MaybeNull::Undefined,
        is_active: None,
    }
}

fn price_item(name: &str) -> CreateLineItemTemplateInput {
    CreateLineItemTemplateInput {
        name: name.to_string(),
        description: None,
        default_price: 100.0,
        currency_id: 1,
        default_tax_rate_id: None,
    }
}

fn rename_price_item(name: &str) -> UpdateLineItemTemplateInput {
    UpdateLineItemTemplateInput {
        name: Some(name.to_string()),
        description: None,
        default_price: None,
        currency_id: None,
        is_active: None,
        display_order: None,
        default_tax_rate_id: MaybeNull::Undefined,
    }
}

#[tokio::test]
async fn species_names_are_trimmed_and_blank_ones_refused() {
    let db = create_test_db_with_migrations().await;

    let created = SpeciesService::create(&db, species("  Мачка  ")).await.unwrap();
    assert_eq!(created.name, "Мачка");
    assert!(SpeciesService::create(&db, species("   ")).await.is_err());
    assert!(SpeciesService::update(&db, created.id, rename_species("  ")).await.is_err());
}

#[tokio::test]
async fn species_name_in_another_case_is_a_duplicate() {
    let db = create_test_db_with_migrations().await;
    let cat = SpeciesService::create(&db, species("Мачка")).await.unwrap();
    let ferret = SpeciesService::create(&db, species("Твор")).await.unwrap();

    let err = SpeciesService::create(&db, species(" мачка ")).await.unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    let err = SpeciesService::update(&db, ferret.id, rename_species("МАЧКА")).await.unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    // Renaming a species to its own name in another case is fine.
    let renamed = SpeciesService::update(&db, cat.id, rename_species("мачка")).await.unwrap();
    assert_eq!(renamed.name, "мачка");
}

#[tokio::test]
async fn breed_name_in_another_case_is_a_duplicate_within_its_species() {
    let db = create_test_db_with_migrations().await;
    let first = BreedService::create(&db, CreateBreedInput { name: "Шарпланинец".into(), species_id: 1 })
        .await
        .unwrap();

    let err = BreedService::create(&db, CreateBreedInput { name: " шарпланинец".into(), species_id: 1 })
        .await
        .unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    // The same name under another species is a different breed.
    BreedService::create(&db, CreateBreedInput { name: "Шарпланинец".into(), species_id: 2 })
        .await
        .unwrap();
    assert!(BreedService::create(&db, CreateBreedInput { name: "  ".into(), species_id: 1 }).await.is_err());

    let other = BreedService::create(&db, CreateBreedInput { name: "Пудла".into(), species_id: 1 })
        .await
        .unwrap();
    let err = BreedService::update(
        &db,
        other.id,
        UpdateBreedInput { name: Some("ШАРПЛАНИНЕЦ".into()), species_id: None, active: None },
    )
    .await
    .unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    let kept = BreedService::update(
        &db,
        first.id,
        UpdateBreedInput { name: Some(" Шарпланинец ".into()), species_id: None, active: None },
    )
    .await
    .unwrap();
    assert_eq!(kept.name, "Шарпланинец");
}

#[tokio::test]
async fn room_name_in_another_case_or_with_spaces_is_a_duplicate() {
    let db = create_test_db_with_migrations().await;
    let first = RoomService::create_room(&db, room("Соба 1")).await.unwrap();
    let second = RoomService::create_room(&db, room("  Соба 2 ")).await.unwrap();
    assert_eq!(second.name, "Соба 2");

    let err = RoomService::create_room(&db, room("соба 1 ")).await.unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    assert!(RoomService::create_room(&db, room("   ")).await.is_err());
    let err = RoomService::update_room(&db, second.id, rename_room("СОБА 1")).await.unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    RoomService::update_room(&db, first.id, rename_room("соба 1")).await.unwrap();
}

#[tokio::test]
async fn price_list_item_name_in_another_case_is_a_duplicate() {
    let db = create_test_db_with_migrations().await;
    let first = LineItemService::create_template(&db, price_item("Вакцина беснило")).await.unwrap();
    let second = LineItemService::create_template(&db, price_item("Преглед")).await.unwrap();

    let err = LineItemService::create_template(&db, price_item(" вакцина БЕСНИЛО ")).await.unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    let err = LineItemService::update_template(&db, second.id, rename_price_item("вакцина беснило"))
        .await
        .unwrap_err();
    assert!(err.contains("already exists"), "{err}");
    LineItemService::update_template(&db, first.id, rename_price_item("Вакцина Беснило")).await.unwrap();
}

#[tokio::test]
async fn a_person_needs_a_first_and_last_name_that_is_not_only_spaces() {
    let db = create_test_db_with_migrations().await;
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        "INSERT INTO households (household_name) VALUES ('Петровски')".to_string(),
    ))
    .await
    .unwrap();
    let person = |first: &str, last: &str| CreatePersonWithContactsDto {
        person: CreatePersonDto { first_name: first.into(), last_name: last.into(), is_primary: None },
        contacts: vec![],
    };

    assert!(household::add_person_with_contacts(&db, 1, &person("   ", "Петровска")).await.is_err());
    assert!(household::add_person_with_contacts(&db, 1, &person("Ана", "  ")).await.is_err());
    let id = household::add_person_with_contacts(&db, 1, &person(" Ана ", " Петровска ")).await.unwrap();
    let saved = household::get_person_with_contacts(&db, id).await.unwrap().unwrap();
    assert_eq!((saved.first_name.as_str(), saved.last_name.as_str()), ("Ана", "Петровска"));
}

#[test]
fn a_new_household_refuses_people_with_blank_names() {
    use crate::models::household::{CreateHouseholdDto, CreateHouseholdWithPeopleDto};
    let dto = CreateHouseholdWithPeopleDto {
        household: CreateHouseholdDto { household_name: Some("Петровски".into()), address: None, city: None, postal_code: None, notes: None },
        people: vec![CreatePersonWithContactsDto {
            person: CreatePersonDto { first_name: "  ".into(), last_name: "Петровски".into(), is_primary: Some(true) },
            contacts: vec![],
        }],
    };
    assert!(dto.validate().is_err());
}
