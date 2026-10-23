use tauri::State;
use serde::Deserialize;
use crate::database::SeaOrmPool;
use crate::models::household::*;
use crate::database::queries::{household, household_duplicates, household_merge, household_search};
use sea_orm::{ConnectionTrait, Statement, DbBackend, Value};

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct CreateHouseholdRequest {
    #[serde(rename = "lastName")]
    pub last_name: String,
    pub contacts: Option<Vec<ContactInfo>>,
}

#[allow(dead_code)]
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
    pool: State<'_, SeaOrmPool>,
    last_name: String,
    contacts: Option<Vec<ContactInfo>>,
) -> Result<Household, String> {
    // Create a simple household
    let result = pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO households (household_name, address, notes) VALUES (?, ?, ?)",
        [
            last_name.clone().into(),
            Value::String(None),  // No address initially
            Value::String(None),  // No notes initially
        ]
    ))
    .await
    .map_err(|e| format!("Failed to create household: {}", e))?;

    let household_id = result.last_insert_id() as i64;

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
                let person_result = pool.execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "INSERT INTO people (household_id, first_name, last_name, is_primary) VALUES (?, ?, ?, ?)",
                    [
                        household_id.into(),
                        first_name.into(),
                        last_name_person.into(),
                        true.into(),  // Primary contact
                    ]
                ))
                .await
                .map_err(|e| format!("Failed to create person: {}", e))?;

                let person_id = person_result.last_insert_id() as i64;

                // Add email if provided
                if let Some(email) = &first_contact.email {
                    if !email.is_empty() {
                        pool.execute(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)",
                            [
                                person_id.into(),
                                "email".into(),
                                email.clone().into(),
                                true.into(),
                            ]
                        ))
                        .await
                        .map_err(|e| format!("Failed to create email contact: {}", e))?;
                    }
                }

                // Add phone if provided
                if let Some(phone) = &first_contact.phone {
                    if !phone.is_empty() {
                        pool.execute(Statement::from_sql_and_values(
                            DbBackend::Sqlite,
                            "INSERT INTO person_contacts (person_id, contact_type, contact_value, is_primary) VALUES (?, ?, ?, ?)",
                            [
                                person_id.into(),
                                "phone".into(),
                                phone.clone().into(),
                                first_contact.email.is_none().into(),  // Primary if no email
                            ]
                        ))
                        .await
                        .map_err(|e| format!("Failed to create phone contact: {}", e))?;
                    }
                }
            }
        }
    }

    // Fetch and return the created household
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, household_name, address, city, postal_code, notes, created_at, updated_at FROM households WHERE id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch created household: {}", e))?
    .ok_or("Created household not found")?;

    Ok(row_to_household(&row)?)
}

#[tauri::command]
pub async fn create_household_with_people(
    pool: State<'_, SeaOrmPool>,
    dto: CreateHouseholdWithPeopleDto,
) -> Result<HouseholdWithPeople, String> {
    household::create_household_with_people(&pool, dto).await
}

#[tauri::command]
pub async fn create_patient_with_household(
    pool: State<'_, SeaOrmPool>,
    dto: CreatePatientWithHouseholdDto,
) -> Result<serde_json::Value, String> {
    let (household_with_people, patient_id) = household::create_patient_with_household(&pool, dto).await?;

    // Return both household and patient ID
    Ok(serde_json::json!({
        "household": household_with_people,
        "patient_id": patient_id,
    }))
}

