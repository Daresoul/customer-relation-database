use tauri::State;
use crate::database::connection::DatabasePool;
use crate::database::queries::relationship as relationship_queries;
use crate::models::PatientOwner;

#[tauri::command]
pub async fn add_patient_owner(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    owner_id: i64,
    relationship_type: Option<String>,
    is_primary: bool,
) -> Result<PatientOwner, String> {
    let pool = pool.lock().await;
    relationship_queries::add_patient_owner(&*pool, patient_id, owner_id, relationship_type, is_primary)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_patient_owner(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    owner_id: i64,
) -> Result<bool, String> {
    let pool = pool.lock().await;
    relationship_queries::remove_patient_owner(&*pool, patient_id, owner_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_primary_owner(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    owner_id: i64,
) -> Result<bool, String> {
    let pool = pool.lock().await;
    relationship_queries::set_primary_owner(&*pool, patient_id, owner_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_patient_owners(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
) -> Result<Vec<PatientOwner>, String> {
    let pool = pool.lock().await;
    relationship_queries::get_patient_owners(&*pool, patient_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_owner_patients(
    pool: State<'_, DatabasePool>,
    owner_id: i64,
) -> Result<Vec<PatientOwner>, String> {
    let pool = pool.lock().await;
    relationship_queries::get_owner_patients(&*pool, owner_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_relationship_type(
    pool: State<'_, DatabasePool>,
    patient_id: i64,
    owner_id: i64,
    relationship_type: String,
) -> Result<bool, String> {
    let pool = pool.lock().await;
    relationship_queries::update_relationship_type(&*pool, patient_id, owner_id, relationship_type)
        .await
        .map_err(|e| e.to_string())
}