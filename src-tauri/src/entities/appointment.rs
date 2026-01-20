//! Appointment entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "appointments")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub patient_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub start_time: ChronoDateTimeUtc,
    pub end_time: ChronoDateTimeUtc,
    pub room_id: Option<i64>,
    pub status: String,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
    pub deleted_at: Option<ChronoDateTimeUtc>,
    pub created_by: String,
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
        belongs_to = "super::room::Entity",
        from = "Column::RoomId",
        to = "super::room::Column::Id"
    )]
    Room,
}

impl Related<super::patient::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Patient.def()
    }
}

impl Related<super::room::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Room.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
