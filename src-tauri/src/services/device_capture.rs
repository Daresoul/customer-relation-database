use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use hidapi::HidApi;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
struct BarcodeBuffer {
    buf: String,
    last_ts: Instant,
}

impl BarcodeBuffer {
    fn new() -> Self { Self { buf: String::new(), last_ts: Instant::now() } }
    fn push(&mut self, ch: char) { self.buf.push(ch); self.last_ts = Instant::now(); }
    fn clear(&mut self) { self.buf.clear(); }
}

// --- Static state for device tracking and deduplication ---

/// Tracks HID device paths with active reader threads to prevent duplicate opens.
static ACTIVE_DEVICE_PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn get_active_devices() -> &'static Mutex<HashSet<String>> {
    ACTIVE_DEVICE_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Tracks HID device paths that failed to open, with cooldown to prevent
/// retrying every 2 seconds (which causes focus disruption on macOS via IOKit).
static FAILED_DEVICE_PATHS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

fn get_failed_devices() -> &'static Mutex<HashMap<String, Instant>> {
    FAILED_DEVICE_PATHS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Deduplication cache: barcode code → last emission timestamp.
/// Prevents the same code from being emitted multiple times within 500ms.
static RECENT_EMITS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

fn get_recent_emits() -> &'static Mutex<HashMap<String, Instant>> {
    RECENT_EMITS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Throttle window.show() + set_focus() calls to prevent rapid focus cycling.
/// Shared across device_capture, device_input, and file_watcher via this module.
static LAST_FOCUS_TIME: OnceLock<Mutex<Instant>> = OnceLock::new();

fn get_last_focus_time() -> &'static Mutex<Instant> {
    LAST_FOCUS_TIME.get_or_init(|| Mutex::new(Instant::now() - Duration::from_secs(10)))
}

/// Show and focus the main window, throttled to at most once every 2 seconds.
/// Returns true if the window was actually shown/focused.
pub fn throttled_show_and_focus(app: &AppHandle) -> bool {
    let mut last_time = get_last_focus_time().lock().unwrap();
    if last_time.elapsed() < Duration::from_secs(2) {
        log::debug!("Focus throttled: skipping show+focus (last was {}ms ago)", last_time.elapsed().as_millis());
        return false;
    }
    *last_time = Instant::now();
    drop(last_time); // Release lock before blocking window ops

    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        true
    } else {
        false
    }
}

/// Known barcode scanner vendor IDs for improved detection and BadUSB defense.
/// Sources: USB-IF registry, manufacturer documentation.
const KNOWN_SCANNER_VIDS: &[u16] = &[
    0x0C2E, // Honeywell / Metrologic
    0x05E0, // Zebra / Symbol Technologies
    0x05F9, // Datalogic
    0x0EB0, // Socket Mobile
    0x065A, // Opticon
    0x0D2A, // Code Corporation
];

/// Validates whether a scanned code matches known microchip formats.
/// - 15 digits: ISO 11784/11785 FDX-B (global standard, passport format)
/// - 12 hex chars: ISO 11784/11785 FDX-B raw 48-bit ID (some readers' default)
/// - 10 hex chars: AVID FDX-A (North America, may contain A-F)
/// - 9 digits: Legacy European pre-ISO formats
fn looks_like_microchip(code: &str) -> bool {
    let len = code.len();
    match len {
        15 => code.chars().all(|c| c.is_ascii_digit()),
        12 => code.chars().all(|c| c.is_ascii_hexdigit()),
        10 => code.chars().all(|c| c.is_ascii_hexdigit()),
        9  => code.chars().all(|c| c.is_ascii_digit()),
        _  => false,
    }
}

/// Normalizes a scanned microchip code to its canonical storage form.
///
/// FDX-B chips can be reported by readers as either the 15-digit passport
/// decimal or the raw 12-hex 48-bit ID. We always emit the 15-digit decimal
/// so downstream consumers and the database see one format regardless of
/// scanner configuration.
///
/// Bit layout for 12-hex FDX-B IDs (48 bits total):
///   - Top 10 bits: ISO 3166-1 numeric country code
///   - Bottom 38 bits: national animal ID
fn normalize_microchip(code: &str) -> String {
    if code.len() == 12 && code.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Ok(n) = u64::from_str_radix(code, 16) {
            let country = (n >> 38) & 0x3FF;
            let animal = n & ((1u64 << 38) - 1);
            return format!("{:03}{:012}", country, animal);
        }
    }
    code.to_string()
}

/// Public wrapper around [`normalize_microchip`] for cross-module reuse
/// (raw_input_capture emits scans through this so HID-mode and Raw-Input-mode
/// scanners produce byte-identical events to the frontend).
pub fn normalize_microchip_public(code: &str) -> String {
    normalize_microchip(code)
}

