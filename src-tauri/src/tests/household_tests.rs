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
