use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Household {
    pub id: i32,
    pub household_name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub notes: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Person {
    pub id: i32,
    pub household_id: i32,
    pub first_name: String,
    pub last_name: String,
    pub is_primary: bool,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PersonContact {
    pub id: i32,
    pub person_id: i32,
    pub contact_type: String, // 'phone', 'email', 'mobile', 'work_phone'
    pub contact_value: String,
    pub is_primary: bool,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PatientHousehold {
    pub id: i32,
    pub patient_id: i32,
    pub household_id: i32,
    pub relationship_type: String,
    pub is_primary: bool,
    pub created_at: chrono::NaiveDateTime,
}

// DTOs for creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHouseholdDto {
    pub household_name: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePersonDto {
    pub first_name: String,
    pub last_name: String,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateContactDto {
    pub contact_type: String,
    pub contact_value: String,
    pub is_primary: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePersonWithContactsDto {
    pub person: CreatePersonDto,
    pub contacts: Vec<CreateContactDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateHouseholdWithPeopleDto {
    pub household: CreateHouseholdDto,
    pub people: Vec<CreatePersonWithContactsDto>,
}

// Search results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonWithContacts {
    pub id: i32,
    pub first_name: String,
    pub last_name: String,
    pub is_primary: bool,
    pub contacts: Vec<PersonContact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdSearchResult {
    pub id: i32,
    pub household_name: Option<String>,
    pub address: Option<String>,
    pub people: Vec<PersonWithContacts>,
    pub pet_count: i32,
    pub relevance_score: f64,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHouseholdsResponse {
    pub results: Vec<HouseholdSearchResult>,
    pub total: i32,
    pub has_more: bool,
}

// Complete household with all relations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HouseholdWithPeople {
    pub household: Household,
    pub people: Vec<PersonWithContacts>,
    pub pet_count: i32,
}

// For patient creation with household
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePatientWithHouseholdDto {
    pub household: CreateHouseholdDto,
    pub people: Vec<CreatePersonWithContactsDto>,
    pub patient: super::dto::CreatePatientDto,
    pub relationship: Option<PatientRelationship>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatientRelationship {
    pub relationship_type: Option<String>,
    pub is_primary: Option<bool>,
}

// Validation
impl CreateHouseholdWithPeopleDto {
    pub fn validate(&self) -> Result<(), String> {
        // Must have at least 1 person, max 5
        if self.people.is_empty() {
            return Err("Household must have at least one person".to_string());
        }
        if self.people.len() > 5 {
            return Err("Household cannot have more than 5 people".to_string());
        }

        // Check that only one person is marked as primary
        let primary_count = self.people.iter()
            .filter(|p| p.person.is_primary.unwrap_or(false))
            .count();
        if primary_count > 1 {
            return Err("Only one person can be marked as primary".to_string());
        }

        // Validate each person
        for person_with_contacts in &self.people {
            if person_with_contacts.person.first_name.is_empty() {
                return Err("First name is required for all people".to_string());
            }
            if person_with_contacts.person.last_name.is_empty() {
                return Err("Last name is required for all people".to_string());
            }

            // Validate contacts
            for contact in &person_with_contacts.contacts {
                if !["phone", "email", "mobile", "work_phone"].contains(&contact.contact_type.as_str()) {
                    return Err(format!("Invalid contact type: {}", contact.contact_type));
                }

                // Basic email validation
                if contact.contact_type == "email" && !contact.contact_value.contains('@') {
                    return Err(format!("Invalid email: {}", contact.contact_value));
                }
            }
        }

        Ok(())
    }
}