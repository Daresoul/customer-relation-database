use tauri::State;
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
pub async fn rebuild_household_search_index(
    pool: State<'_, DatabasePool>,
) -> Result<(), String> {
    let pool = pool.lock().await;
    household_search::rebuild_search_index(&*pool)
        .await
        .map_err(|e| format!("Failed to rebuild search index: {}", e))
}