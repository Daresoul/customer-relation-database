use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend, TransactionTrait};
use crate::models::household::*;

// Create a new household with people and contacts in a transaction
pub async fn create_household_with_people(
    db: &DatabaseConnection,
    dto: CreateHouseholdWithPeopleDto,
) -> Result<HouseholdWithPeople, String> {
    // Validate the DTO
    dto.validate().map_err(|e| e.to_string())?;

    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // 1. Create household
    let result = txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO households (household_name, address, notes) VALUES (?, ?, ?)",
        [
            dto.household.household_name.clone().into(),
            sea_orm::Value::String(dto.household.address.clone().map(Box::new)),
            sea_orm::Value::String(dto.household.notes.clone().map(Box::new)),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to create household: {}", e))?;

    let household_id = result.last_insert_id() as i64;

    // 2. Create people and contacts
    let mut people_with_contacts = Vec::new();

    for (idx, person_dto) in dto.people.iter().enumerate() {
        let is_primary = person_dto.person.is_primary.unwrap_or(idx == 0);

        let result = txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)",
            [
                household_id.into(),
                person_dto.person.first_name.clone().into(),
                person_dto.person.last_name.clone().into(),
                is_primary.into(),
            ]
        ))
        .await
        .map_err(|e| format!("Failed to create person: {}", e))?;

        let person_id = result.last_insert_id() as i64;

        let mut contacts = Vec::new();

        for contact_dto in &person_dto.contacts {
            let result = txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)",
                [
                    person_id.into(),
                    contact_dto.contact_type.clone().into(),
                    contact_dto.contact_value.clone().into(),
                    contact_dto.is_primary.unwrap_or(false).into(),
                ]
            ))
            .await
            .map_err(|e| format!("Failed to create contact: {}", e))?;

            let contact_id = result.last_insert_id() as i64;

            let contact = PersonContact {
                id: contact_id as i32,
                person_id: person_id as i32,
                contact_type: contact_dto.contact_type.clone(),
                contact_value: contact_dto.contact_value.clone(),
                is_primary: contact_dto.is_primary.unwrap_or(false),
                created_at: chrono::Utc::now().naive_utc(),
            };

            contacts.push(contact);
        }

        people_with_contacts.push(PersonWithContacts {
            id: person_id as i32,
            first_name: person_dto.person.first_name.clone(),
            last_name: person_dto.person.last_name.clone(),
            is_primary,
            contacts,
        });
    }

    // Commit transaction
    txn.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

    // Fetch the created household
    let row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at FROM households WHERE id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch household: {}", e))?
    .ok_or("Created household not found")?;

    let household = Household {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        household_name: row.try_get("", "household_name").map_err(|e| format!("Failed to get household_name: {}", e))?,
        address: row.try_get("", "address").ok(),
        city: row.try_get("", "city").ok(),
        postal_code: row.try_get("", "postal_code").ok(),
        notes: row.try_get("", "notes").ok(),
        created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
        updated_at: row.try_get("", "updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
    };

    Ok(HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count: 0,
    })
}

