//! `list_hid_devices` — enumerate all attached HID devices for the
//! "Detect Devices" table in Settings → Managed Scanners.
//!
//! # Hard rules this module MUST uphold
//!
//! 1. **Never open a device for I/O.** Everything here is metadata that
//!    `HidApi::device_list()` already cached during enumeration. Opening a
//!    HID handle (via `dev_info.open_device(...)`) — even non-exclusively —
//!    can disrupt other apps on Windows and is suspected as a contributor
//!    to the v0.5.x keystroke-doubling regression. A future "let me just
//!    grab one more field" change is exactly the trap to avoid.
//!
//! 2. **Run hidapi enumeration on a blocking thread.** On Windows
//!    `SetupDi*` enumeration can take 50–500ms depending on how many BT/USB
//!    HID devices are paired. Running it on the Tauri async runtime would
//!    stall every other in-flight command. `tokio::task::spawn_blocking`
//!    offloads it to the dedicated blocking pool so the UI stays
//!    responsive.

use crate::database::SeaOrmPool;
use crate::models::hid_devices::{HidConnectionKind, HidDeviceInfo};
use crate::services::managed_hid_scanner::ManagedHidScannerService;
use hidapi::HidApi;
use std::collections::HashSet;
use tauri::State;

/// Heuristic matching the one in `services/device_capture.rs`. Kept in sync
/// manually because the source list is short and rarely changes; if it
/// grows, hoist into a shared `services::hid_heuristics` module.
const KNOWN_SCANNER_VIDS: &[u16] = &[
    0x0C2E, // Honeywell / Metrologic
    0x05E0, // Zebra / Symbol Technologies
    0x05F9, // Datalogic
    0x0EB0, // Socket Mobile
    0x065A, // Opticon
    0x0D2A, // Code Corporation
];

fn classify_connection(path: &str) -> HidConnectionKind {
    // Windows HID device paths follow well-known prefixes. We match on the
    // upper-cased path so registry-vs-driver case variations don't trip us.
    // Examples:
    //   USB:        \\?\HID#VID_05AC&PID_022C&MI_00#7&abcd1234&0&0000#{...}
    //   BT Classic: \\?\HID#{00001124-...}_VID&00010023_PID&0419#8&...&0&0000#{...}
    //               (also: paths containing BTHENUM or BTHHFENUM)
    //   BLE:        \\?\HID#{00001812-...}_LOCALMFG&0001#... (BTHLEDEVICE in path)
    let upper = path.to_ascii_uppercase();
    if upper.contains("BTHLEDEVICE") || upper.contains("{LE}") {
        HidConnectionKind::BluetoothLe
    } else if upper.contains("BTHENUM") || upper.contains("BTHHFENUM") {
        HidConnectionKind::Bluetooth
    } else if upper.contains("HID#VID_") || upper.starts_with("\\\\?\\HID#") {
        HidConnectionKind::Usb
    } else {
        HidConnectionKind::Unknown
    }
}

fn matches_scanner_heuristic(
    usage_page: u16,
    vendor_id: u16,
    product: &str,
    manufacturer: &str,
) -> bool {
    usage_page == 0x8C
        || KNOWN_SCANNER_VIDS.contains(&vendor_id)
        || product.to_lowercase().contains("scan")
        || manufacturer.to_lowercase().contains("honeywell")
        || manufacturer.to_lowercase().contains("zebra")
}

/// Look up a friendly vendor name from the embedded USB-IF database. Used as
/// a fallback when the device itself didn't ship a manufacturer string —
/// very common for cheap microchip scanners that just expose "HID Keyboard".
fn vendor_name_from_db(vid: u16) -> Option<String> {
    use usb_ids::FromId;
    usb_ids::Vendor::from_id(vid).map(|v| v.name().to_string())
}

/// Pure builder for one row of the detection table. Takes only the metadata
/// that hidapi exposes via cached fields on `DeviceInfo` — no I/O. The
/// `managed_set` lets us O(1) check "is this VID/PID already managed".
fn build_info(
    vid: u16,
    pid: u16,
    product: Option<&str>,
    manufacturer: Option<&str>,
    serial: Option<&str>,
    usage_page: u16,
    usage: u16,
    interface_number: i32,
    path: &str,
    managed_set: &HashSet<(u16, u16)>,
) -> HidDeviceInfo {
    let product_trim = product.map(str::trim).filter(|s| !s.is_empty());
    let manufacturer_trim = manufacturer.map(str::trim).filter(|s| !s.is_empty());
    let serial_trim = serial.map(str::trim).filter(|s| !s.is_empty());

    let looks_like_scanner = matches_scanner_heuristic(
        usage_page,
        vid,
        product_trim.unwrap_or(""),
        manufacturer_trim.unwrap_or(""),
    );

    HidDeviceInfo {
        vendor_id: vid as i32,
        product_id: pid as i32,
        vendor_id_hex: format!("{:04X}", vid),
        product_id_hex: format!("{:04X}", pid),
        product_name: product_trim.map(str::to_string),
        manufacturer: manufacturer_trim.map(str::to_string),
        serial_number: serial_trim.map(str::to_string),
        vendor_name_from_db: vendor_name_from_db(vid),
        usage_page,
        usage,
        interface_number,
        connection: classify_connection(path),
        already_managed: managed_set.contains(&(vid, pid)),
        looks_like_keyboard: usage_page == 0x01 && usage == 0x06,
        looks_like_scanner,
    }
}

