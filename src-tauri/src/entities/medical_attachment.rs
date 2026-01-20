//! MedicalAttachment entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "medical_attachments")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub medical_record_id: i64,
    pub file_id: String,
    pub original_name: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub uploaded_at: ChronoDateTimeUtc,
    pub device_type: Option<String>,
    pub device_name: Option<String>,
    pub connection_method: Option<String>,
    pub attachment_type: Option<String>,
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
