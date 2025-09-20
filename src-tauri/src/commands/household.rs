use tauri::State;
use sqlx::{Row, query, query_as};
use serde::Deserialize;
use crate::database::DatabasePool;
use crate::models::household::*;
use crate::database::queries::{household, household_search};

#[derive(Debug, Deserialize)]
pub struct CreateHouseholdRequest {
    #[serde(rename = "lastName")]
    pub last_name: String,
    pub contacts: Option<Vec<ContactInfo>>,
}

#[derive(Debug, Deserialize)]
pub struct ContactInfo {
    pub name: Option<String>,
    #[serde(rename = "isPrimary")]
    pub is_primary: Option<bool>,
    pub email: Option<String>,
    pub phone: Option<String>,
}

#[tauri::command]
pub async fn create_household(
    pool: State<'_, DatabasePool>,
    last_name: String,
    contacts: Option<Vec<ContactInfo>>,
) -> Result<Household, String> {
    let pool = pool.lock().await;

    // Create a simple household
    let result = sqlx::query(
        "INSERT INTO households (household_name, address, notes) VALUES (?, ?, ?)"
    )
    .bind(&last_name)
    .bind(None::<String>)  // No address initially
    .bind(None::<String>)  // No notes initially
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to create household: {}", e))?;

    let household_id = result.last_insert_rowid();

    // If contacts were provided with a name, create a person for the household
    if let Some(contact_list) = contacts {
        if let Some(first_contact) = contact_list.first() {
            if let Some(contact_name) = &first_contact.name {
                // Split the contact name into first and last name
                let parts: Vec<&str> = contact_name.split_whitespace().collect();
                let (first_name, last_name_person) = if parts.len() >= 2 {
                    (parts[0].to_string(), parts[1..].join(" "))
                } else {
                    (contact_name.clone(), last_name.clone())
                };

                // Create a person for this household
                let person_result = sqlx::query(
                    "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)"
                )
                .bind(household_id)
                .bind(&first_name)
                .bind(&last_name_person)
                .bind(true)  // Primary contact
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to create person: {}", e))?;

                let person_id = person_result.last_insert_rowid();

                // Add email if provided
                if let Some(email) = &first_contact.email {
                    if !email.is_empty() {
                        sqlx::query(
                            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)"
                        )
                        .bind(person_id)
                        .bind("email")
                        .bind(email)
                        .bind(true)
                        .execute(&*pool)
                        .await
                        .map_err(|e| format!("Failed to create email contact: {}", e))?;
                    }
                }

                // Add phone if provided
                if let Some(phone) = &first_contact.phone {
                    if !phone.is_empty() {
                        sqlx::query(
                            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)"
                        )
                        .bind(person_id)
                        .bind("phone")
                        .bind(phone)
                        .bind(first_contact.email.is_none())  // Primary if no email
                        .execute(&*pool)
                        .await
                        .map_err(|e| format!("Failed to create phone contact: {}", e))?;
                    }
                }
            }
        }
    }

    // Fetch and return the created household
    let household = sqlx::query_as::<_, Household>(
        "SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at FROM households WHERE id = ?"
    )
    .bind(household_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch created household: {}", e))?;

    Ok(household)
}

#[tauri::command]
pub async fn create_household_with_people(
    pool: State<'_, DatabasePool>,
    dto: CreateHouseholdWithPeopleDto,
) -> Result<HouseholdWithPeople, String> {
    let pool = pool.lock().await;
    household::create_household_with_people(&*pool, dto)
        .await
        .map_err(|e| format!("Failed to create household: {}", e))
}

#[tauri::command]
pub async fn create_patient_with_household(
    pool: State<'_, DatabasePool>,
    dto: CreatePatientWithHouseholdDto,
) -> Result<serde_json::Value, String> {
    let pool = pool.lock().await;
    let (household_with_people, patient_id) = household::create_patient_with_household(&*pool, dto)
        .await
        .map_err(|e| format!("Failed to create patient with household: {}", e))?;

    // Return both household and patient ID
    Ok(serde_json::json!({
        "household": household_with_people,
        "patient_id": patient_id,
    }))
}

