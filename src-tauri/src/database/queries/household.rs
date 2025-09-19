use sqlx::{SqlitePool, Row};
use crate::models::household::*;

// Create a new household with people and contacts in a transaction
pub async fn create_household_with_people(
    pool: &SqlitePool,
    dto: CreateHouseholdWithPeopleDto,
) -> Result<HouseholdWithPeople, sqlx::Error> {
    // Validate the DTO
    dto.validate().map_err(|e| sqlx::Error::Protocol(e))?;

    let mut tx = pool.begin().await?;

    // 1. Create household
    let household_id = sqlx::query(
        r#"
        INSERT INTO households (household_name, address, notes)
        VALUES (?, ?, ?)
        "#
    )
    .bind(&dto.household.household_name)
    .bind(&dto.household.address)
    .bind(&dto.household.notes)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    // 2. Create people and contacts
    let mut people_with_contacts = Vec::new();

    for (idx, person_dto) in dto.people.iter().enumerate() {
        let is_primary = person_dto.person.is_primary.unwrap_or(idx == 0); // First person is primary by default

        let person_id = sqlx::query(
            r#"
            INSERT INTO people (household_id, first_name, last_name, is_primary)
            VALUES (?, ?, ?, ?)
            "#
        )
        .bind(household_id)
        .bind(&person_dto.person.first_name)
        .bind(&person_dto.person.last_name)
        .bind(is_primary)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        let mut contacts = Vec::new();

        for contact_dto in &person_dto.contacts {
            let contact_id = sqlx::query(
                r#"
                INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary)
                VALUES (?, ?, ?, ?)
                "#
            )
            .bind(person_id)
            .bind(&contact_dto.contact_type)
            .bind(&contact_dto.contact_value)
            .bind(contact_dto.is_primary.unwrap_or(false))
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

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
    tx.commit().await?;

    // Fetch the created household
    let household_row = sqlx::query(
        r#"
        SELECT id, household_name, address, notes, created_at, updated_at
        FROM households
        WHERE id = ?
        "#
    )
    .bind(household_id)
    .fetch_one(pool)
    .await?;

    let household = Household {
        id: household_row.get::<i32, _>("id"),
        household_name: household_row.get("household_name"),
        address: household_row.get("address"),
        notes: household_row.get("notes"),
        created_at: household_row.get("created_at"),
        updated_at: household_row.get("updated_at"),
    };

    Ok(HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count: 0,  // TODO: Calculate pet count if needed
    })
}

// Create patient with new household
pub async fn create_patient_with_household(
    pool: &SqlitePool,
    dto: CreatePatientWithHouseholdDto,
) -> Result<(HouseholdWithPeople, i64), sqlx::Error> {
    let mut tx = pool.begin().await?;

    // First create the household with people
    let household_dto = CreateHouseholdWithPeopleDto {
        household: dto.household,
        people: dto.people,
    };

    // Create household (using the transaction)
    let household_with_people = create_household_with_people_tx(&mut tx, household_dto).await?;

    // Create patient
    let patient_id = sqlx::query(
        r#"
        INSERT INTO patients (name, species, breed, date_of_birth, weight, medical_notes)
        VALUES (?, ?, ?, ?, ?, ?)
        "#
    )
    .bind(&dto.patient.name)
    .bind(&dto.patient.species)
    .bind(&dto.patient.breed)
    .bind(&dto.patient.date_of_birth)
    .bind(&dto.patient.weight)
    .bind(&dto.patient.medical_notes)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    // Link patient to household
    let relationship_type = dto.relationship
        .as_ref()
        .and_then(|r| r.relationship_type.clone())
        .unwrap_or_else(|| "primary_household".to_string());

    let is_primary = dto.relationship
        .as_ref()
        .and_then(|r| r.is_primary)
        .unwrap_or(true);

    sqlx::query(
        r#"
        INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary)
        VALUES (?, ?, ?, ?)
        "#
    )
    .bind(patient_id)
    .bind(household_with_people.household.id)
    .bind(&relationship_type)
    .bind(is_primary)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok((household_with_people, patient_id))
}

