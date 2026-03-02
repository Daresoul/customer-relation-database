use std::sync::{Arc, Mutex};
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

fn looks_like_microchip(code: &str) -> bool {
    let len = code.len();
    (len == 15 || len == 10) && code.chars().all(|c| c.is_ascii_digit())
}

fn emit_barcode(app: &AppHandle, device_name: &str, code: &str) {
    // Wake only on 15/10 digit numeric codes
    if looks_like_microchip(code) {
        if let Some(window) = app.get_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit_all(
            "wake-from-tray",
            serde_json::json!({
                "cause": "scan",
                "code": code,
                "device": device_name,
                "deviceType": "hid"
            })
        );
        let _ = app.emit_all(
            "scanner:barcode",
            serde_json::json!({
                "code": code,
                "device": device_name,
                "length": code.len(),
                "source": "hid"
            })
        );
    }
}

pub fn start_device_capture(app: AppHandle) {
    // Spawn a background thread to read HID devices if available.
    thread::spawn(move || {
        let mut api = match HidApi::new() {
            Ok(v) => v,
            Err(e) => {
                log::warn!("HIDAPI not available: {}", e);
                return;
            }
        };

        // Simple polling loop (dev-only acceptable). In production, hook into OS notifications.
        loop {
            // Re-enumerate devices each pass to handle plug/unplug during dev
            if let Err(e) = api.refresh_devices() {
                log::debug!("hidapi refresh failed: {}", e);
            }

            for dev_info in api.device_list() {
                let product = dev_info.product_string().unwrap_or("");
                let manufacturer = dev_info.manufacturer_string().unwrap_or("");
                // Heuristic: prefer devices whose usage_page (when available) is barcode scanner (0x8C),
                // otherwise match by product name containing typical keywords.
                let usage_page = dev_info.usage_page();
                let looks_scanner = usage_page == 0x8C
                    || product.to_lowercase().contains("scan")
                    || manufacturer.to_lowercase().contains("honeywell")
                    || manufacturer.to_lowercase().contains("zebra");
                if !looks_scanner {
                    continue;
                }

                let path = dev_info.path().to_string_lossy().to_string();
                let app_clone = app.clone();

                // Try opening device non-blocking
                match dev_info.open_device(&api) {
                    Ok(device) => {
                        let device_name = format!("{} {}", manufacturer, product).trim().to_string();
                        let device_name = if device_name.is_empty() { "HID Scanner".to_string() } else { device_name };
                        let mut device = device;
                        if let Err(e) = device.set_blocking_mode(false) {
                            log::debug!("hid set_blocking_mode failed: {}", e);
                        }

                        // Each device read in its own short-lived thread to avoid blocking this pass
                        thread::spawn(move || {
                            let buf_state = Arc::new(Mutex::new(BarcodeBuffer::new()));
                            let mut read_buf = [0u8; 64];
                            let idle_timeout = Duration::from_millis(120);
                            let mut last_emit = Instant::now();
                            loop {
                                match device.read(&mut read_buf) {
                                    Ok(n) if n > 0 => {
                                        let data = &read_buf[..n];
                                        // Attempt ASCII decode: many HID POS scanners provide printable bytes.
                                        // Filter digits and common terminators only.
                                        let mut s = String::new();
                                        for &b in data {
                                            if (b as char).is_ascii_digit() {
                                                s.push(b as char);
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
                                                    // Very fast keystrokes expected (<12ms). We don't have per-keystroke timing here,
                                                    // but the device-delivered packetization is already fast; accept as-is.
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

                                // Idle finalize if buffer contains 15/10 digits and has been idle briefly
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

                                // Break after some inactivity to avoid zombie threads during dev
                                if last_emit.elapsed() > Duration::from_secs(10) {
                                    break;
                                }
                                thread::sleep(Duration::from_millis(5));
                            }
                            log::debug!("HID device thread closing: {} ({})", device_name, path);
                        });
                    }
                    Err(e) => {
                        log::debug!("Failed to open HID device {}: {}", path, e);
                    }
                }
            }

            thread::sleep(Duration::from_secs(2));
        }
    });
}
