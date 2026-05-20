//! LineItemTemplate entity
//!
//! Represents reusable line item templates for medical records

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "line_item_templates")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    #[sea_orm(column_type = "Double")]
    pub default_price: f64,
    pub currency_id: i64,
    pub display_order: i64,
    pub is_active: bool,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::currency::Entity",
        from = "Column::CurrencyId",
        to = "super::currency::Column::Id"
    )]
    Currency,
    #[sea_orm(has_many = "super::medical_record_line_item::Entity")]
    MedicalRecordLineItems,
}

impl Related<super::currency::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Currency.def()
    }
}

impl Related<super::medical_record_line_item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MedicalRecordLineItems.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
