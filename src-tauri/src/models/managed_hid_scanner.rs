//! Managed HID scanner registration.
//!
//! Holds the user-configurable list of HID devices (by USB VID/PID) that the
//! Windows Raw Input capture should filter exclusively to our app. Devices on
//! this list have their input suppressed at the OS level for other windows
//! (via `RIDEV_NOLEGACY`), so a cheap microchip reader doesn't accidentally
//! type into a focused payment terminal or Word document.
//!
//! Anything *not* on this list keeps working as a normal HID keyboard — that's
//! how a vet's POS / barcode scanner can coexist with a managed microchip
//! reader on the same workstation.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ManagedHidScanner {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    /// USB Vendor ID (e.g. `5` for the W91B's HID-mode firmware identity).
    /// Stored as i32 because SQLite has no unsigned types; values are always 0..65535.
    #[ts(type = "number")]
    pub vendor_id: i32,
    /// USB Product ID. Same range/storage rationale as `vendor_id`.
    #[ts(type = "number")]
    pub product_id: i32,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct CreateManagedHidScannerInput {
    pub name: String,
    #[ts(type = "number")]
    pub vendor_id: i32,
    #[ts(type = "number")]
    pub product_id: i32,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateManagedHidScannerInput {
    pub name: Option<String>,
    pub enabled: Option<bool>,
}
