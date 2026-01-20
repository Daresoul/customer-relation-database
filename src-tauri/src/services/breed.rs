use crate::entities::breed::{self, Entity as BreedEntity};
use crate::entities::patient::{self, Entity as PatientEntity};
use crate::models::breed::{Breed, CreateBreedInput, UpdateBreedInput};
use chrono::Utc;
use sea_orm::*;

pub struct BreedService;

impl BreedService {
    /// Convert a SeaORM breed model to the API Breed model
    fn to_api_model(model: breed::Model) -> Breed {
        Breed {
            id: model.id,
            name: model.name,
            species_id: model.species_id,
            active: model.active,
            display_order: model.display_order,
            created_at: model.created_at.and_utc(),
            updated_at: model.updated_at.and_utc(),
        }
    }

    pub async fn get_all(db: &DatabaseConnection, species_id: Option<i64>, active_only: bool) -> Result<Vec<Breed>, String> {
        let mut query = BreedEntity::find();

        if let Some(sid) = species_id {
            query = query.filter(breed::Column::SpeciesId.eq(sid));
        }

        if active_only {
            query = query.filter(breed::Column::Active.eq(true));
        }

        let breeds = query
            .order_by_asc(breed::Column::DisplayOrder)
            .order_by_asc(breed::Column::Name)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch breeds: {}", e))?;

        Ok(breeds.into_iter().map(Self::to_api_model).collect())
    }

    pub async fn get_by_id(db: &DatabaseConnection, id: i64) -> Result<Breed, String> {
        let breed = BreedEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch breed: {}", e))?
            .ok_or_else(|| format!("Breed with id {} not found", id))?;

        Ok(Self::to_api_model(breed))
    }

    pub async fn create(db: &DatabaseConnection, input: CreateBreedInput) -> Result<Breed, String> {
        let now = Utc::now().naive_utc();

        // Get the next display_order by finding the breed with the highest order for this species
        let highest_order_breed = BreedEntity::find()
            .filter(breed::Column::SpeciesId.eq(input.species_id))
            .order_by_desc(breed::Column::DisplayOrder)
            .one(db)
            .await
            .map_err(|e| format!("Failed to get max display order: {}", e))?;

        let next_order = highest_order_breed
            .map(|b| b.display_order + 1)
            .unwrap_or(1);

        let new_breed = breed::ActiveModel {
            name: Set(input.name),
            species_id: Set(input.species_id),
            active: Set(true),
            display_order: Set(next_order),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let result = BreedEntity::insert(new_breed)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create breed: {}", e))?;

        Self::get_by_id(db, result.last_insert_id).await
    }

    pub async fn update(db: &DatabaseConnection, id: i64, input: UpdateBreedInput) -> Result<Breed, String> {
        let now = Utc::now().naive_utc();

        // Get the existing breed
        let existing = BreedEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch breed: {}", e))?
            .ok_or_else(|| format!("Breed with id {} not found", id))?;

        let mut breed_model: breed::ActiveModel = existing.into();

        if let Some(name) = input.name {
            breed_model.name = Set(name);
        }
        if let Some(species_id) = input.species_id {
            breed_model.species_id = Set(species_id);
        }
        if let Some(active) = input.active {
            breed_model.active = Set(active);
        }
        breed_model.updated_at = Set(now);

        breed_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update breed: {}", e))?;

        Self::get_by_id(db, id).await
    }

    pub async fn soft_delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        let now = Utc::now().naive_utc();

        let breed = BreedEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch breed: {}", e))?
            .ok_or_else(|| format!("Breed with id {} not found", id))?;

        let mut breed_model: breed::ActiveModel = breed.into();
        breed_model.active = Set(false);
        breed_model.updated_at = Set(now);

        breed_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to soft delete breed: {}", e))?;

        Ok(())
    }

    pub async fn hard_delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        // Verify breed exists
        let _breed = BreedEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch breed: {}", e))?
            .ok_or_else(|| format!("Breed with id {} not found", id))?;

        // Check patient usage using SeaORM
        let patient_count = PatientEntity::find()
            .filter(patient::Column::BreedId.eq(id))
            .count(db)
            .await
            .map_err(|e| format!("Failed to check breed usage: {}", e))?;

        if patient_count > 0 {
            // Soft delete instead
            return Self::soft_delete(db, id).await;
        }

        // Hard delete if not in use
        BreedEntity::delete_by_id(id)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete breed: {}", e))?;

        Ok(())
    }
}
