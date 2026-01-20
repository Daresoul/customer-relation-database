use tauri::State;
use crate::database::SeaOrmPool;
use crate::services::patient::PatientService;
use crate::models::{Patient, CreatePatientDto, UpdatePatientDto};

#[tauri::command]
pub async fn get_patients(pool: State<'_, SeaOrmPool>) -> Result<Vec<Patient>, String> {
    PatientService::get_all(&pool).await
}

#[tauri::command]
pub async fn get_patient(pool: State<'_, SeaOrmPool>, id: i64) -> Result<Option<Patient>, String> {
    PatientService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_patient(pool: State<'_, SeaOrmPool>, dto: CreatePatientDto) -> Result<Patient, String> {
    PatientService::create(&pool, dto).await
}

#[tauri::command]
pub async fn update_patient(pool: State<'_, SeaOrmPool>, id: i64, dto: UpdatePatientDto) -> Result<Option<Patient>, String> {
    log::debug!("update_patient called with id: {}, dto: {:?}", id, dto);
    let result = PatientService::update(&pool, id, dto).await;
    log::debug!("update_patient result: {:?}", result);
    result
}

#[tauri::command]
pub async fn delete_patient(pool: State<'_, SeaOrmPool>, id: i64) -> Result<bool, String> {
    PatientService::delete(&pool, id).await
}

#[tauri::command]
pub async fn search_patients(pool: State<'_, SeaOrmPool>, query: String) -> Result<Vec<Patient>, String> {
    PatientService::search(&pool, &query).await
}

#[tauri::command]
pub async fn get_patients_by_species(pool: State<'_, SeaOrmPool>, species: String) -> Result<Vec<Patient>, String> {
    PatientService::get_by_species(&pool, &species).await
}

#[tauri::command]
pub async fn advanced_patient_search(
    pool: State<'_, SeaOrmPool>,
    patient_name: Option<String>,
    species: Option<String>,
) -> Result<Vec<Patient>, String> {
    PatientService::advanced_search(
        &pool,
        patient_name.as_deref(),
        species.as_deref(),
    ).await
}
