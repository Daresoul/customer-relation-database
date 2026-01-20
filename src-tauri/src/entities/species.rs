//! Species entity
//!
//! Represents animal species (Dog, Cat, Bird, etc.)

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "species")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    #[sea_orm(unique)]
    pub name: String,
    pub active: bool,
    pub display_order: i64,
    pub created_at: ChronoDateTime,
    pub updated_at: ChronoDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    /// A species has many breeds
    #[sea_orm(has_many = "super::breed::Entity")]
    Breeds,
}

impl Related<super::breed::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Breeds.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