fn emit_barcode(app: &AppHandle, device_name: &str, code: &str) {
    if looks_like_microchip(code) {
        let normalized = normalize_microchip(code);
        // Dedup: skip if the same code was emitted within 500ms.
        // Dedup against the normalized form so the same chip read in hex and
        // decimal back-to-back is treated as one scan.
        {
            let mut recent = get_recent_emits().lock().unwrap();
            if let Some(last_time) = recent.get(&normalized) {
                if last_time.elapsed() < Duration::from_millis(500) {
                    log::debug!("HID dedup: skipping duplicate barcode {} (within 500ms)", normalized);
                    return;
                }
            }
            recent.insert(normalized.clone(), Instant::now());
            // Prune old entries to prevent unbounded growth
            recent.retain(|_, t| t.elapsed() < Duration::from_secs(10));
        }

        let is_hidden = app.get_window("main")
            .map(|w| !w.is_visible().unwrap_or(true))
            .unwrap_or(false);

        if is_hidden {
            throttled_show_and_focus(app);
            let _ = app.emit_all(
                "wake-from-tray",
                serde_json::json!({
                    "cause": "scan",
                    "code": normalized,
                    "device": device_name,
                    "deviceType": "hid"
                })
            );
        }
        // Always emit barcode data so the frontend can process it
        let _ = app.emit_all(
            "scanner:barcode",
            serde_json::json!({
                "code": normalized,
                "device": device_name,
                "length": normalized.len(),
                "source": "hid"
            })
        );
    }
}

