//! Tauri commands for diagnosis CRUD and the medical-record link.
//!
//! Exposed to the frontend:
//!   - get_diagnoses(active_only)           → Vec<Diagnosis>
//!   - get_diagnosis(id)                    → Diagnosis
//!   - create_diagnosis(input)              → Diagnosis
//!   - update_diagnosis(id, input)          → Diagnosis
//!   - delete_diagnosis(id, hard_delete?)   → ()
//!   - get_diagnoses_for_record(record_id)  → Vec<Diagnosis>
//!   - set_diagnoses_for_record(record_id, diagnosis_ids) → ()
//!   - get_diagnoses_for_patient(patient_id) → Vec<Diagnosis> (deduped)
//!
//! The two record-scoped commands let the medical-record form load and
//! save its tag set independently of the rest of the record's fields,
//! which keeps the existing medical record commands unchanged.

use crate::database::SeaOrmPool;
use crate::models::diagnosis::{CreateDiagnosisInput, Diagnosis, UpdateDiagnosisInput};
use crate::services::diagnosis::DiagnosisService;
use tauri::State;

#[tauri::command]
pub async fn get_diagnoses(
    pool: State<'_, SeaOrmPool>,
    active_only: Option<bool>,
) -> Result<Vec<Diagnosis>, String> {
    DiagnosisService::list_all(&pool, active_only.unwrap_or(true)).await
}

#[tauri::command]
pub async fn get_diagnosis(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<Diagnosis, String> {
    DiagnosisService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_diagnosis(
    pool: State<'_, SeaOrmPool>,
    input: CreateDiagnosisInput,
) -> Result<Diagnosis, String> {
    DiagnosisService::create(&pool, input).await
}

#[tauri::command]
pub async fn update_diagnosis(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateDiagnosisInput,
) -> Result<Diagnosis, String> {
    DiagnosisService::update(&pool, id, input).await
}

#[tauri::command]
pub async fn delete_diagnosis(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    if hard_delete.unwrap_or(false) {
        DiagnosisService::hard_delete(&pool, id).await
    } else {
        DiagnosisService::deactivate(&pool, id).await
    }
}

#[tauri::command]
pub async fn get_diagnoses_for_record(
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
) -> Result<Vec<Diagnosis>, String> {
    DiagnosisService::list_for_record(&pool, medical_record_id).await
}

#[tauri::command]
pub async fn set_diagnoses_for_record(
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
    diagnosis_ids: Vec<i64>,
) -> Result<(), String> {
    DiagnosisService::set_for_record(&pool, medical_record_id, &diagnosis_ids).await
}

#[tauri::command]
pub async fn get_diagnoses_for_patient(
    pool: State<'_, SeaOrmPool>,
    patient_id: i64,
) -> Result<Vec<Diagnosis>, String> {
    DiagnosisService::list_for_patient(&pool, patient_id).await
}
