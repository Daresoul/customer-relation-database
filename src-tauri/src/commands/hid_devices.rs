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
use std::collections::{HashMap, HashSet};
use tauri::State;

/// Helpers for resolving Bluetooth device friendly names. The Windows-only
/// part is `enumerate_paired_bt_names` (calls into Win32 BT API); the MAC
/// parser is pure string logic and lives at module scope so tests run on
/// any platform.
#[cfg(target_os = "windows")]
mod bt_names;
#[cfg(not(target_os = "windows"))]
mod bt_names {
    use std::collections::HashMap;
    /// Stub on non-Windows: BT enumeration unavailable, so the friendly-
    /// name column stays empty. The MAC parser is shared (see below) and
    /// works fine cross-platform.
    pub fn enumerate_paired_bt_names() -> HashMap<u64, String> {
        HashMap::new()
    }
    /// Cross-platform MAC parser. Same body as the Windows side — string
    /// manipulation only, no Win32 dependency. Duplicated here so the
    /// `bt_names::try_parse_bt_mac` import resolves on non-Windows
    /// without pulling the Win32-feature module in.
    pub fn try_parse_bt_mac(s: &str) -> Option<u64> {
        let stripped: String = s
            .chars()
            .filter(|c| !matches!(c, ':' | '-' | ' '))
            .collect();
        if stripped.len() != 12 || !stripped.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        u64::from_str_radix(&stripped, 16).ok()
    }
}

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
    // Real-world examples:
    //
    //   USB:        \\?\HID#VID_05AC&PID_022C&MI_00#7&abcd1234&0&0000#{...}
    //   BT Classic: \\?\HID#{00001124-0000-1000-8000-00805F9B34FB}_VID&05AC_PID&022C#8&...&0&0000#{...}
    //   BT LE:      \\?\HID#{00001812-0000-1000-8000-00805F9B34FB}_VID&xxxx_PID&yyyy#7&...
    //
    // The v0.5.5–v0.5.7 detector classified the BT shapes as USB because
    // their path also starts with `HID#` and we only checked for the legacy
    // `BTHENUM` / `BTHLEDEVICE` markers — which DO appear in some BT HID
    // paths but NOT for the more common HID-over-BT service routing that
    // Windows uses for cheap pairing-mode scanners (SYC Bluetooth, W91B
    // class). The reliable marker is the service UUID GUID embedded
    // directly in the path:
    //   {00001124-...} = HID over Bluetooth Classic (Service Class UUID)
    //   {00001812-...} = HID over Bluetooth LE
    let upper = path.to_ascii_uppercase();
    // Check the unambiguous service-UUID markers first. Any path
    // containing the BT-HID service UUID is BT regardless of what else
    // is in it.
    if upper.contains("{00001812-")
        || upper.contains("BTHLEDEVICE")
        || upper.contains("{LE}")
    {
        HidConnectionKind::BluetoothLe
    } else if upper.contains("{00001124-")
        || upper.contains("BTHENUM")
        || upper.contains("BTHHFENUM")
    {
        HidConnectionKind::Bluetooth
    } else if upper.contains("HID#VID_") {
        // USB path — has `VID_` immediately after `HID#`, with no GUID
        // sandwich. Order matters: BT paths above also start with `HID#`
        // but have a `{...}` GUID before VID, so they don't match
        // `HID#VID_`.
        HidConnectionKind::Usb
    } else if upper.starts_with("\\\\?\\HID#") {
        // Generic HID path that we couldn't classify by content. Fall
        // back to Unknown rather than assuming USB — better to surface
        // the ambiguity in the UI than mislabel a BT device.
        HidConnectionKind::Unknown
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
/// The `bt_name_by_mac` lets us look up the BT pairing friendly name
/// (e.g. "SYC Bluetooth") for BT-connected devices whose serial number
/// is a MAC address — keeps the lookup table-driven and testable.
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
    bt_name_by_mac: &HashMap<u64, String>,
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

    let connection = classify_connection(path);

    // For BT-connected devices, try to recover the OS-known friendly name
    // by parsing the serial number as a MAC address and looking it up in
    // the paired-devices map. Falls through to None when:
    //   - serial isn't a MAC (real Apple keyboards, USB serials, etc.)
    //   - the MAC isn't in the paired-devices map (BT is off, device not
    //     paired, or we're not on Windows)
    let bluetooth_name = match connection {
        HidConnectionKind::Bluetooth | HidConnectionKind::BluetoothLe => serial_trim
            .and_then(bt_names::try_parse_bt_mac)
            .and_then(|mac| bt_name_by_mac.get(&mac).cloned()),
        _ => None,
    };

    HidDeviceInfo {
        vendor_id: vid as i32,
        product_id: pid as i32,
        vendor_id_hex: format!("{:04X}", vid),
        product_id_hex: format!("{:04X}", pid),
        product_name: product_trim.map(str::to_string),
        manufacturer: manufacturer_trim.map(str::to_string),
        serial_number: serial_trim.map(str::to_string),
        vendor_name_from_db: vendor_name_from_db(vid),
        bluetooth_name,
        usage_page,
        usage,
        interface_number,
        connection,
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
    //    need (`managed_set`), so it moves cleanly. While we're on the
    //    blocking thread, also enumerate paired Bluetooth devices so we
    //    can map BT MACs (from hidapi serial numbers) to their pairing
    //    friendly names ("SYC Bluetooth", etc.).
    tokio::task::spawn_blocking(move || {
        let api = HidApi::new().map_err(|e| format!("hidapi init: {e}"))?;

        // Best-effort BT name lookup. Returns empty map on non-Windows or
        // if BT enumeration fails (BT radio off, no paired devices, etc.).
        // Either way the rest of the function proceeds — BT names just
        // stay None in those rows.
        let bt_names = bt_names::enumerate_paired_bt_names();

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
                &bt_names,
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
    fn classify_bluetooth_classic_path_via_service_uuid() {
        // The canonical BT Classic HID path — what Windows emits for any
        // device paired via the HID-over-BT profile (W91B, SYC Bluetooth,
        // most cheap BT scanners). Pre-v0.5.8 this misclassified as USB
        // because we only checked legacy BTHENUM markers.
        let path = r"\\?\HID#{00001124-0000-1000-8000-00805f9b34fb}_VID&05AC_PID&022C#8&12345678&0&0000#{xyz}";
        assert_eq!(classify_connection(path), HidConnectionKind::Bluetooth);
    }

    #[test]
    fn classify_bluetooth_le_path_via_service_uuid() {
        // BLE HID profile uses the {00001812-...} service UUID.
        let path = r"\\?\HID#{00001812-0000-1000-8000-00805f9b34fb}_VID&0046_PID&02BE#7&abcdef01&0&0001#{xyz}";
        assert_eq!(classify_connection(path), HidConnectionKind::BluetoothLe);
    }

    #[test]
    fn classify_bluetooth_via_bthenum_marker() {
        // Legacy BTHENUM marker without a service-UUID GUID. Some older
        // BT stacks emit this shape for HID-mode keyboards/scanners.
        // Kept as a regression fixture — even when we have the newer
        // service-UUID detector, BTHENUM-only paths must still classify
        // as Classic Bluetooth.
        let path = r"\\?\HID#BTHENUM_DEV_VID&05AC_PID&022C#xyz";
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
            &HashMap::new(),
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
            "", &HashSet::new(), &HashMap::new(),
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
            "", &HashSet::new(), &HashMap::new(),
        );
        assert_eq!(info.product_name, None);
        assert_eq!(info.manufacturer, None);
        assert_eq!(info.serial_number, None);
    }

    #[test]
    fn build_info_resolves_bt_name_for_bluetooth_device_with_mac_serial() {
        // Realistic SYC Bluetooth scenario: BT-Classic path (HID-over-BT
        // service UUID in path), spoofed Apple VID/PID, no product string,
        // serial = BT MAC address. We provide a BT name map; build_info
        // should pick up "SYC Bluetooth" as the friendly name.
        let mut bt_names = HashMap::new();
        bt_names.insert(0x3B75F6F16D6E, "SYC Bluetooth".to_string());

        let info = build_info(
            0x05AC, 0x022C,
            None, None, Some("3b75f6f16d6e"),
            0x01, 0x06, -1,
            r"\\?\HID#{00001124-0000-1000-8000-00805F9B34FB}_VID&05AC_PID&022C#xyz",
            &HashSet::new(), &bt_names,
        );
        assert_eq!(info.connection, HidConnectionKind::Bluetooth);
        assert_eq!(info.bluetooth_name.as_deref(), Some("SYC Bluetooth"));
    }

    #[test]
    fn build_info_ignores_bt_name_for_non_bluetooth_device() {
        // Sanity: even if the BT name map has an entry that happens to
        // match a USB device's "serial" string, we don't apply it — BT
        // names are only meaningful for BT-connected devices.
        let mut bt_names = HashMap::new();
        bt_names.insert(0x123456789ABC, "Should not apply".to_string());

        let info = build_info(
            0x046D, 0xC232,
            Some("USB Keyboard"), None, Some("123456789abc"),
            0x01, 0x06, -1,
            r"\\?\HID#VID_046D&PID_C232#xyz",
            &HashSet::new(), &bt_names,
        );
        assert_eq!(info.connection, HidConnectionKind::Usb);
        assert_eq!(info.bluetooth_name, None);
    }

    #[test]
    fn build_info_bt_device_without_paired_entry_has_no_bt_name() {
        // BT-connected device whose MAC isn't in the paired map (e.g.,
        // BT radio off when we enumerated, or device paired via a
        // different OS profile). Connection still detected correctly;
        // bluetooth_name stays None.
        let info = build_info(
            0x05AC, 0x022C,
            None, None, Some("3b75f6f16d6e"),
            0x01, 0x06, -1,
            r"\\?\HID#{00001124-0000-1000-8000-00805F9B34FB}_VID&05AC_PID&022C#xyz",
            &HashSet::new(), &HashMap::new(),
        );
        assert_eq!(info.connection, HidConnectionKind::Bluetooth);
        assert_eq!(info.bluetooth_name, None);
    }

    #[test]
    fn build_info_bt_device_with_non_mac_serial_has_no_bt_name() {
        // Some BT devices report a real product serial (e.g., a vendor's
        // internal serial number) rather than the MAC. We can't look up
        // a friendly name in that case — try_parse_bt_mac returns None.
        let mut bt_names = HashMap::new();
        bt_names.insert(0x3B75F6F16D6E, "SYC Bluetooth".to_string());

        let info = build_info(
            0x05AC, 0x022C,
            None, None, Some("FVFXY1ABCDEF"), // not a MAC — has G-Z chars
            0x01, 0x06, -1,
            r"\\?\HID#{00001124-0000-1000-8000-00805F9B34FB}_VID&05AC_PID&022C#xyz",
            &HashSet::new(), &bt_names,
        );
        assert_eq!(info.connection, HidConnectionKind::Bluetooth);
        assert_eq!(info.bluetooth_name, None);
    }
}