/// Start background HID device capture for barcode scanners.
///
/// Reads raw HID reports and extracts ASCII digit/hex sequences. Most veterinary
/// scanners (AVID, Destron Fearing, Trovan) operate in HID Keyboard mode by default.
/// HID POS mode (usage_page 0x8C) requires manual scanner configuration and is
/// uncommon in clinic environments. The current approach of extracting printable
/// characters from raw reports works for both modes when scanning 9–15 character
/// microchip codes. Full POS-mode report descriptor parsing per the USB-IF POS
/// specification (v1.03) is not implemented as the benefit is marginal for this use case.
pub fn start_device_capture(app: AppHandle) {
    thread::spawn(move || {
        let mut api = match HidApi::new() {
            Ok(v) => v,
            Err(e) => {
                log::warn!("HIDAPI not available: {}", e);
                // Promote as a structured event — hidapi failing means
                // the scanner capture path can't run at all. Silent
                // failure would leave clinics wondering why scans aren't
                // appearing.
                crate::services::telemetry::event(
                    crate::services::telemetry::Level::Warn,
                    "device_capture",
                    "device_capture: HidApi::new() failed — scanner capture path disabled",
                    serde_json::json!({
                        "failure": "hidapi_init",
                        "error": format!("{e}"),
                    }),
                );
                return;
            }
        };

        // Startup anchor event so subsequent failures in this subsystem
        // are easy to correlate with "did the loop ever start?" The
        // doubling investigation identified this path as a suspect (it
        // briefly opens HID handles on every matched scanner) — having
        // this breadcrumb in the trail makes future bug reports
        // immediately interpretable.
        crate::services::telemetry::event(
            crate::services::telemetry::Level::Info,
            "device_capture",
            "hidapi enumeration loop started",
            serde_json::json!({}),
        );

        loop {
            // Re-enumerate devices each pass to detect plug/unplug
            if let Err(e) = api.refresh_devices() {
                log::debug!("hidapi refresh failed: {}", e);
            }

            for dev_info in api.device_list() {
                let product = dev_info.product_string().unwrap_or("");
                let manufacturer = dev_info.manufacturer_string().unwrap_or("");
                let usage_page = dev_info.usage_page();
                let vid = dev_info.vendor_id();

                // Heuristic scanner detection: usage page, known VIDs, or keyword matching
                let looks_scanner = usage_page == 0x8C
                    || KNOWN_SCANNER_VIDS.contains(&vid)
                    || product.to_lowercase().contains("scan")
                    || manufacturer.to_lowercase().contains("honeywell")
                    || manufacturer.to_lowercase().contains("zebra");
                if !looks_scanner {
                    continue;
                }

                let path = dev_info.path().to_string_lossy().to_string();

                // Skip if this device already has an active reader thread
                {
                    let active = get_active_devices().lock().unwrap();
                    if active.contains(&path) {
                        continue;
                    }
                }

                // Skip if this device recently failed to open (30-second cooldown).
                // On macOS, repeated open_device() calls via IOKit can cause focus
                // disruptions when the device is already claimed by the OS.
                {
                    let mut failed = get_failed_devices().lock().unwrap();
                    if let Some(failed_at) = failed.get(&path) {
                        if failed_at.elapsed() < Duration::from_secs(30) {
                            continue;
                        }
                        // Cooldown expired, remove from failed set and retry
                        failed.remove(&path);
                    }
                }

                let app_clone = app.clone();
                let path_clone = path.clone();

                // Try opening device non-blocking
                match dev_info.open_device(&api) {
                    Ok(device) => {
                        let device_name = format!("{} {}", manufacturer, product).trim().to_string();
                        let device_name = if device_name.is_empty() { "HID Scanner".to_string() } else { device_name };
                        let mut device = device;
                        if let Err(e) = device.set_blocking_mode(false) {
                            log::debug!("hid set_blocking_mode failed: {}", e);
                        }

                        // Register device as active before spawning thread
                        {
                            let mut active = get_active_devices().lock().unwrap();
                            active.insert(path.clone());
                        }

                        log::debug!(
                            "HID scanner thread starting: '{}' VID={:04X} PID={:04X} usage={:04X} path={}",
                            device_name, vid, dev_info.product_id(), usage_page, path
                        );

                        // Each device read in its own thread
                        thread::spawn(move || {
                            let buf_state = Arc::new(Mutex::new(BarcodeBuffer::new()));
                            let mut read_buf = [0u8; 64];
                            let idle_timeout = Duration::from_millis(120);
                            let mut last_emit = Instant::now();

                            loop {
                                match device.read(&mut read_buf) {
                                    Ok(n) if n > 0 => {
                                        let data = &read_buf[..n];
                                        // Extract hex digits and terminators from raw HID reports.
                                        // Hex is needed for AVID FDX-A microchips (10-char, A-F allowed).
                                        let mut s = String::new();
                                        for &b in data {
                                            let ch = b as char;
                                            if ch.is_ascii_hexdigit() {
                                                s.push(ch.to_ascii_uppercase());
                                            } else if b == b'\r' || b == b'\n' {
                                                s.push('\n');
                                            }
                                        }
                                        if !s.is_empty() {
                                            let mut st = buf_state.lock().unwrap();
                                            for ch in s.chars() {
                                                if ch == '\n' {
                                                    let code = st.buf.clone();
                                                    st.clear();
                                                    if !code.is_empty() {
                                                        emit_barcode(&app_clone, &device_name, &code);
                                                        last_emit = Instant::now();
                                                    }
                                                } else {
                                                    st.push(ch);
                                                }
                                            }
                                        }
                                    }
                                    Ok(_) => {
                                        // no data
                                    }
                                    Err(_) => {
                                        // Non-blocking read; ignore transient errors
                                    }
                                }

                                // Idle finalize if buffer has been idle briefly
                                {
                                    let mut st = buf_state.lock().unwrap();
                                    if !st.buf.is_empty() && st.last_ts.elapsed() > idle_timeout {
                                        let code = st.buf.clone();
                                        st.clear();
                                        if looks_like_microchip(&code) {
                                            emit_barcode(&app_clone, &device_name, &code);
                                            last_emit = Instant::now();
                                        }
                                    }
                                }

                                // Break after inactivity to avoid zombie threads.
                                // 60s is long enough to avoid constant re-open cycles (which cause
                                // focus disruption on macOS via IOKit) while still cleaning up
                                // threads for disconnected devices.
                                if last_emit.elapsed() > Duration::from_secs(60) {
                                    break;
                                }
                                thread::sleep(Duration::from_millis(5));
                            }

                            // Unregister device on thread exit so it can be re-opened on next poll
                            {
                                let mut active = get_active_devices().lock().unwrap();
                                active.remove(&path_clone);
                            }
                            log::debug!("HID device thread closing: {} ({})", device_name, path_clone);
                        });
                    }
                    Err(e) => {
                        log::debug!("Failed to open HID device {}: {} (cooldown 30s)", path, e);
                        // Track the failure so we don't retry every 2 seconds
                        let mut failed = get_failed_devices().lock().unwrap();
                        failed.insert(path.clone(), Instant::now());
                        // Prune old entries to prevent unbounded growth
                        failed.retain(|_, t| t.elapsed() < Duration::from_secs(60));
                    }
                }
            }

            thread::sleep(Duration::from_secs(2));
        }
    });
}

