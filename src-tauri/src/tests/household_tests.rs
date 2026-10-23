//! Household contract tests
//!
//! Tests the complex nested DTOs for household creation
//! with people and contacts.

use serde_json::{json, Value};
use crate::models::household::{
    CreateHouseholdWithPeopleDto, CreateHouseholdDto, CreatePersonWithContactsDto,
    CreatePersonDto, CreateContactDto,
};

/// Helper to parse JSON into a type
fn parse_json<T: serde::de::DeserializeOwned>(json: Value) -> Result<T, String> {
    serde_json::from_value(json).map_err(|e| e.to_string())
}

mod create_household_parsing {
    use super::*;

    #[test]
    fn parse_minimal_household() {
        let json = json!({
            "household": {
                "household_name": "Smith Family"
            },
            "people": [
                {
                    "person": {
                        "first_name": "John",
                        "last_name": "Smith"
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok(), "Failed: {:?}", result.err());

        let dto = result.unwrap();
        assert_eq!(dto.household.household_name, Some("Smith Family".to_string()));
        assert_eq!(dto.people.len(), 1);
        assert_eq!(dto.people[0].person.first_name, "John");
    }

    #[test]
    fn parse_full_household_with_contacts() {
        let json = json!({
            "household": {
                "household_name": "Johnson Residence",
                "address": "123 Main Street",
                "notes": "Regular clients since 2020"
            },
            "people": [
                {
                    "person": {
                        "first_name": "Mary",
                        "last_name": "Johnson",
                        "is_primary": true
                    },
                    "contacts": [
                        {
                            "contact_type": "email",
                            "contact_value": "mary@example.com",
                            "is_primary": true
                        },
                        {
                            "contact_type": "phone",
                            "contact_value": "555-1234",
                            "is_primary": false
                        }
                    ]
                },
                {
                    "person": {
                        "first_name": "Bob",
                        "last_name": "Johnson",
                        "is_primary": false
                    },
                    "contacts": [
                        {
                            "contact_type": "mobile",
                            "contact_value": "555-5678"
                        }
                    ]
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());

        let dto = result.unwrap();
        assert_eq!(dto.people.len(), 2);
        assert_eq!(dto.people[0].contacts.len(), 2);
        assert_eq!(dto.people[1].contacts.len(), 1);
    }

    #[test]
    fn parse_household_null_optional_fields() {
        let json = json!({
            "household": {
                "household_name": null,
                "address": null,
                "notes": null
            },
            "people": [
                {
                    "person": {
                        "first_name": "Jane",
                        "last_name": "Doe",
                        "is_primary": null
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());

        let dto = result.unwrap();
        assert!(dto.household.household_name.is_none());
        assert!(dto.household.address.is_none());
    }

    #[test]
    fn parse_household_empty_people_array() {
        let json = json!({
            "household": {
                "household_name": "Empty"
            },
            "people": []
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok()); // Parsing succeeds
        // But validation should fail
        let dto = result.unwrap();
        assert!(dto.validate().is_err());
    }

    #[test]
    fn parse_household_missing_people_field() {
        let json = json!({
            "household": {
                "household_name": "No People"
            }
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_err()); // Missing required field
    }
}

mod household_validation {
    use super::*;

    fn create_valid_dto() -> CreateHouseholdWithPeopleDto {
        CreateHouseholdWithPeopleDto {
            household: CreateHouseholdDto {
                household_name: Some("Test Family".to_string()),
                address: None,
                city: None,
                postal_code: None,
                notes: None,
            },
            people: vec![
                CreatePersonWithContactsDto {
                    person: CreatePersonDto {
                        first_name: "John".to_string(),
                        last_name: "Doe".to_string(),
                        is_primary: Some(true),
                    },
                    contacts: vec![],
                }
            ],
        }
    }

    #[test]
    fn valid_household_passes() {
        let dto = create_valid_dto();
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn empty_people_fails() {
        let mut dto = create_valid_dto();
        dto.people = vec![];

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least one person"));
    }

    #[test]
    fn too_many_people_fails() {
        let mut dto = create_valid_dto();
        dto.people = (0..6).map(|i| CreatePersonWithContactsDto {
            person: CreatePersonDto {
                first_name: format!("Person{}", i),
                last_name: "Test".to_string(),
                is_primary: Some(i == 0),
            },
            contacts: vec![],
        }).collect();

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("more than 5"));
    }

    #[test]
    fn multiple_primaries_fails() {
        let mut dto = create_valid_dto();
        dto.people.push(CreatePersonWithContactsDto {
            person: CreatePersonDto {
                first_name: "Jane".to_string(),
                last_name: "Doe".to_string(),
                is_primary: Some(true), // Second primary
            },
            contacts: vec![],
        });

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("one person can be marked as primary"));
    }

    #[test]
    fn empty_first_name_fails() {
        let mut dto = create_valid_dto();
        dto.people[0].person.first_name = "".to_string();

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("First name is required"));
    }

    #[test]
    fn empty_last_name_fails() {
        let mut dto = create_valid_dto();
        dto.people[0].person.last_name = "".to_string();

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Last name is required"));
    }

    #[test]
    fn invalid_contact_type_fails() {
        let mut dto = create_valid_dto();
        dto.people[0].contacts.push(CreateContactDto {
            contact_type: "fax".to_string(), // Invalid type
            contact_value: "555-1234".to_string(),
            is_primary: None,
        });

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid contact type"));
    }

    #[test]
    fn valid_contact_types_pass() {
        let mut dto = create_valid_dto();
        dto.people[0].contacts = vec![
            CreateContactDto {
                contact_type: "phone".to_string(),
                contact_value: "555-1234".to_string(),
                is_primary: Some(true),
            },
            CreateContactDto {
                contact_type: "email".to_string(),
                contact_value: "test@example.com".to_string(),
                is_primary: None,
            },
            CreateContactDto {
                contact_type: "mobile".to_string(),
                contact_value: "555-5678".to_string(),
                is_primary: None,
            },
            CreateContactDto {
                contact_type: "work_phone".to_string(),
                contact_value: "555-9999".to_string(),
                is_primary: None,
            },
        ];

        assert!(dto.validate().is_ok());
    }

    #[test]
    fn invalid_email_fails() {
        let mut dto = create_valid_dto();
        dto.people[0].contacts.push(CreateContactDto {
            contact_type: "email".to_string(),
            contact_value: "not-an-email".to_string(), // Missing @
            is_primary: None,
        });

        let result = dto.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid email"));
    }

    #[test]
    fn valid_email_passes() {
        let mut dto = create_valid_dto();
        dto.people[0].contacts.push(CreateContactDto {
            contact_type: "email".to_string(),
            contact_value: "user@domain.com".to_string(),
            is_primary: None,
        });

        assert!(dto.validate().is_ok());
    }
}

mod edge_cases {
    use super::*;

    #[test]
    fn unicode_in_names() {
        let json = json!({
            "household": {
                "household_name": "Müller Familie 家族"
            },
            "people": [
                {
                    "person": {
                        "first_name": "Jürgen",
                        "last_name": "Müller"
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
        let dto = result.unwrap();
        assert!(dto.validate().is_ok());
        assert!(dto.people[0].person.first_name.contains("ü"));
    }

    #[test]
    fn special_characters_in_address() {
        let json = json!({
            "household": {
                "household_name": "Test",
                "address": "123 O'Brien's Lane, Apt #5B"
            },
            "people": [
                {
                    "person": {
                        "first_name": "Test",
                        "last_name": "User"
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
        let dto = result.unwrap();
        assert!(dto.household.address.as_ref().unwrap().contains("O'Brien"));
    }

    #[test]
    fn whitespace_only_names() {
        let json = json!({
            "household": {
                "household_name": "Test"
            },
            "people": [
                {
                    "person": {
                        "first_name": "   ",
                        "last_name": "User"
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
        // Note: Current validation doesn't trim whitespace
        // This test documents current behavior
    }

    #[test]
    fn very_long_notes() {
        let long_notes = "A".repeat(10000);
        let json = json!({
            "household": {
                "household_name": "Test",
                "notes": long_notes
            },
            "people": [
                {
                    "person": {
                        "first_name": "Test",
                        "last_name": "User"
                    },
                    "contacts": []
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
    }

    #[test]
    fn max_allowed_people() {
        let mut people = Vec::new();
        for i in 0..5 {
            people.push(json!({
                "person": {
                    "first_name": format!("Person{}", i),
                    "last_name": "Test",
                    "is_primary": i == 0
                },
                "contacts": []
            }));
        }

        let json = json!({
            "household": {
                "household_name": "Large Family"
            },
            "people": people
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
        let dto = result.unwrap();
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn international_phone_formats() {
        let json = json!({
            "household": {
                "household_name": "Test"
            },
            "people": [
                {
                    "person": {
                        "first_name": "Test",
                        "last_name": "User"
                    },
                    "contacts": [
                        {
                            "contact_type": "phone",
                            "contact_value": "+1 (555) 123-4567"
                        },
                        {
                            "contact_type": "mobile",
                            "contact_value": "+44 20 7946 0958"
                        },
                        {
                            "contact_type": "work_phone",
                            "contact_value": "+389 2 123 4567"
                        }
                    ]
                }
            ]
        });

        let result: Result<CreateHouseholdWithPeopleDto, _> = parse_json(json);
        assert!(result.is_ok());
        let dto = result.unwrap();
        assert!(dto.validate().is_ok());
    }
}

/// household.md #12: a failed contact write must not leave half a change.
mod person_writes_are_all_or_nothing {
    use crate::database::queries::household;
    use crate::models::household::{CreateContactDto, CreatePersonDto, CreatePersonWithContactsDto};
    use crate::test_utils::create_test_db_with_migrations;
    use sea_orm::{ConnectionTrait, DbBackend, Statement};

    fn contact(kind: &str, value: &str) -> CreateContactDto {
        CreateContactDto { contact_type: kind.into(), contact_value: value.into(), is_primary: None }
    }

    async fn count(db: &sea_orm::DatabaseConnection, sql: &str) -> i64 {
        db.query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
            .await.unwrap().unwrap().try_get_by_index::<i64>(0).unwrap()
    }

    async fn household_with_person(db: &sea_orm::DatabaseConnection) -> (i32, i32) {
        db.execute(Statement::from_string(DbBackend::Sqlite,
            "INSERT INTO households (household_name) VALUES ('Petrovski')".to_string())).await.unwrap();
        let hid = count(db, "SELECT MAX(id) FROM households").await as i32;
        let dto = CreatePersonWithContactsDto {
            person: CreatePersonDto { first_name: "Ana".into(), last_name: "Petrovska".into(), is_primary: Some(true) },
            contacts: vec![contact("phone", "070 111 222")],
        };
        let pid = household::add_person_with_contacts(db, hid, &dto).await.unwrap();
        (hid, pid)
    }

    #[tokio::test]
    async fn a_failed_contact_replace_keeps_the_old_contacts() {
        let db = create_test_db_with_migrations().await;
        let (_, pid) = household_with_person(&db).await;

        // 'fax' breaks the contact_type CHECK, after the first new row is in.
        let result = household::replace_person_contacts(
            &db, pid, &[contact("email", "ana@example.com"), contact("fax", "123")],
        ).await;

        assert!(result.is_err());
        let phones = count(&db, &format!(
            "SELECT COUNT(*) FROM person_contacts WHERE person_id = {pid} AND contact_value = '070 111 222'")).await;
        let total = count(&db, &format!("SELECT COUNT(*) FROM person_contacts WHERE person_id = {pid}")).await;
        assert_eq!((phones, total), (1, 1), "the old phone must survive and nothing new be half-saved");
    }

    #[tokio::test]
    async fn a_failed_add_person_leaves_no_person_behind() {
        let db = create_test_db_with_migrations().await;
        let (hid, _) = household_with_person(&db).await;
        let dto = CreatePersonWithContactsDto {
            person: CreatePersonDto { first_name: "Marko".into(), last_name: "Petrovski".into(), is_primary: None },
            contacts: vec![contact("fax", "123")],
        };

        let result = household::add_person_with_contacts(&db, hid, &dto).await;

        assert!(result.is_err());
        let people = count(&db, &format!("SELECT COUNT(*) FROM people WHERE household_id = {hid}")).await;
        assert_eq!(people, 1, "Marko must not be saved without the contact that failed");
    }
}