#[tauri::command]
pub async fn search_households(
    pool: State<'_, DatabasePool>,
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<SearchHouseholdsResponse, String> {
    let pool = pool.lock().await;
    household_search::search_households(&*pool, &query, limit, offset)
        .await
        .map_err(|e| format!("Failed to search households: {}", e))
}

#[tauri::command]
pub async fn get_household_with_people(
    pool: State<'_, DatabasePool>,
    household_id: i32,
) -> Result<Option<HouseholdWithPeople>, String> {
    let pool = pool.lock().await;
    household::get_household_with_people(&*pool, household_id)
        .await
        .map_err(|e| format!("Failed to get household: {}", e))
}

#[tauri::command]
pub async fn update_household(
    pool: State<'_, DatabasePool>,
    household_id: i32,
    household_name: Option<String>,
    address: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let pool = pool.lock().await;
    household::update_household(&*pool, household_id, household_name, address, notes)
        .await
        .map_err(|e| format!("Failed to update household: {}", e))
}

#[tauri::command]
pub async fn delete_household(
    pool: State<'_, DatabasePool>,
    household_id: i32,
) -> Result<(), String> {
    let pool = pool.lock().await;
    household::delete_household(&*pool, household_id)
        .await
        .map_err(|e| format!("Failed to delete household: {}", e))
}

#[tauri::command]
pub async fn quick_search_households(
    pool: State<'_, DatabasePool>,
    query: String,
    limit: Option<i32>,
) -> Result<Vec<(i32, String)>, String> {
    let limit = limit.unwrap_or(10);
    let pool = pool.lock().await;
    household_search::quick_search_households(&*pool, &query, limit)
        .await
        .map_err(|e| format!("Failed to quick search households: {}", e))
}

#[tauri::command]
pub async fn get_all_households(
    pool: State<'_, DatabasePool>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<HouseholdWithPeople>, String> {
    let pool = pool.lock().await;

    // Use the search function with a wildcard pattern to get all households
    // Pass a pattern that matches everything
    let search_response = household_search::search_households(
        &*pool,
        "%%",  // Wildcard pattern that matches all
        limit,
        offset
    )
    .await
    .map_err(|e| {
        // If search fails due to minimum length requirement, try another approach
        if e.to_string().contains("at least 2 characters") {
            // Fall back to direct query
            return "Falling back to direct query".to_string();
        }
        format!("Failed to search households: {}", e)
    });

    // If search failed with the 2-char minimum error, do direct query
    if search_response.is_err() {
        // Directly fetch all households without using FTS5 search
        let household_rows = sqlx::query(
            r#"
            SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at
            FROM households
            ORDER BY household_name
            LIMIT ? OFFSET ?
            "#
        )
        .bind(limit.unwrap_or(100))
        .bind(offset.unwrap_or(0))
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to fetch households: {}", e))?;

        // Convert raw households to HouseholdWithPeople format
        let mut households = Vec::new();
        for row in household_rows {
            let household_id: i64 = row.get("id");

            // Get the full household with people
            let household_with_people = household::get_household_with_people(&*pool, household_id as i32)
                .await
                .map_err(|e| format!("Failed to fetch household {}: {}", household_id, e))?;

            if let Some(hwp) = household_with_people {
                households.push(hwp);
            }
        }
        return Ok(households);
    }

    // Convert search results to HouseholdWithPeople
    let search_response = search_response.unwrap();
    let mut households = Vec::new();

    for result in search_response.results {
        // Build HouseholdWithPeople from search result
        let household = Household {
            id: result.id,
            household_name: result.household_name,
            address: result.address,
            city: None,
            postal_code: None,
            notes: None,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        let people = result.people.into_iter().map(|p| PersonWithContacts {
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            is_primary: p.is_primary,
            contacts: p.contacts,
        }).collect();

        households.push(HouseholdWithPeople {
            household: household,
            people,
            pet_count: result.pet_count,  // Use the pet count from search result
        });
    }

    Ok(households)
}

#[tauri::command]
pub async fn rebuild_household_search_index(
    pool: State<'_, DatabasePool>,
) -> Result<(), String> {
    let pool = pool.lock().await;
    household_search::rebuild_search_index(&*pool)
        .await
        .map_err(|e| format!("Failed to rebuild search index: {}", e))
}

// New commands for household detail view

#[tauri::command]
pub async fn get_household_detail(
    pool: State<'_, DatabasePool>,
    household_id: i32,
) -> Result<serde_json::Value, String> {
    let pool = pool.lock().await;

    // Get household with people
    let household_with_people = household::get_household_with_people(&*pool, household_id)
        .await
        .map_err(|e| format!("Failed to get household: {}", e))?
        .ok_or_else(|| format!("Household {} not found", household_id))?;

    // Get associated patients - CAST weight to REAL to avoid type conversion issues
    let patients = sqlx::query(
        r#"
        SELECT p.id, p.name, p.species, p.breed, p.date_of_birth,
               CAST(p.weight AS REAL) as weight, p.gender
        FROM patients p
        JOIN patient_households ph ON p.id = ph.patient_id
        WHERE ph.household_id = ?
        ORDER BY p.name
        "#
    )
    .bind(household_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch patients: {}", e))?;

    let patients_json: Vec<serde_json::Value> = patients
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "name": row.get::<String, _>("name"),
                "species": row.get::<String, _>("species"),
                "breed": row.get::<Option<String>, _>("breed"),
                "dateOfBirth": row.get::<Option<String>, _>("date_of_birth"),
                "weight": row.get::<Option<f64>, _>("weight"),
                "gender": row.get::<Option<String>, _>("gender"),
                "status": "active" // Default to active for now
            })
        })
        .collect();

    Ok(serde_json::json!({
        "household": household_with_people.household,
        "people": household_with_people.people,
        "patients": patients_json,
        "petCount": household_with_people.pet_count
    }))
}

