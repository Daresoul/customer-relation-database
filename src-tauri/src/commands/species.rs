use tauri::State;
use crate::database::connection::DatabasePool;
use crate::models::{Species, CreateSpeciesInput, UpdateSpeciesInput};
use crate::services::species::SpeciesService;

#[tauri::command]
pub async fn get_species(
    pool: State<'_, DatabasePool>,
    active_only: Option<bool>,
) -> Result<Vec<Species>, String> {
    let pool = pool.lock().await;
    SpeciesService::get_all(&*pool, active_only.unwrap_or(true))
        .await
}

#[tauri::command]
pub async fn get_species_by_id(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<Species, String> {
    let pool = pool.lock().await;
    SpeciesService::get_by_id(&*pool, id)
        .await
}

#[tauri::command]
pub async fn create_species(
    pool: State<'_, DatabasePool>,
    input: CreateSpeciesInput,
) -> Result<Species, String> {
    let pool = pool.lock().await;
    SpeciesService::create(&*pool, input)
        .await
}

#[tauri::command]
pub async fn update_species(
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateSpeciesInput,
) -> Result<Species, String> {
    let pool = pool.lock().await;
    SpeciesService::update(&*pool, id, input)
        .await
}

#[tauri::command]
pub async fn delete_species(
    pool: State<'_, DatabasePool>,
    id: i64,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    let pool = pool.lock().await;

    if hard_delete.unwrap_or(false) {
        SpeciesService::hard_delete(&*pool, id).await
    } else {
        SpeciesService::delete(&*pool, id).await
    }
}
