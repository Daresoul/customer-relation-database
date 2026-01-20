//! MedicalRecordHistory entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "medical_record_history")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub medical_record_id: i64,
    pub version: i32,
    pub changed_fields: Option<String>,
    pub old_values: Option<String>,
    pub new_values: Option<String>,
    pub changed_by: Option<String>,
    pub changed_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::medical_record::Entity",
        from = "Column::MedicalRecordId",
        to = "super::medical_record::Column::Id"
    )]
    MedicalRecord,
}

impl Related<super::medical_record::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::MedicalRecord.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
