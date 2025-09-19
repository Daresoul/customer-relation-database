use tauri::State;
use sqlx::Row;
use crate::database::DatabasePool;
use crate::models::household::*;
use crate::database::queries::{household, household_search};

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
            SELECT id, household_name, address, notes, created_at
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