// Helper function for transaction
async fn create_household_with_people_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    dto: CreateHouseholdWithPeopleDto,
) -> Result<HouseholdWithPeople, sqlx::Error> {
    dto.validate().map_err(|e| sqlx::Error::Protocol(e))?;

    // 1. Create household
    let household_id = sqlx::query(
        r#"
        INSERT INTO households (household_name, address, notes)
        VALUES (?, ?, ?)
        "#
    )
    .bind(&dto.household.household_name)
    .bind(&dto.household.address)
    .bind(&dto.household.notes)
    .execute(&mut **tx)
    .await?
    .last_insert_rowid();

    // 2. Create people and contacts
    let mut people_with_contacts = Vec::new();

    for (idx, person_dto) in dto.people.iter().enumerate() {
        let is_primary = person_dto.person.is_primary.unwrap_or(idx == 0);

        let person_id = sqlx::query(
            r#"
            INSERT INTO people (household_id, first_name, last_name, is_primary)
            VALUES (?, ?, ?, ?)
            "#
        )
        .bind(household_id)
        .bind(&person_dto.person.first_name)
        .bind(&person_dto.person.last_name)
        .bind(is_primary)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        let mut contacts = Vec::new();

        for contact_dto in &person_dto.contacts {
            let contact_id = sqlx::query(
                r#"
                INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary)
                VALUES (?, ?, ?, ?)
                "#
            )
            .bind(person_id)
            .bind(&contact_dto.contact_type)
            .bind(&contact_dto.contact_value)
            .bind(contact_dto.is_primary.unwrap_or(false))
            .execute(&mut **tx)
            .await?
            .last_insert_rowid();

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

    // Fetch the created household
    let household = Household {
        id: household_id as i32,
        household_name: dto.household.household_name,
        address: dto.household.address,
        notes: dto.household.notes,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    Ok(HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count: 0,  // TODO: Calculate pet count if needed
    })
}

// Get household with all people and contacts
pub async fn get_household_with_people(
    pool: &SqlitePool,
    household_id: i32,
) -> Result<Option<HouseholdWithPeople>, sqlx::Error> {
    // Get household
    let household_row = sqlx::query(
        r#"
        SELECT id, household_name, address, notes, created_at, updated_at
        FROM households
        WHERE id = ?
        "#
    )
    .bind(household_id)
    .fetch_optional(pool)
    .await?;

    let household = match household_row {
        Some(row) => Household {
            id: row.get::<i32, _>("id"),
            household_name: row.get("household_name"),
            address: row.get("address"),
            notes: row.get("notes"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        },
        None => return Ok(None),
    };

    // Get people
    let people_rows = sqlx::query(
        r#"
        SELECT id, first_name, last_name, is_primary
        FROM people
        WHERE household_id = ?
        ORDER BY is_primary DESC, last_name, first_name
        "#
    )
    .bind(household_id)
    .fetch_all(pool)
    .await?;

    let mut people_with_contacts = Vec::new();

    for person_row in people_rows {
        let person_id: i64 = person_row.get("id");

        let contact_rows = sqlx::query(
            r#"
            SELECT id, person_id, contact_type, contact_value, is_primary, created_at
            FROM person_contacts
            WHERE person_id = ?
            ORDER BY is_primary DESC, contact_type
            "#
        )
        .bind(person_id)
        .fetch_all(pool)
        .await?;

        let contacts: Vec<PersonContact> = contact_rows.into_iter().map(|row| {
            PersonContact {
                id: row.get::<i32, _>("id"),
                person_id: row.get::<i32, _>("person_id"),
                contact_type: row.get("contact_type"),
                contact_value: row.get("contact_value"),
                is_primary: row.get::<bool, _>("is_primary"),
                created_at: row.get("created_at"),
            }
        }).collect();

        people_with_contacts.push(PersonWithContacts {
            id: person_id as i32,
            first_name: person_row.get("first_name"),
            last_name: person_row.get("last_name"),
            is_primary: person_row.get::<bool, _>("is_primary"),
            contacts,
        });
    }

    // Get pet count for this household
    let pet_count_row = sqlx::query(
        r#"
        SELECT COUNT(*) as count
        FROM patient_households
        WHERE household_id = ?
        "#
    )
    .bind(household_id)
    .fetch_one(pool)
    .await?;

    let pet_count: i64 = pet_count_row.get("count");

    Ok(Some(HouseholdWithPeople {
        household,
        people: people_with_contacts,
        pet_count: pet_count as i32,
    }))
}

// Update household
pub async fn update_household(
    pool: &SqlitePool,
    household_id: i32,
    household_name: Option<String>,
    address: Option<String>,
    notes: Option<String>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE households
        SET household_name = COALESCE(?, household_name),
            address = COALESCE(?, address),
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        "#
    )
    .bind(&household_name)
    .bind(&address)
    .bind(&notes)
    .bind(household_id)
    .execute(pool)
    .await?;

    Ok(())
}

// Delete household (cascades to people and contacts)
pub async fn delete_household(
    pool: &SqlitePool,
    household_id: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        DELETE FROM households WHERE id = ?
        "#
    )
    .bind(household_id)
    .execute(pool)
    .await?;

    Ok(())
}