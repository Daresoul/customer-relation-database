//! RecordTemplate entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "record_templates")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub record_type: String,
    pub title: String,
    pub description: String,
    #[sea_orm(column_type = "Double")]
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
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
}

impl Related<super::currency::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Currency.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
