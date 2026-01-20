use tauri::State;
use crate::database::SeaOrmPool;
use crate::models::{Species, CreateSpeciesInput, UpdateSpeciesInput};
use crate::services::species::SpeciesService;

#[tauri::command]
pub async fn get_species(
    pool: State<'_, SeaOrmPool>,
    active_only: Option<bool>,
) -> Result<Vec<Species>, String> {
    SpeciesService::get_all(&pool, active_only.unwrap_or(true)).await
}

#[tauri::command]
pub async fn get_species_by_id(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<Species, String> {
    SpeciesService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_species(
    pool: State<'_, SeaOrmPool>,
    input: CreateSpeciesInput,
) -> Result<Species, String> {
    SpeciesService::create(&pool, input).await
}

#[tauri::command]
pub async fn update_species(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateSpeciesInput,
) -> Result<Species, String> {
    SpeciesService::update(&pool, id, input).await
}

#[tauri::command]
pub async fn delete_species(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    if hard_delete.unwrap_or(false) {
        SpeciesService::hard_delete(&pool, id).await
    } else {
        SpeciesService::delete(&pool, id).await
    }
}
