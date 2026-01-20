//! MedicalRecord entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "medical_records")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub patient_id: i64,
    pub record_type: String,
    pub name: String,
    pub procedure_name: Option<String>,
    pub description: String,
    #[sea_orm(column_type = "Double")]
    pub price: Option<f64>,
    pub currency_id: Option<i64>,
    pub is_archived: bool,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub version: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::patient::Entity",
        from = "Column::PatientId",
        to = "super::patient::Column::Id"
    )]
    Patient,
    #[sea_orm(
        belongs_to = "super::currency::Entity",
        from = "Column::CurrencyId",
        to = "super::currency::Column::Id"
    )]
    Currency,
    #[sea_orm(has_many = "super::medical_attachment::Entity")]
    Attachments,
    #[sea_orm(has_many = "super::medical_record_history::Entity")]
    History,
}

impl Related<super::patient::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Patient.def()
    }
}

impl Related<super::currency::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Currency.def()
    }
}

impl Related<super::medical_attachment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Attachments.def()
    }
}

impl Related<super::medical_record_history::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::History.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
