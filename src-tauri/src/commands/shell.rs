//! Commands behind the app header and the dashboard's Today strip.

use crate::database::SeaOrmPool;
use crate::services::dashboard::count_patients_seen_between;
use crate::services::patient_search::{search_patients_everywhere, PatientSearchHit};
use tauri::State;

const DEFAULT_SEARCH_LIMIT: usize = 20;

#[tauri::command]
pub async fn global_patient_search(
    pool: State<'_, SeaOrmPool>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<PatientSearchHit>, String> {
    search_patients_everywhere(&pool, &query, limit.unwrap_or(DEFAULT_SEARCH_LIMIT).min(50)).await
}

#[tauri::command]
pub async fn count_patients_seen(
    pool: State<'_, SeaOrmPool>,
    start: String,
    end: String,
) -> Result<i64, String> {
    count_patients_seen_between(&pool, &start, &end).await
}