#[tauri::command]
pub async fn update_household_fields(
    pool: State<'_, DatabasePool>,
    household_id: i32,
    updates: serde_json::Value,
) -> Result<Household, String> {
    let pool = pool.lock().await;

    // Build dynamic update query based on provided fields
    let mut query_parts = Vec::new();
    let mut params = Vec::new();

    if let Some(name) = updates.get("householdName").and_then(|v| v.as_str()) {
        query_parts.push("household_name = ?");
        params.push(name.to_string());
    }

    if let Some(address) = updates.get("address") {
        query_parts.push("address = ?");
        params.push(address.as_str().unwrap_or("").to_string());
    }

    if let Some(city) = updates.get("city") {
        query_parts.push("city = ?");
        params.push(city.as_str().unwrap_or("").to_string());
    }

    if let Some(postal) = updates.get("postalCode") {
        query_parts.push("postal_code = ?");
        params.push(postal.as_str().unwrap_or("").to_string());
    }

    if let Some(notes) = updates.get("notes") {
        query_parts.push("notes = ?");
        params.push(notes.as_str().unwrap_or("").to_string());
    }

    if query_parts.is_empty() {
        return Err("No fields to update".to_string());
    }

    // Execute update
    let sql = format!(
        "UPDATE households SET {}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        query_parts.join(", ")
    );

    let mut query = sqlx::query(&sql);
    for param in params {
        query = query.bind(param);
    }
    query = query.bind(household_id);

    query.execute(&*pool)
        .await
        .map_err(|e| format!("Failed to update household: {}", e))?;

    // Return updated household (need to include new fields)
    let household = sqlx::query_as::<_, Household>(
        "SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at FROM households WHERE id = ?"
    )
    .bind(household_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch updated household: {}", e))?;

    Ok(household)
}

#[tauri::command]
pub async fn add_person_to_household(
    pool: State<'_, DatabasePool>,
    household_id: i32,
    person: CreatePersonWithContactsDto,
) -> Result<PersonWithContacts, String> {
    let pool = pool.lock().await;

    // Create person
    let person_result = sqlx::query(
        "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)"
    )
    .bind(household_id)
    .bind(&person.person.first_name)
    .bind(&person.person.last_name)
    .bind(person.person.is_primary.unwrap_or(false))
    .execute(&*pool)
    .await
    .map_err(|e| format!("Failed to create person: {}", e))?;

    let person_id = person_result.last_insert_rowid() as i32;

    // Add contacts
    for contact in &person.contacts {
        sqlx::query(
            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)"
        )
        .bind(person_id)
        .bind(&contact.contact_type)
        .bind(&contact.contact_value)
        .bind(contact.is_primary.unwrap_or(false))
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to create contact: {}", e))?;
    }

    // Fetch and return the created person with contacts
    household::get_person_with_contacts(&*pool, person_id)
        .await
        .map_err(|e| format!("Failed to fetch created person: {}", e))?
        .ok_or_else(|| "Failed to fetch created person".to_string())
}

#[tauri::command]
pub async fn update_person(
    pool: State<'_, DatabasePool>,
    person_id: i32,
    updates: serde_json::Value,
) -> Result<PersonWithContacts, String> {
    let pool = pool.lock().await;

    // Build dynamic update query
    let mut query_parts = Vec::new();
    let mut params = Vec::new();

    if let Some(first_name) = updates.get("firstName").and_then(|v| v.as_str()) {
        query_parts.push("first_name = ?");
        params.push(first_name.to_string());
    }

    if let Some(last_name) = updates.get("lastName").and_then(|v| v.as_str()) {
        query_parts.push("last_name = ?");
        params.push(last_name.to_string());
    }

    if let Some(is_primary) = updates.get("isPrimary").and_then(|v| v.as_bool()) {
        query_parts.push("is_primary = ?");
        params.push(if is_primary { "1" } else { "0" }.to_string());
    }

    if !query_parts.is_empty() {
        let sql = format!(
            "UPDATE people SET {}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            query_parts.join(", ")
        );

        let mut query = sqlx::query(&sql);
        for param in params {
            query = query.bind(param);
        }
        query = query.bind(person_id);

        query.execute(&*pool)
            .await
            .map_err(|e| format!("Failed to update person: {}", e))?;
    }

    // Return updated person with contacts
    household::get_person_with_contacts(&*pool, person_id)
        .await
        .map_err(|e| format!("Failed to fetch updated person: {}", e))?
        .ok_or_else(|| "Person not found".to_string())
}

