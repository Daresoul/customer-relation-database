//! MedicalRecordLineItem entity
//!
//! Represents line items attached to a specific medical record

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "medical_record_line_items")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub medical_record_id: i64,
    pub template_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    #[sea_orm(column_type = "Double")]
    pub unit_price: f64,
    pub currency_id: i64,
    pub quantity: i32,
    pub created_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::medical_record::Entity",
        from = "Column::MedicalRecordId",
        to = "super::medical_record::Column::Id"
    )]
    MedicalRecord,
    #[sea_orm(
        belongs_to = "super::line_item_template::Entity",
        from = "Column::TemplateId",
        to = "super::line_item_template::Column::Id"
    )]
    Template,
    #[sea_orm(
        belongs_to = "super::currency::Entity",
        from = "Column::CurrencyId",
        to = "super::currency::Column::Id"
    )]
    Currency,
}

impl Related<super::medical_record::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MedicalRecord.def()
    }
}

impl Related<super::line_item_template::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Template.def()
    }
}

impl Related<super::currency::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Currency.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
