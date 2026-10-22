use serde::{Deserialize, Serialize};
use sea_orm::DatabaseConnection;
use std::path::Path;
use crate::services::device_parser::DeviceData;

/// Why a device can't be reached. The frontend turns each kind into a
/// translated "what happened / what to do" pair; the raw OS text stays in
/// `last_error` for the Details tooltip.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceErrorKind {
    PortMissing,
    PortBusy,
    AccessDenied,
    Disconnected,
    FolderMissing,
    FolderLost,
    NotAFolder,
    Unknown,
}

/// Something went wrong with data a device sent. Sent to the frontend as the
/// `device-event` Tauri event and shown as a toast.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceEventKind {
    ParseFailed,
    EmptyResult,
    CutOff,
    SaveFailed,
    FolderLost,
}

impl DeviceEventKind {
    pub fn message_key(self) -> &'static str {
        todo!()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEvent {
    pub integration_id: Option<i64>,
    pub device_name: String,
    pub device_type: String,
    pub kind: DeviceEventKind,
    pub message_key: String,
    pub detail: Option<String>,
    pub file_name: Option<String>,
    pub file_id: Option<String>,
    pub at: String,
}

pub fn classify_parse_error(_error: &str) -> DeviceEventKind {
    todo!()
}

/// Where delivered results and events go. The app sends them to the webview;
/// tests record them.
pub trait DeviceSink: Send + Sync {
    fn result_ready(&self, payload: &serde_json::Value, data: &DeviceData);
    fn device_event(&self, event: &DeviceEvent);
    fn result_recorded(&self, integration_id: i64);
}

pub struct ResultSource {
    pub integration_id: i64,
    /// Passed to the parser as the device name (the port for serial devices).
    pub device_name: String,
    pub device_type: String,
    pub connection_method: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub file_id: Option<String>,
    pub parsed: bool,
}

pub async fn deliver_result(
    _db: &DatabaseConnection,
    _storage_dir: &Path,
    _sink: &dyn DeviceSink,
    _source: &ResultSource,
    _raw_name: &str,
    _raw: &[u8],
) -> Delivery {
    todo!()
}

pub async fn report_cut_off(
    _db: &DatabaseConnection,
    _storage_dir: &Path,
    _sink: &dyn DeviceSink,
    _source: &ResultSource,
    _partial: &[u8],
) -> Option<String> {
    todo!()
}
