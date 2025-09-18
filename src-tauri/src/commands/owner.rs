use tauri::State;
use crate::database::connection::DatabasePool;
use crate::database::queries::owner as owner_queries;
use crate::models::{Owner, CreateOwnerDto, UpdateOwnerDto, OwnerWithPatients};

#[tauri::command]
pub async fn get_owners(pool: State<'_, DatabasePool>) -> Result<Vec<Owner>, String> {
    let pool = pool.lock().await;
    owner_queries::get_all_owners(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_owner(pool: State<'_, DatabasePool>, id: i64) -> Result<Option<Owner>, String> {
    let pool = pool.lock().await;
    owner_queries::get_owner_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_owner_with_patients(pool: State<'_, DatabasePool>, id: i64) -> Result<Option<OwnerWithPatients>, String> {
    let pool = pool.lock().await;
    owner_queries::get_owner_with_patients(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_owner(pool: State<'_, DatabasePool>, dto: CreateOwnerDto) -> Result<Owner, String> {
    let pool = pool.lock().await;
    owner_queries::create_owner(&*pool, dto)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_owner(pool: State<'_, DatabasePool>, id: i64, dto: UpdateOwnerDto) -> Result<Option<Owner>, String> {
    let pool = pool.lock().await;
    owner_queries::update_owner(&*pool, id, dto)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_owner(pool: State<'_, DatabasePool>, id: i64) -> Result<bool, String> {
    let pool = pool.lock().await;
    owner_queries::delete_owner(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_owners(pool: State<'_, DatabasePool>, query: String) -> Result<Vec<Owner>, String> {
    let pool = pool.lock().await;
    crate::database::queries::search::search_owners(&*pool, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_owners_by_name(pool: State<'_, DatabasePool>, search_term: String) -> Result<Vec<Owner>, String> {
    let pool = pool.lock().await;
    owner_queries::find_owners_by_name(&*pool, &search_term)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_owners_by_patient(pool: State<'_, DatabasePool>, patient_query: String) -> Result<Vec<Owner>, String> {
    let pool = pool.lock().await;
    crate::database::queries::search::search_owners_by_patient(&*pool, &patient_query)
        .await
        .map_err(|e| e.to_string())
}