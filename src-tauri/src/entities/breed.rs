//! Breed entity
//!
//! Represents animal breeds belonging to a species (e.g., Labrador -> Dog)

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "breeds")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub name: String,
    pub species_id: i64,
    pub active: bool,
    pub display_order: i64,
    pub created_at: ChronoDateTime,
    pub updated_at: ChronoDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    /// A breed belongs to one species
    #[sea_orm(
        belongs_to = "super::species::Entity",
        from = "Column::SpeciesId",
        to = "super::species::Column::Id"
    )]
    Species,
}

impl Related<super::species::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Species.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