// ===========================================================================
// Tests for the pure helpers. These run without HID, the DB, or any AppHandle.
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // looks_like_microchip — accept/reject matrix
    // -----------------------------------------------------------------------

    #[test]
    fn accepts_15_digit_iso_fdxb() {
        assert!(looks_like_microchip("807010000007678"));
        assert!(looks_like_microchip("978000000000001"));
    }

    #[test]
    fn rejects_15_chars_with_letters() {
        assert!(!looks_like_microchip("80701000000AAAA"));
    }

    #[test]
    fn accepts_12_hex_uppercase_and_lowercase() {
        assert!(looks_like_microchip("C9C2540C01FE"));
        assert!(looks_like_microchip("c9c2540c01fe"));
        assert!(looks_like_microchip("c9C2540c01FE"));
    }

    #[test]
    fn rejects_12_chars_with_non_hex() {
        assert!(!looks_like_microchip("C9C2540C01GZ"));
    }

    #[test]
    fn accepts_10_hex_avid_fdx_a() {
        assert!(looks_like_microchip("1A2B3C4D5E"));
        assert!(looks_like_microchip("0123456789"));
    }

    #[test]
    fn accepts_9_digit_legacy_european() {
        assert!(looks_like_microchip("123456789"));
    }

    #[test]
    fn rejects_9_chars_with_letters() {
        assert!(!looks_like_microchip("12345678A"));
    }

    #[test]
    fn rejects_other_lengths() {
        for len in [0, 1, 8, 11, 13, 14, 16, 20] {
            let code: String = "0".repeat(len);
            assert!(!looks_like_microchip(&code), "len={} should not match", len);
        }
    }

    // -----------------------------------------------------------------------
    // normalize_microchip — bit-layout decode
    // -----------------------------------------------------------------------

    /// Known good fixture: 12-hex → 15-digit decimal. Computed in Python:
    ///   country = (0xC9C2540C01FE >> 38) & 0x3FF == 807
    ///   animal  = 0xC9C2540C01FE & ((1<<38)-1) == 10000007678
    ///   passport = "807" + "010000007678"
    #[test]
    fn normalizes_known_macedonia_chip() {
        assert_eq!(normalize_microchip("C9C2540C01FE"), "807010000007678");
    }

    #[test]
    fn normalize_is_case_insensitive_for_hex() {
        assert_eq!(normalize_microchip("C9C2540C01FE"), "807010000007678");
        assert_eq!(normalize_microchip("c9c2540c01fe"), "807010000007678");
        assert_eq!(normalize_microchip("c9C2540c01FE"), "807010000007678");
    }

    #[test]
    fn normalize_15_digit_input_passthrough() {
        assert_eq!(normalize_microchip("807010000007678"), "807010000007678");
    }

    #[test]
    fn normalize_10_hex_passthrough() {
        // AVID FDX-A — leave alone, different ID space.
        assert_eq!(normalize_microchip("1A2B3C4D5E"), "1A2B3C4D5E");
    }

    #[test]
    fn normalize_9_digit_passthrough() {
        assert_eq!(normalize_microchip("123456789"), "123456789");
    }

    #[test]
    fn normalize_invalid_length_passthrough() {
        assert_eq!(normalize_microchip(""), "");
        assert_eq!(normalize_microchip("ABC"), "ABC");
        assert_eq!(normalize_microchip("not-a-chip"), "not-a-chip");
    }

    #[test]
    fn normalize_12_chars_non_hex_passthrough() {
        // 12 chars but not all hex → don't decode, return as-is so the
        // caller can still see something useful in logs.
        assert_eq!(normalize_microchip("AAAAAAAAGGGG"), "AAAAAAAAGGGG");
    }

    #[test]
    fn normalize_min_boundary_values() {
        // country=0, animal=0 → all zeros
        assert_eq!(normalize_microchip("000000000000"), "000000000000000");
    }

    #[test]
    fn normalize_max_boundary_values() {
        // country=1023, animal=2^38-1 → top of the range
        assert_eq!(normalize_microchip("FFFFFFFFFFFF"), "1023274877906943");
        // That's 16 chars; the country exceeds 3 digits because 1023 > 999.
        // Real-world country codes top out at 999 (ISO 3166-1 numeric), so
        // this is informational — confirms format!{:03} doesn't truncate.
    }

    #[test]
    fn normalize_country_only_with_zero_animal() {
        // 807 << 38 = 0xC980000000000 → only 13 hex chars, so we left-pad to
        // 12-hex by using the correct value: 0xC9C2540C0000 has animal=0.
        // Easier: compute directly. country=807, animal=0:
        //   raw = (807u64 << 38) = 0xC980000000000
        //   12 hex = "C980000000000"... wait that's 13 chars.
        // Actually 0xC9_8000_0000_00 = 0xC980000000000_u64 has hex length 13.
        // Skip — see test below for a clean low-animal case.
        let raw: u64 = 807u64 << 38;
        let hex = format!("{:012X}", raw);
        // hex may be longer than 12 if the high bit pushes past 48 bits; for
        // country 807 it's exactly 12 because 807 < 1024 (10 bits).
        assert_eq!(hex.len(), 12, "hex={}", hex);
        assert_eq!(normalize_microchip(&hex), "807000000000000");
    }
}
