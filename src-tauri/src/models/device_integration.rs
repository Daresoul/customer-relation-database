use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    ExigoEosVet,
    HealvetHvFia3000,
    MnchipPointcarePcrV1,
}

impl DeviceType {
    pub fn to_db_string(&self) -> &str {
        match self {
            DeviceType::ExigoEosVet => "exigo_eos_vet",
            DeviceType::HealvetHvFia3000 => "healvet_hv_fia_3000",
            DeviceType::MnchipPointcarePcrV1 => "mnchip_pointcare_pcr_v1",
        }
    }

    pub fn from_db_string(s: &str) -> Result<Self, String> {
        match s {
            "exigo_eos_vet" => Ok(DeviceType::ExigoEosVet),
            "healvet_hv_fia_3000" => Ok(DeviceType::HealvetHvFia3000),
            "mnchip_pointcare_pcr_v1" => Ok(DeviceType::MnchipPointcarePcrV1),
            _ => Err(format!("Unknown device type: {}", s)),
        }
    }

    #[allow(dead_code)]
    pub fn display_name(&self) -> &str {
        match self {
            DeviceType::ExigoEosVet => "Exigo Eos Vet",
            DeviceType::HealvetHvFia3000 => "Healvet HV-FIA 3000",
            DeviceType::MnchipPointcarePcrV1 => "MNCHIP PointCare PCR V1",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    FileWatch,
    SerialPort,
    Hl7Tcp,
}

impl ConnectionType {
    pub fn to_db_string(&self) -> &str {
        match self {
            ConnectionType::FileWatch => "file_watch",
            ConnectionType::SerialPort => "serial_port",
            ConnectionType::Hl7Tcp => "hl7_tcp",
        }
    }

    pub fn from_db_string(s: &str) -> Result<Self, String> {
        match s {
            "file_watch" => Ok(ConnectionType::FileWatch),
            "serial_port" => Ok(ConnectionType::SerialPort),
            "hl7_tcp" => Ok(ConnectionType::Hl7Tcp),
            _ => Err(format!("Unknown connection type: {}", s)),
        }
    }
}

// Database row representation
#[derive(Debug, Clone, FromRow)]
pub struct DeviceIntegrationRow {
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
    pub last_connected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

// Domain model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceIntegration {
    pub id: i64,
    pub name: String,
    pub device_type: DeviceType,
    pub connection_type: ConnectionType,

    // File watching settings
    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,

    // Serial port settings
    pub serial_port_name: Option<String>,
    pub serial_baud_rate: Option<i64>,

    // HL7 TCP settings
    pub tcp_host: Option<String>,
    pub tcp_port: Option<i64>,

    // Status and metadata
    pub enabled: bool,
    pub last_connected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl DeviceIntegration {
    pub fn from_row(row: DeviceIntegrationRow) -> Result<Self, String> {
        Ok(Self {
            id: row.id,
            name: row.name,
            device_type: DeviceType::from_db_string(&row.device_type)?,
            connection_type: ConnectionType::from_db_string(&row.connection_type)?,
            watch_directory: row.watch_directory,
            file_pattern: row.file_pattern,
            serial_port_name: row.serial_port_name,
            serial_baud_rate: row.serial_baud_rate,
            tcp_host: row.tcp_host,
            tcp_port: row.tcp_port,
            enabled: row.enabled,
            last_connected_at: row.last_connected_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            deleted_at: row.deleted_at,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDeviceIntegrationInput {
    pub name: String,
    pub device_type: DeviceType,
    pub connection_type: ConnectionType,

    // File watching settings
    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,

    // Serial port settings
    pub serial_port_name: Option<String>,
    pub serial_baud_rate: Option<i64>,

    // HL7 TCP settings
    pub tcp_host: Option<String>,
    pub tcp_port: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDeviceIntegrationInput {
    pub name: Option<String>,
    pub connection_type: Option<ConnectionType>,

    // File watching settings
    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,

    // Serial port settings
    pub serial_port_name: Option<String>,
    pub serial_baud_rate: Option<i64>,

    // HL7 TCP settings
    pub tcp_host: Option<String>,
    pub tcp_port: Option<i64>,

    pub enabled: Option<bool>,
}
