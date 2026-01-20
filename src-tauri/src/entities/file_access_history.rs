//! FileAccessHistory entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "file_access_history")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub file_id: String,
    pub original_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub device_type: String,
    pub device_name: String,
    pub connection_method: Option<String>,
    pub received_at: ChronoDateTimeUtc,
    pub first_attached_to_record_id: Option<i64>,
    pub first_attached_at: Option<ChronoDateTimeUtc>,
    pub attachment_count: i32,
    pub last_accessed_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::medical_record::Entity",
        from = "Column::FirstAttachedToRecordId",
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