// Create patient with new household
pub async fn create_patient_with_household(
    db: &DatabaseConnection,
    dto: CreatePatientWithHouseholdDto,
) -> Result<(HouseholdWithPeople, i64), String> {
    let txn = db.begin().await.map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // First create the household with people (inline, not calling the other function to share transaction)
    let household_dto = &dto;

    // Validate
    let household_validate_dto = CreateHouseholdWithPeopleDto {
        household: household_dto.household.clone(),
        people: household_dto.people.clone(),
    };
    household_validate_dto.validate().map_err(|e| e.to_string())?;

    // 1. Create household
    let result = txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO households (household_name, address, notes) VALUES (?, ?, ?)",
        [
            dto.household.household_name.clone().into(),
            sea_orm::Value::String(dto.household.address.clone().map(Box::new)),
            sea_orm::Value::String(dto.household.notes.clone().map(Box::new)),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to create household: {}", e))?;

    let household_id = result.last_insert_id() as i64;

    // 2. Create people and contacts
    let mut people_with_contacts = Vec::new();

    for (idx, person_dto) in dto.people.iter().enumerate() {
        let is_primary = person_dto.person.is_primary.unwrap_or(idx == 0);

        let result = txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)",
            [
                household_id.into(),
                person_dto.person.first_name.clone().into(),
                person_dto.person.last_name.clone().into(),
                is_primary.into(),
            ]
        ))
        .await
        .map_err(|e| format!("Failed to create person: {}", e))?;

        let person_id = result.last_insert_id() as i64;

        let mut contacts = Vec::new();

        for contact_dto in &person_dto.contacts {
            let result = txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)",
                [
                    person_id.into(),
                    contact_dto.contact_type.clone().into(),
                    contact_dto.contact_value.clone().into(),
                    contact_dto.is_primary.unwrap_or(false).into(),
                ]
            ))
            .await
            .map_err(|e| format!("Failed to create contact: {}", e))?;

            let contact_id = result.last_insert_id() as i64;

            contacts.push(PersonContact {
                id: contact_id as i32,
                person_id: person_id as i32,
                contact_type: contact_dto.contact_type.clone(),
                contact_value: contact_dto.contact_value.clone(),
                is_primary: contact_dto.is_primary.unwrap_or(false),
                created_at: chrono::Utc::now().naive_utc(),
            });
        }

        people_with_contacts.push(PersonWithContacts {
            id: person_id as i32,
            first_name: person_dto.person.first_name.clone(),
            last_name: person_dto.person.last_name.clone(),
            is_primary,
            contacts,
        });
    }

    // Create patient
    let result = txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO patients (name, species_id, breed_id, date_of_birth, weight, medical_notes) VALUES (?, ?, ?, ?, ?, ?)",
        [
            dto.patient.name.clone().into(),
            dto.patient.species_id.into(),
            sea_orm::Value::BigInt(dto.patient.breed_id),
            sea_orm::Value::String(dto.patient.date_of_birth.map(|d| Box::new(d.to_string()))),
            sea_orm::Value::Double(dto.patient.weight),
            sea_orm::Value::String(dto.patient.medical_notes.clone().map(Box::new)),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to create patient: {}", e))?;

    let patient_id = result.last_insert_id() as i64;

    // Link patient to household
    let relationship_type = dto.relationship
        .as_ref()
        .and_then(|r| r.relationship_type.clone())
        .unwrap_or_else(|| "primary_household".to_string());

    let is_primary = dto.relationship
        .as_ref()
        .and_then(|r| r.is_primary)
        .unwrap_or(true);

    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, ?, ?)",
        [
            patient_id.into(),
            (household_id as i32).into(),
            relationship_type.into(),
            is_primary.into(),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to link patient to household: {}", e))?;

    txn.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

    let household = Household {
        id: household_id as i32,
        household_name: dto.household.household_name.clone(),
        address: dto.household.address.clone(),
        city: None,
        postal_code: None,
        notes: dto.household.notes.clone(),
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    Ok((HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count: 0,
    }, patient_id))
}

