//! SyncLog entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "sync_logs")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub sync_type: String,
    pub status: String,
    pub items_synced: i32,
    pub error_message: Option<String>,
    pub started_at: ChronoDateTimeUtc,
    pub completed_at: Option<ChronoDateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
