use crate::entities::species::{self, Entity as SpeciesEntity};
use crate::entities::patient::{self, Entity as PatientEntity};
use crate::models::{Species, CreateSpeciesInput, UpdateSpeciesInput};
use chrono::Utc;
use sea_orm::*;

pub struct SpeciesService;

impl SpeciesService {
    /// Convert a SeaORM species model to the API Species model
    fn to_api_model(model: species::Model) -> Species {
        Species {
            id: model.id,
            name: model.name,
            active: model.active,
            display_order: model.display_order,
            created_at: model.created_at.and_utc(),
            updated_at: model.updated_at.and_utc(),
        }
    }

    /// Get all species (optionally filtered by active status)
    pub async fn get_all(db: &DatabaseConnection, active_only: bool) -> Result<Vec<Species>, String> {
        let mut query = SpeciesEntity::find();

        if active_only {
            query = query.filter(species::Column::Active.eq(true));
        }

        let species_list = query
            .order_by_asc(species::Column::DisplayOrder)
            .order_by_asc(species::Column::Name)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))?;

        Ok(species_list.into_iter().map(Self::to_api_model).collect())
    }

    /// Get a single species by ID
    pub async fn get_by_id(db: &DatabaseConnection, id: i64) -> Result<Species, String> {
        let species = SpeciesEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))?
            .ok_or_else(|| "Species not found".to_string())?;

        Ok(Self::to_api_model(species))
    }

    /// Create a new species
    pub async fn create(db: &DatabaseConnection, input: CreateSpeciesInput) -> Result<Species, String> {
        let now = Utc::now().naive_utc();

        // Get the next display_order if not provided
        let display_order = if let Some(order) = input.display_order {
            order
        } else {
            let highest_order_species = SpeciesEntity::find()
                .order_by_desc(species::Column::DisplayOrder)
                .one(db)
                .await
                .map_err(|e| format!("Failed to get max display order: {}", e))?;
            highest_order_species
                .map(|s| s.display_order + 1)
                .unwrap_or(1)
        };

        let new_species = species::ActiveModel {
            name: Set(input.name),
            active: Set(true),
            display_order: Set(display_order),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let result = SpeciesEntity::insert(new_species)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create species: {}", e))?;

        Self::get_by_id(db, result.last_insert_id).await
    }

    /// Update a species
    pub async fn update(db: &DatabaseConnection, id: i64, input: UpdateSpeciesInput) -> Result<Species, String> {
        let now = Utc::now().naive_utc();

        // Get existing species
        let existing = SpeciesEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))?
            .ok_or_else(|| "Species not found".to_string())?;

        // If nothing to update, return existing
        if input.name.is_none() && input.active.is_none() && input.display_order.is_none() {
            return Ok(Self::to_api_model(existing));
        }

        let mut species_model: species::ActiveModel = existing.into();

        if let Some(name) = input.name {
            species_model.name = Set(name);
        }
        if let Some(active) = input.active {
            species_model.active = Set(active);
        }
        if let Some(display_order) = input.display_order {
            species_model.display_order = Set(display_order);
        }
        species_model.updated_at = Set(now);

        species_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update species: {}", e))?;

        Self::get_by_id(db, id).await
    }

    /// Delete a species (soft delete by setting active = false)
    pub async fn delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        let now = Utc::now().naive_utc();

        let species = SpeciesEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))?
            .ok_or_else(|| format!("Species with id {} not found", id))?;

        let mut species_model: species::ActiveModel = species.into();
        species_model.active = Set(false);
        species_model.updated_at = Set(now);

        species_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to delete species: {}", e))?;

        Ok(())
    }

    /// Hard delete a species (only if no patients use it)
    pub async fn hard_delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        // Verify species exists
        let _species = SpeciesEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch species: {}", e))?
            .ok_or_else(|| format!("Species with id {} not found", id))?;

        // Check if any patients use this species
        let patient_count = PatientEntity::find()
            .filter(patient::Column::SpeciesId.eq(id))
            .count(db)
            .await
            .map_err(|e| format!("Failed to check species usage: {}", e))?;

        if patient_count > 0 {
            return Err(format!("Cannot delete species: {} patients are using it", patient_count));
        }

        // Hard delete if not in use
        SpeciesEntity::delete_by_id(id)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete species: {}", e))?;

        Ok(())
    }
}
