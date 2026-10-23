use crate::database::SeaOrmPool;
use crate::services::lab_results::{self, LabResultRow, RecordLabValue};
use tauri::State;

/// Every lab value of the patient, newest sample first (Labs tab).
#[tauri::command]
pub async fn get_patient_lab_results(pool: State<'_, SeaOrmPool>, patient_id: i64) -> Result<Vec<LabResultRow>, String> {
    lab_results::patient_lab_results(&pool, patient_id).await
}

/// The record's lab values, each with the patient's previous value of it.
#[tauri::command]
pub async fn get_record_lab_values(
    pool: State<'_, SeaOrmPool>,
    medical_record_id: i64,
) -> Result<Vec<RecordLabValue>, String> {
    lab_results::record_lab_values(&pool, medical_record_id).await
}