// Get household with all people and contacts
pub async fn get_household_with_people(
    db: &DatabaseConnection,
    household_id: i32,
) -> Result<Option<HouseholdWithPeople>, String> {
    // Get household
    let household_row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at FROM households WHERE id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch household: {}", e))?;

    let household = match household_row {
        Some(row) => Household {
            id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
            household_name: row.try_get("", "household_name").map_err(|e| format!("Failed to get household_name: {}", e))?,
            address: row.try_get("", "address").ok(),
            city: row.try_get("", "city").ok(),
            postal_code: row.try_get("", "postal_code").ok(),
            notes: row.try_get("", "notes").ok(),
            created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
            updated_at: row.try_get("", "updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
        },
        None => return Ok(None),
    };

    // Get people
    let people_rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, first_name, last_name, is_primary FROM people WHERE household_id = ? ORDER BY is_primary DESC, last_name, first_name",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch people: {}", e))?;

    let mut people_with_contacts = Vec::new();

    for person_row in people_rows {
        let person_id: i64 = person_row.try_get("", "id").map_err(|e| format!("Failed to get person id: {}", e))?;

        let contact_rows = db.query_all(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, person_id, contact_type, contact_value, is_primary, created_at FROM person_contacts WHERE person_id = ? ORDER BY is_primary DESC, contact_type",
            [person_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

        let contacts: Vec<PersonContact> = contact_rows.iter().map(|row| {
            PersonContact {
                id: row.try_get("", "id").unwrap_or(0),
                person_id: row.try_get("", "person_id").unwrap_or(0),
                contact_type: row.try_get("", "contact_type").unwrap_or_default(),
                contact_value: row.try_get("", "contact_value").unwrap_or_default(),
                is_primary: row.try_get("", "is_primary").unwrap_or(false),
                created_at: row.try_get("", "created_at").unwrap_or_else(|_| chrono::Utc::now().naive_utc()),
            }
        }).collect();

        people_with_contacts.push(PersonWithContacts {
            id: person_id as i32,
            first_name: person_row.try_get("", "first_name").unwrap_or_default(),
            last_name: person_row.try_get("", "last_name").unwrap_or_default(),
            is_primary: person_row.try_get("", "is_primary").unwrap_or(false),
            contacts,
        });
    }

    // Get pet count for this household
    let pet_count_row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) as count FROM patient_households WHERE household_id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch pet count: {}", e))?;

    let pet_count: i32 = pet_count_row
        .and_then(|row| row.try_get::<i64>("", "count").ok())
        .unwrap_or(0) as i32;

    Ok(Some(HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count,
    }))
}

// Update household
pub async fn update_household(
    db: &DatabaseConnection,
    household_id: i32,
    household_name: Option<String>,
    address: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE households SET household_name = COALESCE(?, household_name), address = COALESCE(?, address), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [
            sea_orm::Value::String(household_name.map(Box::new)),
            sea_orm::Value::String(address.map(Box::new)),
            sea_orm::Value::String(notes.map(Box::new)),
            household_id.into(),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to update household: {}", e))?;

    Ok(())
}

// Delete household (cascades to people and contacts)
pub async fn delete_household(
    db: &DatabaseConnection,
    household_id: i32,
) -> Result<(), String> {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM households WHERE id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to delete household: {}", e))?;

    Ok(())
}

// Get a single person with their contacts
pub async fn get_person_with_contacts(
    db: &DatabaseConnection,
    person_id: i32,
) -> Result<Option<PersonWithContacts>, String> {
    // Get person
    let person_row = db.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, first_name, last_name, is_primary FROM people WHERE id = ?",
        [person_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch person: {}", e))?;

    let person = match person_row {
        Some(row) => row,
        None => return Ok(None),
    };

    // Get contacts
    let contact_rows = db.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, person_id, contact_type, contact_value, is_primary, created_at FROM person_contacts WHERE person_id = ? ORDER BY is_primary DESC, contact_type",
        [person_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

    let contacts: Vec<PersonContact> = contact_rows.iter().map(|row| {
        PersonContact {
            id: row.try_get("", "id").unwrap_or(0),
            person_id: row.try_get("", "person_id").unwrap_or(0),
            contact_type: row.try_get("", "contact_type").unwrap_or_default(),
            contact_value: row.try_get("", "contact_value").unwrap_or_default(),
            is_primary: row.try_get("", "is_primary").unwrap_or(false),
            created_at: row.try_get("", "created_at").unwrap_or_else(|_| chrono::Utc::now().naive_utc()),
        }
    }).collect();

    Ok(Some(PersonWithContacts {
        id: person_id,
        first_name: person.try_get("", "first_name").unwrap_or_default(),
        last_name: person.try_get("", "last_name").unwrap_or_default(),
        is_primary: person.try_get("", "is_primary").unwrap_or(false),
        contacts,
    }))
}
