//! Snapshot of HID devices currently attached to the system.
//!
//! Produced by the `list_hid_devices` Tauri command for the "Detect Devices"
//! table in Settings → Managed Scanners. Users pick a row and click "Add" to
//! pre-fill the create-scanner form with the right VID/PID, eliminating the
//! Device-Manager-and-hex-to-decimal step.
//!
//! **Critical rule for any code that builds these:** never open the HID
//! device for I/O. The struct is built purely from metadata that hidapi
//! cached during enumeration (`HidD_GetAttributes`, `HidD_GetProductString`,
//! etc., which use brief shared-access opens). Opening a device handle for
//! reading reports — even non-exclusively — can disrupt other apps on
//! Windows and is suspected as a possible cause of v0.5.x keystroke
//! doubling. See `commands/hid_devices.rs` for the enforcement point.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What bus the device is connected over. Parsed from the OS device path.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub enum HidConnectionKind {
    Usb,
    /// Bluetooth Classic (HID-over-BT).
    Bluetooth,
    /// Bluetooth Low Energy.
    BluetoothLe,
    /// Path didn't match any known pattern — likely a virtual / driver-only device.
    Unknown,
}

/// One row in the detection table. Everything here is read-only metadata —
/// nothing in this struct ever requires opening the device for I/O.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct HidDeviceInfo {
    /// USB Vendor ID, 0..65535. Stored as i32 for SQLite/JSON parity with
    /// `ManagedHidScanner`.
    #[ts(type = "number")]
    pub vendor_id: i32,
    /// USB Product ID, 0..65535.
    #[ts(type = "number")]
    pub product_id: i32,
    /// "05AC" — uppercase, 4 chars, no `0x` prefix. UI prepends `0x` for display.
    pub vendor_id_hex: String,
    /// "022C" — same format as `vendor_id_hex`.
    pub product_id_hex: String,
    /// Product name as reported by the device's HID descriptor. For Bluetooth
    /// devices this is usually the BT friendly name. None if the device
    /// didn't expose one or the string was empty.
    pub product_name: Option<String>,
    /// Manufacturer name from the HID descriptor. None if missing.
    pub manufacturer: Option<String>,
    /// Serial number from the HID descriptor. Useful for distinguishing two
    /// physically identical devices.
    pub serial_number: Option<String>,
    /// Friendly vendor name from the embedded USB-IF database (`usb-ids`
    /// crate). Falls back when the device didn't ship a `manufacturer`
    /// string, which is very common for cheap microchip scanners.
    pub vendor_name_from_db: Option<String>,
    /// HID usage page (0x01 = Generic Desktop, 0x8C = POS Bar Code Reader, etc.).
    #[ts(type = "number")]
    pub usage_page: u16,
    /// HID usage within the page (e.g. 0x06 = Keyboard under Generic Desktop).
    #[ts(type = "number")]
    pub usage: u16,
    /// HID interface number on composite devices (e.g. a chip reader with a
    /// keyboard + vendor-defined interface will show two rows differing only
    /// here). -1 if not a composite device.
    #[ts(type = "number")]
    pub interface_number: i32,
    pub connection: HidConnectionKind,
    /// `true` if the (vendor_id, product_id) tuple is already in the
    /// managed-scanners table. UI uses this to show a green badge instead of
    /// the "Add" button.
    pub already_managed: bool,
    /// True iff `usage_page == 1 && usage == 6` (HID Keyboard). UI uses this
    /// to filter the table to keyboards-only by default since that's what
    /// 99% of microchip scanners present as.
    pub looks_like_keyboard: bool,
    /// True iff the device matches the heuristic used by `device_capture` to
    /// auto-open for scanning (POS usage page, known scanner VID, "scan" in
    /// product name, Honeywell / Zebra manufacturer).
    pub looks_like_scanner: bool,
}