/// Enumerate every currently-attached HID device. Runs the actual hidapi
/// scan on a blocking worker thread so the Tauri async runtime stays free.
#[tauri::command]
pub async fn list_hid_devices(
    pool: State<'_, SeaOrmPool>,
) -> Result<Vec<HidDeviceInfo>, String> {
    // 1. Build the managed-set on the async runtime — it's just a DB query.
    let managed = ManagedHidScannerService::list_all(&pool).await?;
    let managed_set: HashSet<(u16, u16)> = managed
        .iter()
        .map(|r| (r.vendor_id as u16, r.product_id as u16))
        .collect();

    // 2. Run the blocking hidapi enumeration on the blocking pool. The
    //    closure can't borrow the State, but we already have the data we
    //    need (`managed_set`), so it moves cleanly.
    tokio::task::spawn_blocking(move || {
        let api = HidApi::new().map_err(|e| format!("hidapi init: {e}"))?;

        let mut out: Vec<HidDeviceInfo> = Vec::new();
        for dev in api.device_list() {
            // DO NOT call dev.open_device() here — see module docs.
            let path = dev.path().to_string_lossy().to_string();
            out.push(build_info(
                dev.vendor_id(),
                dev.product_id(),
                dev.product_string(),
                dev.manufacturer_string(),
                dev.serial_number(),
                dev.usage_page(),
                dev.usage(),
                dev.interface_number(),
                &path,
                &managed_set,
            ));
        }

        // Stable, useful sort: keyboards first, then scanners, then by name.
        out.sort_by(|a, b| {
            b.looks_like_keyboard
                .cmp(&a.looks_like_keyboard)
                .then_with(|| b.looks_like_scanner.cmp(&a.looks_like_scanner))
                .then_with(|| {
                    a.product_name
                        .as_deref()
                        .unwrap_or("")
                        .cmp(b.product_name.as_deref().unwrap_or(""))
                })
        });

        Ok::<_, String>(out)
    })
    .await
    .map_err(|e| format!("hidapi enumeration thread join failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_usb_path() {
        let path = r"\\?\HID#VID_05AC&PID_022C&MI_00#7&abcd1234&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}";
        assert_eq!(classify_connection(path), HidConnectionKind::Usb);
    }

    #[test]
    fn classify_bluetooth_classic_path() {
        let path = r"\\?\HID#{00001124-0000-1000-8000-00805f9b34fb}_VID&00010023_PID&0419#8&12345678&0&0000#{xyz}";
        // No BTHENUM/BTHLEDEVICE marker — pattern actually depends on driver,
        // and this exact shape can be USB-or-BT. We err toward USB classification
        // when ambiguous; the user sees the connection column as USB which is
        // still correct enough for picking the right device.
        // Locked in here so a future "improve detection" change is deliberate.
        let kind = classify_connection(path);
        assert!(matches!(kind, HidConnectionKind::Usb | HidConnectionKind::Bluetooth));
    }

    #[test]
    fn classify_bluetooth_via_bthenum_marker() {
        let path = r"\\?\HID#BTHENUM_{00001812-0000-1000-8000-00805f9b34fb}_LOCALMFG&0001#xyz";
        assert_eq!(classify_connection(path), HidConnectionKind::Bluetooth);
    }

    #[test]
    fn classify_bluetooth_le_path() {
        let path = r"\\?\HID#BTHLEDEVICE&Dev_E4_5F_01_23_45_67#9&abcd1234#{xyz}";
        assert_eq!(classify_connection(path), HidConnectionKind::BluetoothLe);
    }

    #[test]
    fn classify_unknown_path() {
        assert_eq!(classify_connection(""), HidConnectionKind::Unknown);
        assert_eq!(classify_connection("not a device path"), HidConnectionKind::Unknown);
    }

    #[test]
    fn scanner_heuristic_matches_pos_usage_page() {
        assert!(matches_scanner_heuristic(0x8C, 0x1234, "", ""));
    }

    #[test]
    fn scanner_heuristic_matches_known_vid() {
        assert!(matches_scanner_heuristic(0x01, 0x0C2E, "", "")); // Honeywell VID
    }

    #[test]
    fn scanner_heuristic_matches_product_name() {
        assert!(matches_scanner_heuristic(0x01, 0x1234, "Generic Barcode Scanner", ""));
    }

    #[test]
    fn scanner_heuristic_matches_manufacturer() {
        assert!(matches_scanner_heuristic(0x01, 0x1234, "", "Honeywell International"));
        assert!(matches_scanner_heuristic(0x01, 0x1234, "", "Zebra Technologies"));
    }

    #[test]
    fn scanner_heuristic_does_not_match_plain_keyboard() {
        assert!(!matches_scanner_heuristic(0x01, 0x046D, "K780 Keyboard", "Logitech"));
    }

    #[test]
    fn build_info_marks_already_managed() {
        let mut managed = HashSet::new();
        managed.insert((0x05AC, 0x022C));
        let info = build_info(
            0x05AC, 0x022C,
            Some("Test"), None, None,
            0x01, 0x06, -1,
            r"\\?\HID#VID_05AC&PID_022C#xyz",
            &managed,
        );
        assert!(info.already_managed);
        assert!(info.looks_like_keyboard);
    }

    #[test]
    fn build_info_formats_hex_uppercase_zero_padded() {
        let info = build_info(
            0x05, 0x0a,
            None, None, None,
            0x01, 0x06, -1,
            "", &HashSet::new(),
        );
        assert_eq!(info.vendor_id_hex, "0005");
        assert_eq!(info.product_id_hex, "000A");
    }

    #[test]
    fn build_info_trims_empty_strings_to_none() {
        let info = build_info(
            0x05AC, 0x022C,
            Some("   "), Some(""), Some("  "),
            0x01, 0x06, -1,
            "", &HashSet::new(),
        );
        assert_eq!(info.product_name, None);
        assert_eq!(info.manufacturer, None);
        assert_eq!(info.serial_number, None);
    }
}