#[tauri::command]
pub async fn search_households(
    pool: State<'_, SeaOrmPool>,
    query: String,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<SearchHouseholdsResponse, String> {
    household_search::search_households(&pool, &query, limit, offset).await
}

#[tauri::command]
pub async fn find_household_duplicates(
    pool: State<'_, SeaOrmPool>,
    check: household_duplicates::DuplicateCheck,
) -> Result<Vec<household_duplicates::DuplicateMatch>, String> {
    household_duplicates::find_household_duplicates(&pool, &check).await
}

#[tauri::command]
pub async fn get_household_with_people(
    pool: State<'_, SeaOrmPool>,
    household_id: i32,
) -> Result<Option<HouseholdWithPeople>, String> {
    household::get_household_with_people(&pool, household_id).await
}

#[tauri::command]
pub async fn update_household(
    pool: State<'_, SeaOrmPool>,
    household_id: i32,
    household_name: Option<String>,
    address: Option<String>,
    city: Option<String>,
    postal_code: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    household::update_household(
        &pool,
        household_id,
        household_name,
        address,
        city,
        postal_code,
        notes,
    )
    .await
}

#[tauri::command]
pub async fn delete_household(
    pool: State<'_, SeaOrmPool>,
    household_id: i32,
) -> Result<(), String> {
    household::delete_household(&pool, household_id).await
}

#[tauri::command]
pub async fn quick_search_households(
    pool: State<'_, SeaOrmPool>,
    query: String,
    limit: Option<i32>,
) -> Result<Vec<(i32, String)>, String> {
    let limit = limit.unwrap_or(10);
    household_search::quick_search_households(&pool, &query, limit).await
}

#[tauri::command]
pub async fn get_all_households(
    pool: State<'_, SeaOrmPool>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<HouseholdWithPeople>, String> {
    let search_response = household_search::list_households(&pool, limit, offset).await?;

    // Convert search results to HouseholdWithPeople
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
            household,
            people,
            pet_count: result.pet_count,
        });
    }

    Ok(households)
}

#[tauri::command]
pub async fn rebuild_household_search_index(
    pool: State<'_, SeaOrmPool>,
) -> Result<(), String> {
    household_search::rebuild_search_index(&pool).await
}

// New commands for household detail view

#[tauri::command]
pub async fn add_person_to_household(
    pool: State<'_, SeaOrmPool>,
    household_id: i32,
    person: CreatePersonWithContactsDto,
) -> Result<PersonWithContacts, String> {
    let person_id = household::add_person_with_contacts(&pool, household_id, &person).await?;

    // Fetch and return the created person with contacts
    household::get_person_with_contacts(&pool, person_id)
        .await?
        .ok_or_else(|| "Failed to fetch created person".to_string())
}

#[tauri::command]
pub async fn update_person(
    pool: State<'_, SeaOrmPool>,
    person_id: i32,
    updates: serde_json::Value,
) -> Result<PersonWithContacts, String> {
    // Build dynamic update query
    let mut query_parts = Vec::new();
    let mut params: Vec<Value> = Vec::new();

    if let Some(first_name) = updates.get("firstName").and_then(|v| v.as_str()) {
        query_parts.push("first_name = ?");
        params.push(first_name.to_string().into());
    }

    if let Some(last_name) = updates.get("lastName").and_then(|v| v.as_str()) {
        query_parts.push("last_name = ?");
        params.push(last_name.to_string().into());
    }

    if !query_parts.is_empty() {
        let sql = format!(
            "UPDATE people SET {}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            query_parts.join(", ")
        );

        params.push(person_id.into());

        pool.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, params))
            .await
            .map_err(|e| format!("Failed to update person: {}", e))?;
    }

    // One primary per household: true moves it here; false is ignored, since
    // the household would be left without one (make someone else primary).
    if updates.get("isPrimary").and_then(|v| v.as_bool()) == Some(true) {
        household_merge::set_primary_person(&pool, person_id).await?;
    }

    // Return updated person with contacts
    household::get_person_with_contacts(&pool, person_id)
        .await?
        .ok_or_else(|| "Person not found".to_string())
}

#[tauri::command]
pub async fn delete_person(
    pool: State<'_, SeaOrmPool>,
    person_id: i32,
) -> Result<(), String> {
    household_merge::delete_person(&pool, person_id).await
}

#[tauri::command]
pub async fn set_primary_person(
    pool: State<'_, SeaOrmPool>,
    person_id: i32,
) -> Result<(), String> {
    household_merge::set_primary_person(&pool, person_id).await
}

#[tauri::command]
pub async fn get_household_merge_preview(
    pool: State<'_, SeaOrmPool>,
    keep_id: i32,
    merge_id: i32,
) -> Result<household_merge::HouseholdMergePreview, String> {
    household_merge::merge_preview(&pool, keep_id, merge_id).await
}

