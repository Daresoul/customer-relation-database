use crate::models::breed::{Breed, BreedFilter, CreateBreedInput, UpdateBreedInput};
use crate::services::breed::BreedService;
use crate::database::SeaOrmPool;
use tauri::State;

#[tauri::command]
pub async fn get_breeds(
    pool: State<'_, SeaOrmPool>,
    filter: BreedFilter,
) -> Result<Vec<Breed>, String> {
    let active_only = filter.active_only.unwrap_or(true);
    BreedService::get_all(&pool, filter.species_id, active_only).await
}

#[tauri::command]
pub async fn get_breed(pool: State<'_, SeaOrmPool>, id: i64) -> Result<Breed, String> {
    BreedService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_breed(
    pool: State<'_, SeaOrmPool>,
    data: CreateBreedInput,
) -> Result<Breed, String> {
    BreedService::create(&pool, data).await
}

#[tauri::command]
pub async fn update_breed(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    data: UpdateBreedInput,
) -> Result<Breed, String> {
    BreedService::update(&pool, id, data).await
}

#[tauri::command]
pub async fn delete_breed(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    if hard_delete.unwrap_or(false) {
        BreedService::hard_delete(&pool, id).await
    } else {
        BreedService::soft_delete(&pool, id).await
    }
}
