//! Household entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "households")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub household_name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub notes: Option<String>,
    pub created_at: ChronoDateTime,
    pub updated_at: ChronoDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::person::Entity")]
    People,
    #[sea_orm(has_many = "super::patient::Entity")]
    Patients,
}

impl Related<super::person::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::People.def()
    }
}

impl Related<super::patient::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Patients.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
