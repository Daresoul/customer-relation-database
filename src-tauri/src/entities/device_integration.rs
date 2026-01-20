//! DeviceIntegration entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "device_integrations")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub name: String,
    pub device_type: String,
    pub connection_type: String,
    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,
    pub serial_port_name: Option<String>,
    pub serial_baud_rate: Option<i64>,
    pub tcp_host: Option<String>,
    pub tcp_port: Option<i64>,
    pub enabled: bool,
    pub last_connected_at: Option<ChronoDateTimeUtc>,
    pub created_at: ChronoDateTimeUtc,
    pub updated_at: ChronoDateTimeUtc,
    pub deleted_at: Option<ChronoDateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
