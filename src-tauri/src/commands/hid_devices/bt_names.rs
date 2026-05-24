//! Resolve Bluetooth device friendly names by enumerating Windows' paired
//! Bluetooth devices and matching by MAC address.
//!
//! Why this exists: hidapi exposes only the HID descriptor's manufacturer
//! and product strings, which for cheap BT scanners (W91B / SYC class) are
//! often empty or a generic vendor spoof. The "friendly name" the user
//! actually sees in Settings → Bluetooth & devices (e.g. "SYC Bluetooth")
//! lives in the Windows Bluetooth subsystem, not in the HID stack. We have
//! to ask the BT stack directly.
//!
//! API used: Win32 `BluetoothFindFirstDevice` / `BluetoothFindNextDevice`
//! from `bluetoothapis.dll`. This is the same API Settings uses internally
//! and is purely read-only — it walks the OS's registry of paired devices,
//! never touches the HID descriptor, never opens a device handle, can't
//! disrupt input. Safe to call from anywhere (we still call from a blocking
//! thread to avoid stalling the async runtime, since BT enumeration on a
//! system with many paired devices can take 50-200ms).
//!
//! Caveats and design choices:
//!
//! - **Authenticated devices only.** The search params set `fReturnAuthenticated
//!   = true` and the others false. Unauthenticated discovery would trigger
//!   active BT scanning which slows down the call by seconds. We only care
//!   about devices the user has already paired anyway.
//!
//! - **No retries / cache.** Enumeration is fast enough (<200ms typical) that
//!   calling it once per `list_hid_devices` invocation is fine. If that
//!   becomes hot, hoist into a `OnceLock<HashMap<u64, String>>` with a
//!   `refresh_bt_names()` Tauri command for explicit invalidation.

#![cfg(target_os = "windows")]

use std::collections::HashMap;

use windows::Win32::Devices::Bluetooth::{
    BluetoothFindDeviceClose, BluetoothFindFirstDevice, BluetoothFindNextDevice,
    BLUETOOTH_ADDRESS, BLUETOOTH_DEVICE_INFO, BLUETOOTH_DEVICE_SEARCH_PARAMS,
    BLUETOOTH_MAX_NAME_SIZE,
};

/// Build a map of BT MAC → friendly name covering every authenticated /
/// remembered device the Windows BT stack knows about.
///
/// Returns an empty map if BT is unavailable or enumeration fails — the
/// caller should treat missing entries as "no friendly name known", not
/// as an error. There's nothing actionable for the user if BT is off.
pub fn enumerate_paired_bt_names() -> HashMap<u64, String> {
    let mut result = HashMap::new();

    // Search parameters: only return devices we already know about.
    // - fReturnAuthenticated: paired devices the user has explicitly trusted
    // - fReturnRemembered:    seen-before devices saved in the registry
    // - fReturnConnected:     currently-connected
    // - fIssueInquiry = FALSE: do not trigger active radio scan (would
    //                          add 5+ seconds per call)
    // hRadio = 0 means "any radio" — works on systems with multiple BT
    // adapters.
    let params = BLUETOOTH_DEVICE_SEARCH_PARAMS {
        dwSize: std::mem::size_of::<BLUETOOTH_DEVICE_SEARCH_PARAMS>() as u32,
        fReturnAuthenticated: true.into(),
        fReturnRemembered: true.into(),
        fReturnUnknown: false.into(),
        fReturnConnected: true.into(),
        fIssueInquiry: false.into(),
        cTimeoutMultiplier: 0,
        hRadio: Default::default(),
    };

    let mut info = BLUETOOTH_DEVICE_INFO {
        dwSize: std::mem::size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
        ..Default::default()
    };

    // SAFETY: BluetoothFindFirstDevice returns either a valid find handle or
    // an error wrapped in the Result. On Ok we own the handle and must
    // BluetoothFindDeviceClose it before returning. On Err we have nothing
    // to clean up.
    let find_handle = unsafe { BluetoothFindFirstDevice(&params, &mut info) };
    let find_handle = match find_handle {
        Ok(h) if h.0 != 0 && h.0 != -1 => h,
        _ => {
            log::debug!("bt_names: BluetoothFindFirstDevice returned no devices");
            return result;
        }
    };

    // First device is already in `info`. Record it and iterate.
    if let Some((mac, name)) = info_to_entry(&info) {
        result.insert(mac, name);
    }

    loop {
        // SAFETY: find_handle is valid for the duration of this loop;
        // BluetoothFindNextDevice fills `info` on success.
        match unsafe { BluetoothFindNextDevice(find_handle, &mut info) } {
            Ok(_) => {
                if let Some((mac, name)) = info_to_entry(&info) {
                    result.insert(mac, name);
                }
            }
            // ERROR_NO_MORE_ITEMS = 259 (0x103). Anything else is unusual
            // but not worth panicking over — just stop and return what
            // we have.
            Err(_) => break,
        }
    }

    // SAFETY: we own this handle from the FindFirst call above.
    let _ = unsafe { BluetoothFindDeviceClose(find_handle) };

    log::debug!("bt_names: enumerated {} paired Bluetooth devices", result.len());
    result
}

