use tauri::State;
use crate::database::connection::DatabasePool;
use crate::database::queries::patient as patient_queries;
use crate::models::{Patient, CreatePatientDto, UpdatePatientDto, PatientWithOwners};

#[tauri::command]
pub async fn get_patients(pool: State<'_, DatabasePool>) -> Result<Vec<Patient>, String> {
    let pool = pool.lock().await;
    patient_queries::get_all_patients(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_patient(pool: State<'_, DatabasePool>, id: i64) -> Result<Option<Patient>, String> {
    let pool = pool.lock().await;
    patient_queries::get_patient_by_id(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_patient_with_owners(pool: State<'_, DatabasePool>, id: i64) -> Result<Option<PatientWithOwners>, String> {
    let pool = pool.lock().await;
    patient_queries::get_patient_with_owners(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_patient(pool: State<'_, DatabasePool>, dto: CreatePatientDto) -> Result<Patient, String> {
    let pool = pool.lock().await;
    patient_queries::create_patient(&*pool, dto)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_patient(pool: State<'_, DatabasePool>, id: i64, dto: UpdatePatientDto) -> Result<Option<Patient>, String> {
    let pool = pool.lock().await;
    patient_queries::update_patient(&*pool, id, dto)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_patient(pool: State<'_, DatabasePool>, id: i64) -> Result<bool, String> {
    let pool = pool.lock().await;
    patient_queries::delete_patient(&*pool, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_patients(pool: State<'_, DatabasePool>, query: String) -> Result<Vec<Patient>, String> {
    let pool = pool.lock().await;
    crate::database::queries::search::search_patients(&*pool, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_patients_by_species(pool: State<'_, DatabasePool>, species: String) -> Result<Vec<Patient>, String> {
    let pool = pool.lock().await;
    patient_queries::get_patients_by_species(&*pool, &species)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_patients_by_owner(pool: State<'_, DatabasePool>, owner_query: String) -> Result<Vec<Patient>, String> {
    let pool = pool.lock().await;
    crate::database::queries::search::search_patients_by_owner(&*pool, &owner_query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn advanced_patient_search(
    pool: State<'_, DatabasePool>,
    patient_name: Option<String>,
    species: Option<String>,
    owner_name: Option<String>,
) -> Result<Vec<Patient>, String> {
    let pool = pool.lock().await;
    crate::database::queries::search::advanced_search(
        &*pool,
        patient_name.as_deref(),
        species.as_deref(),
        owner_name.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}