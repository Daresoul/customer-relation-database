//! UpdatePreferences entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "update_preferences")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub auto_check_enabled: bool,
    pub last_check_at: Option<ChronoDateTimeUtc>,
    pub last_update_version: Option<String>,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