#[tauri::command]
pub async fn delete_person(
    pool: State<'_, DatabasePool>,
    person_id: i32,
) -> Result<(), String> {
    let pool = pool.lock().await;

    // Check if this is the last person in the household
    let household_id = sqlx::query_scalar::<_, i32>(
        "SELECT household_id FROM people WHERE id = ?"
    )
    .bind(person_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to find person: {}", e))?;

    let person_count = sqlx::query_scalar::<_, i32>(
        "SELECT COUNT(*) FROM people WHERE household_id = ?"
    )
    .bind(household_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| format!("Failed to count people: {}", e))?;

    if person_count <= 1 {
        return Err("Cannot delete the last person in a household".to_string());
    }

    // Delete the person (contacts will cascade)
    sqlx::query("DELETE FROM people WHERE id = ?")
        .bind(person_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete person: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn update_person_contacts(
    pool: State<'_, DatabasePool>,
    person_id: i32,
    contacts: Vec<CreateContactDto>,
) -> Result<Vec<PersonContact>, String> {
    let pool = pool.lock().await;

    // Delete existing contacts
    sqlx::query("DELETE FROM person_contacts WHERE person_id = ?")
        .bind(person_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete existing contacts: {}", e))?;

    // Insert new contacts
    let mut contact_ids = Vec::new();
    for contact in contacts {
        let result = sqlx::query(
            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)"
        )
        .bind(person_id)
        .bind(&contact.contact_type)
        .bind(&contact.contact_value)
        .bind(contact.is_primary.unwrap_or(false))
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to create contact: {}", e))?;

        contact_ids.push(result.last_insert_rowid() as i32);
    }

    // Fetch and return all contacts for this person
    let contacts = sqlx::query_as::<_, PersonContact>(
        "SELECT id, person_id, contact_type, contact_value, is_primary, created_at FROM person_contacts WHERE person_id = ?"
    )
    .bind(person_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

    Ok(contacts)
}

#[tauri::command]
pub async fn get_household_patients(
    pool: State<'_, DatabasePool>,
    household_id: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = pool.lock().await;

    // Debug: First check what's in patient_households table
    let debug_relationships = sqlx::query(
        "SELECT patient_id, household_id FROM patient_households WHERE household_id = ?"
    )
    .bind(household_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch patient relationships: {}", e))?;

    println!("Debug: Found {} patient relationships for household {}",
             debug_relationships.len(), household_id);

    for row in &debug_relationships {
        println!("  - Patient ID: {}, Household ID: {}",
                 row.get::<i64, _>("patient_id"),
                 row.get::<i64, _>("household_id"));
    }

    // Get associated patients - CAST weight to REAL to avoid type conversion issues
    let patients = sqlx::query(
        r#"
        SELECT p.id, p.name, p.species, p.breed, p.date_of_birth,
               CAST(p.weight AS REAL) as weight, p.gender
        FROM patients p
        JOIN patient_households ph ON p.id = ph.patient_id
        WHERE ph.household_id = ?
        ORDER BY p.name
        "#
    )
    .bind(household_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to fetch patients: {}", e))?;

    println!("Debug: Found {} patients for household {}", patients.len(), household_id);

    let patients_json: Vec<serde_json::Value> = patients
        .into_iter()
        .map(|row| {
            let patient_name = row.get::<String, _>("name");
            let patient_id = row.get::<i64, _>("id");
            println!("  - Processing patient: {} (ID: {})", patient_name, patient_id);

            let json = serde_json::json!({
                "id": patient_id,
                "name": patient_name,
                "species": row.get::<String, _>("species"),
                "breed": row.get::<Option<String>, _>("breed"),
                "dateOfBirth": row.get::<Option<String>, _>("date_of_birth"),
                "weight": row.get::<Option<f64>, _>("weight"),
                "gender": row.get::<Option<String>, _>("gender"),
                "status": "active" // Default to active for now
            });

            println!("    Generated JSON: {}", serde_json::to_string(&json).unwrap_or_default());
            json
        })
        .collect();

    println!("Returning {} patients as JSON for household {}", patients_json.len(), household_id);
    Ok(patients_json)
}