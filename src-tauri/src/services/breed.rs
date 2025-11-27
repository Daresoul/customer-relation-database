use crate::models::breed::{Breed, CreateBreedInput, UpdateBreedInput};
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn get_all(pool: &SqlitePool, species_id: Option<i64>, active_only: bool) -> Result<Vec<Breed>, String> {
    let mut query_builder = sqlx::QueryBuilder::new("SELECT * FROM breeds WHERE 1=1");

    if let Some(sid) = species_id {
        query_builder.push(" AND species_id = ");
        query_builder.push_bind(sid);
    }

    if active_only {
        query_builder.push(" AND active = 1");
    }

    query_builder.push(" ORDER BY display_order ASC, name ASC");

    query_builder
        .build_query_as::<Breed>()
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch breeds: {}", e))
}

pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Breed, String> {
    sqlx::query_as::<_, Breed>("SELECT * FROM breeds WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to fetch breed: {}", e))
}

pub async fn create(pool: &SqlitePool, input: CreateBreedInput) -> Result<Breed, String> {
    let now = Utc::now();

    // Get the next display_order for this species
    let max_order: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(display_order) FROM breeds WHERE species_id = ?"
    )
    .bind(input.species_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to get max display order: {}", e))?;

    let next_order = max_order.unwrap_or(0) + 1;

    let result = sqlx::query(
        "INSERT INTO breeds (name, species_id, active, display_order, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?)"
    )
    .bind(&input.name)
    .bind(input.species_id)
    .bind(next_order)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create breed: {}", e))?;

    get_by_id(pool, result.last_insert_rowid()).await
}

pub async fn update(pool: &SqlitePool, id: i64, input: UpdateBreedInput) -> Result<Breed, String> {
    let now = Utc::now();

    let breed = get_by_id(pool, id).await?;

    let name = input.name.unwrap_or(breed.name);
    let species_id = input.species_id.unwrap_or(breed.species_id);
    let active = input.active.unwrap_or(breed.active);

    sqlx::query(
        "UPDATE breeds SET name = ?, species_id = ?, active = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&name)
    .bind(species_id)
    .bind(active)
    .bind(now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update breed: {}", e))?;

    get_by_id(pool, id).await
}

pub async fn soft_delete(pool: &SqlitePool, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE breeds SET active = 0, updated_at = ? WHERE id = ?")
        .bind(Utc::now())
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to soft delete breed: {}", e))?;

    Ok(())
}

pub async fn hard_delete(pool: &SqlitePool, id: i64) -> Result<(), String> {
    // Check if any patients are using this breed
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM patients WHERE breed = (SELECT name FROM breeds WHERE id = ?)"
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to check breed usage: {}", e))?;

    if count > 0 {
        // Soft delete instead
        return soft_delete(pool, id).await;
    }

    // Hard delete if not in use
    sqlx::query("DELETE FROM breeds WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to delete breed: {}", e))?;

    Ok(())
}
