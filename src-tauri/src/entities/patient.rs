//! Patient entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "patients")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub name: String,
    pub species_id: i64,
    pub breed_id: Option<i64>,
    pub gender: Option<String>,
    pub date_of_birth: Option<ChronoDate>,
    pub color: Option<String>,
    #[sea_orm(column_type = "Double")]
    pub weight: Option<f64>,
    pub microchip_id: Option<String>,
    pub medical_notes: Option<String>,
    pub is_active: bool,
    pub household_id: Option<i64>,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::species::Entity",
        from = "Column::SpeciesId",
        to = "super::species::Column::Id"
    )]
    Species,
    #[sea_orm(
        belongs_to = "super::breed::Entity",
        from = "Column::BreedId",
        to = "super::breed::Column::Id"
    )]
    Breed,
    #[sea_orm(
        belongs_to = "super::household::Entity",
        from = "Column::HouseholdId",
        to = "super::household::Column::Id"
    )]
    Household,
    #[sea_orm(has_many = "super::medical_record::Entity")]
    MedicalRecords,
    #[sea_orm(has_many = "super::appointment::Entity")]
    Appointments,
}

impl Related<super::species::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Species.def()
    }
}

impl Related<super::breed::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Breed.def()
    }
}

impl Related<super::household::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Household.def()
    }
}

impl Related<super::medical_record::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MedicalRecords.def()
    }
}

impl Related<super::appointment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Appointments.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
