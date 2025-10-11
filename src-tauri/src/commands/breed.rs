use crate::models::breed::{Breed, BreedFilter, CreateBreedInput, UpdateBreedInput};
use crate::services::breed;
use crate::database::connection::DatabasePool;
use tauri::State;

#[tauri::command]
pub async fn get_breeds(
    pool: State<'_, DatabasePool>,
    filter: BreedFilter,
) -> Result<Vec<Breed>, String> {
    println!("🔍 Backend get_breeds received filter: species_id={:?}, active_only={:?}",
             filter.species_id, filter.active_only);

    let pool = pool.lock().await;
    let active_only = filter.active_only.unwrap_or(true);
    let result = breed::get_all(&*pool, filter.species_id, active_only).await;
    println!("🔍 Backend returning {} breeds", result.as_ref().map(|v| v.len()).unwrap_or(0));
    result
}

#[tauri::command]
pub async fn get_breed(pool: State<'_, DatabasePool>, id: i64) -> Result<Breed, String> {
    let pool = pool.lock().await;
    breed::get_by_id(&*pool, id).await
}

#[tauri::command]
pub async fn create_breed(
    pool: State<'_, DatabasePool>,
    data: CreateBreedInput,
) -> Result<Breed, String> {
    let pool = pool.lock().await;
    breed::create(&*pool, data).await
}

#[tauri::command]
pub async fn update_breed(
    pool: State<'_, DatabasePool>,
    id: i64,
    data: UpdateBreedInput,
) -> Result<Breed, String> {
    let pool = pool.lock().await;
    breed::update(&*pool, id, data).await
}

#[tauri::command]
pub async fn delete_breed(
    pool: State<'_, DatabasePool>,
    id: i64,
    hard_delete: Option<bool>,
) -> Result<(), String> {
    let pool = pool.lock().await;

    if hard_delete.unwrap_or(false) {
        breed::hard_delete(&*pool, id).await
    } else {
        breed::soft_delete(&*pool, id).await
    }
}
