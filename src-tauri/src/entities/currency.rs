//! Currency entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "currencies")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::medical_record::Entity")]
    MedicalRecords,
    #[sea_orm(has_many = "super::app_settings::Entity")]
    AppSettings,
}

impl Related<super::medical_record::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MedicalRecords.def()
    }
}

impl Related<super::app_settings::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::AppSettings.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
