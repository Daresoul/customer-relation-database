use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use crate::models::dto::MaybeNull;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    ExigoEosVet,
    HealvetHvFia3000,
    MnchipPointcareChemistry,
    MnchipPcrAnalyzer,
}

impl DeviceType {
    pub fn to_db_string(&self) -> &str {
        match self {
            DeviceType::ExigoEosVet => "exigo_eos_vet",
            DeviceType::HealvetHvFia3000 => "healvet_hv_fia_3000",
            DeviceType::MnchipPointcareChemistry => "mnchip_pointcare_chemistry",
            DeviceType::MnchipPcrAnalyzer => "mnchip_pcr_analyzer",
        }
    }

    pub fn from_db_string(s: &str) -> Result<Self, String> {
        match s {
            "exigo_eos_vet" => Ok(DeviceType::ExigoEosVet),
            "healvet_hv_fia_3000" => Ok(DeviceType::HealvetHvFia3000),
            "mnchip_pointcare_chemistry" => Ok(DeviceType::MnchipPointcareChemistry),
            "mnchip_pcr_analyzer" => Ok(DeviceType::MnchipPcrAnalyzer),
            _ => Err(format!("Unknown device type: {}", s)),
        }
    }

    #[allow(dead_code)]
    pub fn display_name(&self) -> &str {
        match self {
            DeviceType::ExigoEosVet => "Exigo Eos Vet",
            DeviceType::HealvetHvFia3000 => "Healvet HV-FIA 3000",
            DeviceType::MnchipPointcareChemistry => "MNCHIP PointCare Chemistry",
            DeviceType::MnchipPcrAnalyzer => "MNCHIP PCR Analyzer",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
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

// Domain model
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DeviceIntegration {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    pub device_type: DeviceType,
    pub connection_type: ConnectionType,

    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,

    pub serial_port_name: Option<String>,
    #[ts(type = "number | null")]
    pub serial_baud_rate: Option<i64>,

    pub tcp_host: Option<String>,
    #[ts(type = "number | null")]
    pub tcp_port: Option<i64>,

    pub enabled: bool,
    #[ts(type = "string | null")]
    pub last_connected_at: Option<DateTime<Utc>>,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
    #[ts(type = "string | null")]
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct CreateDeviceIntegrationInput {
    pub name: String,
    pub device_type: DeviceType,
    pub connection_type: ConnectionType,

    pub watch_directory: Option<String>,
    pub file_pattern: Option<String>,

    pub serial_port_name: Option<String>,
    #[ts(type = "number | null")]
    pub serial_baud_rate: Option<i64>,

    pub tcp_host: Option<String>,
    #[ts(type = "number | null")]
    pub tcp_port: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct UpdateDeviceIntegrationInput {
    pub name: Option<String>,
    pub connection_type: Option<ConnectionType>,

    #[serde(default)]
    #[ts(type = "string | null")]
    pub watch_directory: MaybeNull<String>,
    pub file_pattern: Option<String>,

    #[serde(default)]
    #[ts(type = "string | null")]
    pub serial_port_name: MaybeNull<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub serial_baud_rate: MaybeNull<i64>,

    #[serde(default)]
    #[ts(type = "string | null")]
    pub tcp_host: MaybeNull<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub tcp_port: MaybeNull<i64>,

    pub enabled: Option<bool>,
}