#[tauri::command]
pub async fn merge_households(
    pool: State<'_, SeaOrmPool>,
    keep_id: i32,
    merge_id: i32,
    details_from: i32,
) -> Result<(), String> {
    household_merge::merge_households(&pool, keep_id, merge_id, details_from).await
}

#[tauri::command]
pub async fn update_person_contacts(
    pool: State<'_, SeaOrmPool>,
    person_id: i32,
    contacts: Vec<CreateContactDto>,
) -> Result<Vec<PersonContact>, String> {
    household::replace_person_contacts(&pool, person_id, &contacts).await?;

    // Fetch and return all contacts for this person
    let rows = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT id, person_id, contact_type, contact_value, is_primary, created_at FROM person_contacts WHERE person_id = ?",
        [person_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch contacts: {}", e))?;

    let contacts: Result<Vec<PersonContact>, String> = rows.iter()
        .map(row_to_person_contact)
        .collect();

    contacts
}

#[tauri::command]
pub async fn get_household_patients(
    pool: State<'_, SeaOrmPool>,
    household_id: i32,
) -> Result<Vec<serde_json::Value>, String> {
    let household_id = household_merge::resolve_household_id(&pool, household_id)
        .await?
        .unwrap_or(household_id);
    household_patients_json(&pool, household_id).await
}

/// `status` is `active`, `inactive` or `deceased` (with `deceasedAt`).
pub(crate) async fn household_patients_json(
    pool: &sea_orm::DatabaseConnection,
    household_id: i32,
) -> Result<Vec<serde_json::Value>, String> {
    // Debug: First check what's in patient_households table
    let debug_relationships = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT patient_id, household_id FROM patient_households WHERE household_id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch patient relationships: {}", e))?;

    log::debug!("Found {} patient relationships for household {}",
             debug_relationships.len(), household_id);

    for row in &debug_relationships {
        let patient_id: i64 = row.try_get("", "patient_id").unwrap_or(0);
        let hh_id: i64 = row.try_get("", "household_id").unwrap_or(0);
        log::debug!("  - Patient ID: {}, Household ID: {}", patient_id, hh_id);
    }

    // Get associated patients - CAST weight to REAL to avoid type conversion issues
    let patients = pool.query_all(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        r#"
        SELECT p.id, p.name, s.name as species, b.name as breed, p.date_of_birth,
               CAST(p.weight AS REAL) as weight, p.gender, p.is_active, p.deceased_at
        FROM patients p
        JOIN patient_households ph ON p.id = ph.patient_id
        LEFT JOIN species s ON p.species_id = s.id
        LEFT JOIN breeds b ON p.breed_id = b.id
        WHERE ph.household_id = ?
        ORDER BY p.name
        "#,
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to fetch patients: {}", e))?;

    log::debug!("Found {} patients for household {}", patients.len(), household_id);

    let patients_json: Vec<serde_json::Value> = patients
        .iter()
        .map(|row| {
            let patient_id: i64 = row.try_get("", "id").unwrap_or(0);
            let patient_name: String = row.try_get("", "name").unwrap_or_default();
            log::debug!("  - Processing patient {}", patient_id);

            let species: String = row.try_get("", "species").unwrap_or_default();
            let breed: Option<String> = row.try_get("", "breed").ok();
            let date_of_birth: Option<String> = row.try_get("", "date_of_birth").ok();
            let weight: Option<f64> = row.try_get("", "weight").ok();
            let gender: Option<String> = row.try_get("", "gender").ok();
            let deceased_at: Option<String> = row
                .try_get::<Option<chrono::NaiveDate>>("", "deceased_at")
                .ok()
                .flatten()
                .map(|d| d.format("%Y-%m-%d").to_string());
            let is_active = row.try_get::<i64>("", "is_active").map(|v| v == 1).unwrap_or(true);
            let status = if deceased_at.is_some() { "deceased" } else if is_active { "active" } else { "inactive" };

            let json = serde_json::json!({
                "id": patient_id,
                "name": patient_name,
                "species": species,
                "breed": breed,
                "dateOfBirth": date_of_birth,
                "weight": weight,
                "gender": gender,
                "status": status,
                "deceasedAt": deceased_at,
            });

            log::debug!("    Generated JSON: {}", serde_json::to_string(&json).unwrap_or_default());
            json
        })
        .collect();

    log::debug!("Returning {} patients as JSON for household {}", patients_json.len(), household_id);
    Ok(patients_json)
}

#[tauri::command]
pub async fn link_patient_to_household(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    household_id: i32,
    relationship_type: Option<String>,
    is_primary: Option<bool>,
) -> Result<(), String> {
    // Check if patient exists
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) as count FROM patients WHERE id = ?",
        [patient_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to check patient: {}", e))?
    .ok_or("Failed to check patient")?;

    let patient_exists: i64 = row.try_get("", "count")
        .map_err(|e| format!("Failed to get count: {}", e))?;

    if patient_exists == 0 {
        return Err(format!("Patient {} not found", patient_id));
    }

    // Check if household exists
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) as count FROM households WHERE id = ?",
        [household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to check household: {}", e))?
    .ok_or("Failed to check household")?;

    let household_exists: i64 = row.try_get("", "count")
        .map_err(|e| format!("Failed to get count: {}", e))?;

    if household_exists == 0 {
        return Err(format!("Household {} not found", household_id));
    }

    // Check if link already exists
    let row = pool.query_one(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "SELECT COUNT(*) as count FROM patient_households WHERE patient_id = ? AND household_id = ?",
        [patient_id.into(), household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to check existing link: {}", e))?
    .ok_or("Failed to check existing link")?;

    let link_exists: i64 = row.try_get("", "count")
        .map_err(|e| format!("Failed to get count: {}", e))?;

    if link_exists > 0 {
        return Err("Patient is already linked to this household".to_string());
    }

    let rel_type = relationship_type.unwrap_or_else(|| "Pet".to_string());
    let primary = is_primary.unwrap_or(true);

    // If this is primary, unset other primary relationships for this patient
    if primary {
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE patient_households SET is_primary = 0 WHERE patient_id = ?",
            [patient_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to update existing relationships: {}", e))?;
    }

    // Create the link
    pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT INTO patient_households (patient_id, household_id, relationship_type, is_primary) VALUES (?, ?, ?, ?)",
        [
            patient_id.into(),
            household_id.into(),
            rel_type.into(),
            primary.into(),
        ]
    ))
    .await
    .map_err(|e| format!("Failed to link patient to household: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn unlink_patient_from_household(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    household_id: i32,
) -> Result<(), String> {
    let result = pool.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM patient_households WHERE patient_id = ? AND household_id = ?",
        [patient_id.into(), household_id.into()]
    ))
    .await
    .map_err(|e| format!("Failed to unlink patient from household: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Patient is not linked to this household".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn update_patient_household(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    household_id: Option<i32>,
) -> Result<(), String> {
    household_merge::set_patient_household(&pool, patient_id, household_id).await
}

// Helper function to map SeaORM row to Household
fn row_to_household(row: &sea_orm::QueryResult) -> Result<Household, String> {
    Ok(Household {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        household_name: row.try_get("", "household_name").map_err(|e| format!("Failed to get household_name: {}", e))?,
        address: row.try_get("", "address").ok(),
        city: row.try_get("", "city").ok(),
        postal_code: row.try_get("", "postal_code").ok(),
        notes: row.try_get("", "notes").ok(),
        created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
        updated_at: row.try_get("", "updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
    })
}

// Helper function to map SeaORM row to PersonContact
fn row_to_person_contact(row: &sea_orm::QueryResult) -> Result<PersonContact, String> {
    Ok(PersonContact {
        id: row.try_get("", "id").map_err(|e| format!("Failed to get id: {}", e))?,
        person_id: row.try_get("", "person_id").map_err(|e| format!("Failed to get person_id: {}", e))?,
        contact_type: row.try_get("", "contact_type").map_err(|e| format!("Failed to get contact_type: {}", e))?,
        contact_value: row.try_get("", "contact_value").map_err(|e| format!("Failed to get contact_value: {}", e))?,
        is_primary: row.try_get("", "is_primary").map_err(|e| format!("Failed to get is_primary: {}", e))?,
        created_at: row.try_get("", "created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
    })
}