use sqlx::SqlitePool;
use crate::models::{Species, CreateSpeciesInput, UpdateSpeciesInput};

pub struct SpeciesService;

impl SpeciesService {
    /// Get all species (optionally filtered by active status)
    pub async fn get_all(pool: &SqlitePool, active_only: bool) -> Result<Vec<Species>, String> {
        let mut query = String::from(
            "SELECT id, name, active, display_order, created_at, updated_at FROM species WHERE 1=1"
        );

        if active_only {
            query.push_str(" AND active = 1");
        }

        query.push_str(" ORDER BY display_order ASC, name ASC");

        sqlx::query_as::<_, Species>(&query)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))
    }

    /// Get a single species by ID
    pub async fn get_by_id(pool: &SqlitePool, id: i64) -> Result<Species, String> {
        sqlx::query_as::<_, Species>(
            "SELECT id, name, active, display_order, created_at, updated_at FROM species WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch species: {}", e))?
        .ok_or_else(|| "Species not found".to_string())
    }

    /// Create a new species
    pub async fn create(pool: &SqlitePool, input: CreateSpeciesInput) -> Result<Species, String> {
        // Get the next display_order if not provided
        let display_order = if let Some(order) = input.display_order {
            order
        } else {
            sqlx::query_scalar::<_, i64>("SELECT COALESCE(MAX(display_order), 0) + 1 FROM species")
                .fetch_one(pool)
                .await
                .unwrap_or(1)
        };

        let result = sqlx::query(
            "INSERT INTO species (name, display_order) VALUES (?, ?)"
        )
        .bind(&input.name)
        .bind(display_order)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to create species: {}", e))?;

        let id = result.last_insert_rowid();
        Self::get_by_id(pool, id).await
    }

    /// Update a species
    pub async fn update(pool: &SqlitePool, id: i64, input: UpdateSpeciesInput) -> Result<Species, String> {
        // Check if species exists
        let existing = Self::get_by_id(pool, id).await?;

        // If nothing to update, return existing
        if input.name.is_none() && input.active.is_none() && input.display_order.is_none() {
            return Ok(existing);
        }

        // Build dynamic update query
        let mut query = sqlx::query(
            r#"
            UPDATE species
            SET name = CASE WHEN ? IS NOT NULL THEN ? ELSE name END,
                active = CASE WHEN ? IS NOT NULL THEN ? ELSE active END,
                display_order = CASE WHEN ? IS NOT NULL THEN ? ELSE display_order END
            WHERE id = ?
            "#
        );

        query = query
            .bind(&input.name)
            .bind(&input.name)
            .bind(&input.active)
            .bind(&input.active)
            .bind(&input.display_order)
            .bind(&input.display_order)
            .bind(id);

        query
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update species: {}", e))?;

        Self::get_by_id(pool, id).await
    }

    /// Delete a species (soft delete by setting active = false)
    pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), String> {
        sqlx::query("UPDATE species SET active = 0 WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete species: {}", e))?;

        Ok(())
    }

    /// Hard delete a species (only if no patients use it)
    pub async fn hard_delete(pool: &SqlitePool, id: i64) -> Result<(), String> {
        // Get species name first
        let species = Self::get_by_id(pool, id).await?;

        // Check if any patients use this species
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM patients WHERE species = ?"
        )
        .bind(&species.name)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to check species usage: {}", e))?;

        if count > 0 {
            return Err(format!("Cannot delete species: {} patients are using it", count));
        }

        sqlx::query("DELETE FROM species WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to delete species: {}", e))?;

        Ok(())
    }
}
