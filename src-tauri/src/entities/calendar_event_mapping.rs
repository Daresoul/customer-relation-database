//! CalendarEventMapping entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "calendar_event_mappings")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub appointment_id: i64,
    pub google_event_id: String,
    pub last_synced_at: ChronoDateTimeUtc,
    pub sync_status: String,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::appointment::Entity",
        from = "Column::AppointmentId",
        to = "super::appointment::Column::Id"
    )]
    Appointment,
}

impl Related<super::appointment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Appointment.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
