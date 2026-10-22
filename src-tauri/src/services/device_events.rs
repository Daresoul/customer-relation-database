use serde::{Deserialize, Serialize};

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