/// Convert a `BLUETOOTH_DEVICE_INFO` into a (MAC, name) pair. Returns
/// `None` if the name is empty (devices that haven't been given a friendly
/// name — rare for paired devices but harmless to skip).
fn info_to_entry(info: &BLUETOOTH_DEVICE_INFO) -> Option<(u64, String)> {
    let mac = bluetooth_address_to_u64(&info.Address);
    let name = decode_u16_name(&info.szName)?;
    if name.is_empty() {
        None
    } else {
        Some((mac, name))
    }
}

/// Convert a 6-byte BT address (stored little-endian in `BLUETOOTH_ADDRESS`)
/// to a u64 for hashing / comparison.
///
/// The `BLUETOOTH_ADDRESS` union has `.Anonymous.ullLong` which is already
/// a u64, but that field is unsafe to access through the windows-rs union
/// wrapper. We rebuild the value from the byte array instead — same result,
/// simpler code.
fn bluetooth_address_to_u64(addr: &BLUETOOTH_ADDRESS) -> u64 {
    // SAFETY: BLUETOOTH_ADDRESS is a union of `ullLong: u64` and
    // `rgBytes: [u8; 6]`. Reading the u64 directly is well-defined since
    // u64 is exactly 8 bytes and the rgBytes layout is little-endian.
    unsafe { addr.Anonymous.ullLong }
}

/// Decode the device's name from a u16 buffer (`szName: [u16; 248]`),
/// trimming trailing NULs.
fn decode_u16_name(buf: &[u16; BLUETOOTH_MAX_NAME_SIZE as usize]) -> Option<String> {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let slice = &buf[..end];
    Some(String::from_utf16_lossy(slice).trim().to_string())
}

/// Try to parse a 12-hex-char serial number string (or a colon-separated
/// MAC) into a u64. Used to recover BT addresses from `hidapi`'s
/// `serial_number()` field, which on Windows is typically the device's
/// BT MAC for paired devices.
///
/// Examples that parse:
///   - "3b75f6f16d6e" -> 0x3B75F6F16D6E
///   - "3B:75:F6:F1:6D:6E" -> 0x3B75F6F16D6E
///   - "3b-75-f6-f1-6d-6e" -> 0x3B75F6F16D6E
///
/// Examples that don't:
///   - Apple-style "FVFXY1ABCDEF" (real Apple serial) -> None (not hex)
///   - Empty / None
pub fn try_parse_bt_mac(s: &str) -> Option<u64> {
    // Strip common MAC separators in one pass; require the remaining string
    // to be exactly 12 ASCII hex chars.
    let stripped: String = s
        .chars()
        .filter(|c| !matches!(c, ':' | '-' | ' '))
        .collect();
    if stripped.len() != 12 || !stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(&stripped, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_compact_mac() {
        assert_eq!(try_parse_bt_mac("3b75f6f16d6e"), Some(0x3B75F6F16D6E));
    }

    #[test]
    fn parses_colon_mac() {
        assert_eq!(try_parse_bt_mac("3B:75:F6:F1:6D:6E"), Some(0x3B75F6F16D6E));
    }

    #[test]
    fn parses_dash_mac() {
        assert_eq!(try_parse_bt_mac("3b-75-f6-f1-6d-6e"), Some(0x3B75F6F16D6E));
    }

    #[test]
    fn rejects_apple_alpha_serial() {
        // Real Apple keyboards use FVFXY1ABCDEF-style serials — contains
        // non-hex letters. Must NOT mis-parse.
        assert_eq!(try_parse_bt_mac("FVFXY1ABCDEF"), None);
        // 'Z' isn't hex; reject even if the length matches.
        assert_eq!(try_parse_bt_mac("ZZZZZZZZZZZZ"), None);
    }

    #[test]
    fn rejects_short_or_long_strings() {
        assert_eq!(try_parse_bt_mac(""), None);
        assert_eq!(try_parse_bt_mac("3b75f6f16d6"), None); // 11 chars
        assert_eq!(try_parse_bt_mac("3b75f6f16d6ee"), None); // 13 chars
    }
}
