use tauri::State;
use crate::database::SeaOrmPool;
use crate::services::patient::PatientService;
use crate::models::{Patient, PatientAlert, PatientWeight, CreatePatientDto, UpdatePatientDto};
use chrono::NaiveDate;

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
pub async fn search_patients(
    pool: State<'_, SeaOrmPool>,
    query: String,
    include_inactive: Option<bool>,
) -> Result<Vec<Patient>, String> {
    PatientService::search_including_inactive(&pool, &query, include_inactive.unwrap_or(false)).await
}

#[tauri::command]
pub async fn mark_patient_deceased(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    deceased_on: NaiveDate,
    note: Option<String>,
) -> Result<Option<Patient>, String> {
    PatientService::mark_deceased(&pool, id, deceased_on, note).await
}

#[tauri::command]
pub async fn mark_patient_inactive(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    reason: Option<String>,
) -> Result<Option<Patient>, String> {
    PatientService::mark_inactive(&pool, id, reason).await
}

#[tauri::command]
pub async fn reactivate_patient(pool: State<'_, SeaOrmPool>, id: i64) -> Result<Option<Patient>, String> {
    PatientService::reactivate(&pool, id).await
}

#[tauri::command]
pub async fn add_patient_alert(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    alert_type: String,
    note: Option<String>,
) -> Result<PatientAlert, String> {
    PatientService::add_alert(&pool, patient_id, &alert_type, note).await
}

#[tauri::command]
pub async fn update_patient_alert(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    alert_type: String,
    note: Option<String>,
) -> Result<PatientAlert, String> {
    PatientService::update_alert(&pool, id, &alert_type, note).await
}

#[tauri::command]
pub async fn delete_patient_alert(pool: State<'_, SeaOrmPool>, id: i64) -> Result<bool, String> {
    PatientService::delete_alert(&pool, id).await
}

#[tauri::command]
pub async fn get_patient_weights(pool: State<'_, SeaOrmPool>, patient_id: i64) -> Result<Vec<PatientWeight>, String> {
    PatientService::list_weights(&pool, patient_id).await
}

#[tauri::command]
pub async fn add_patient_weight(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
    weight: f64,
    measured_on: NaiveDate,
    medical_record_id: Option<i64>,
) -> Result<PatientWeight, String> {
    PatientService::add_weight(&pool, patient_id, weight, measured_on, medical_record_id).await
}

#[tauri::command]
pub async fn delete_patient_weight(pool: State<'_, SeaOrmPool>, id: i64) -> Result<bool, String> {
    PatientService::delete_weight(&pool, id).await
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
