//! Windows Raw Input capture for managed HID scanners.
//!
//! What this does on Windows:
//!   1. Creates a hidden, message-only window on a dedicated thread.
//!   2. Calls `RegisterRawInputDevices` with `RIDEV_INPUTSINK` for the
//!      keyboard usage page, so we receive raw HID keyboard input even when
//!      our window is in the background.
//!   3. For each WM_INPUT message, resolves the source device's USB VID/PID
//!      via `GetRawInputDeviceInfo(RIDI_DEVICENAME)`. If it matches a row in
//!      `managed_hid_scanners` (loaded from SQLite at startup), we accumulate
//!      the character into a per-device buffer and emit a `scanner:barcode`
//!      event when Enter / CR / LF arrives. Non-managed devices are ignored.
//!
//! On focus stealing — what this does *not* do:
//!   The earlier design tried to combine `RIDEV_NOLEGACY` with `SendInput`
//!   re-injection so we could suppress managed-device keystrokes from
//!   reaching focused apps. That doesn't actually work: `RIDEV_NOLEGACY`
//!   is per-process — it stops *our* window from receiving WM_KEY messages
//!   for those devices, but other apps still get them. The re-injection
//!   then duplicated every keystroke (OS-delivered + ours), which was the
//!   v0.5.0 double-key bug.
//!
//!   Real per-device system-wide HID suppression on Windows requires a
//!   `WH_KEYBOARD_LL` global hook correlated with Raw Input timing — a
//!   separate, harder feature. For now we observe HID reports from managed
//!   scanners and emit our own events; the OS still routes keystrokes to
//!   the focused app the normal way.
//!
//! On non-Windows platforms this whole module is a no-op stub. The hidapi-based
//! `device_capture` keeps providing scan events on macOS / Linux.

#[cfg(target_os = "windows")]
pub use windows_impl::start_raw_input_capture;

#[cfg(not(target_os = "windows"))]
pub fn start_raw_input_capture(_app: tauri::AppHandle, _pool: crate::database::SeaOrmPool) {
    log::debug!("raw_input_capture: not supported on this platform, skipping");
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use crate::database::SeaOrmPool;
    use crate::services::managed_hid_scanner::ManagedHidScannerService;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, OnceLock};
    use std::thread;
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager};

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::{
        GetRawInputData, GetRawInputDeviceInfoW, RegisterRawInputDevices, HRAWINPUT, RAWINPUT,
        RAWINPUTDEVICE, RAWINPUTHEADER, RAW_INPUT_DEVICE_INFO_COMMAND, RIDEV_INPUTSINK,
        RID_INPUT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassExW,
        TranslateMessage, CW_USEDEFAULT, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_INPUT, WNDCLASSEXW,
    };

    /// USB device descriptor parsed out of `RIDI_DEVICENAME`.
    /// Format is `\\?\HID#VID_xxxx&PID_xxxx&...`.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    struct UsbId {
        vid: u16,
        pid: u16,
    }

    /// Lookup of `device-handle → (UsbId, is_managed)` so we don't re-parse
    /// the device name on every keystroke. Filled lazily on first WM_INPUT.
    static DEVICE_CACHE: OnceLock<Mutex<HashMap<isize, Option<UsbId>>>> = OnceLock::new();

    fn device_cache() -> &'static Mutex<HashMap<isize, Option<UsbId>>> {
        DEVICE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
    }

    /// Per-device keystroke buffer used to accumulate a barcode/chip ID
    /// between the first character and the terminator (Enter / CR / LF).
    /// Keyed by `RAWINPUT.header.hDevice` so concurrent scanners don't
    /// interleave.
    #[derive(Debug)]
    struct ScanBuffer {
        chars: String,
        last_ts: Instant,
    }
    impl Default for ScanBuffer {
        // Manual impl because `Instant` doesn't derive Default. The initial
        // timestamp doesn't matter — first keystroke overwrites it before
        // any staleness check fires.
        fn default() -> Self {
            Self { chars: String::new(), last_ts: Instant::now() }
        }
    }
    static SCAN_BUFFERS: OnceLock<Mutex<HashMap<isize, ScanBuffer>>> = OnceLock::new();

    fn scan_buffers() -> &'static Mutex<HashMap<isize, ScanBuffer>> {
        SCAN_BUFFERS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    /// VID/PIDs the user has marked as "managed" (suppress + capture).
    static MANAGED_IDS: OnceLock<Mutex<Vec<UsbId>>> = OnceLock::new();

    fn managed_ids() -> &'static Mutex<Vec<UsbId>> {
        MANAGED_IDS.get_or_init(|| Mutex::new(Vec::new()))
    }

    /// Stash the app handle so the message-loop thread can emit events.
    /// Set once before the message loop spins up.
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    /// Entry point. Spawns the message-loop thread and returns immediately.
    pub fn start_raw_input_capture(app: AppHandle, pool: SeaOrmPool) {
        if APP_HANDLE.set(app.clone()).is_err() {
            log::warn!("raw_input_capture: already started; ignoring duplicate call");
            return;
        }

        // Load managed VID/PIDs from SQLite. Done synchronously up front so the
        // message loop has a populated list before we register Raw Input.
        let app_for_load = app.clone();
        tauri::async_runtime::block_on(async move {
            match ManagedHidScannerService::list_enabled(&pool).await {
                Ok(rows) => {
                    let ids: Vec<UsbId> = rows
                        .into_iter()
                        .map(|r| UsbId {
                            vid: r.vendor_id as u16,
                            pid: r.product_id as u16,
                        })
                        .collect();
                    log::info!(
                        "raw_input_capture: managing {} HID scanner(s) at startup",
                        ids.len()
                    );
                    *managed_ids().lock().unwrap() = ids;
                }
                Err(e) => {
                    log::warn!("raw_input_capture: failed to load managed scanners: {}", e);
                    // Continue with empty list — module will just pass-through everything.
                }
            }

            // Stash the pool too so reload_managed_ids() can refresh from the
            // settings UI without taking another handle.
            let _ = app_for_load
                .try_state::<SeaOrmPool>()
                .map(|_| ()); // no-op; we just need the side effect of touching state
        });

        thread::Builder::new()
            .name("raw-input-capture".into())
            .spawn(message_loop_thread)
            .expect("failed to spawn raw-input-capture thread");
    }

    /// The actual thread: create message-only window, register Raw Input,
    /// pump messages. Returns only on fatal error.
    fn message_loop_thread() {
        unsafe {
            let class_name = wide("VetClinicRawInputSinkClass");
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(window_proc),
                hInstance: windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                    .unwrap_or_default()
                    .into(),
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            if RegisterClassExW(&class) == 0 {
                log::error!("raw_input_capture: RegisterClassExW failed");
                return;
            }

            let window_name = wide("VetClinicRawInputSink");
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                PCWSTR(class_name.as_ptr()),
                PCWSTR(window_name.as_ptr()),
                WINDOW_STYLE(0),
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                0,
                0,
                HWND_MESSAGE, // message-only window: invisible, not in taskbar, no WM_PAINT noise
                None,
                class.hInstance,
                None,
            );
            if hwnd.0 == 0 {
                log::error!("raw_input_capture: CreateWindowExW failed");
                return;
            }

            // Register keyboard usage page (1, 6) with INPUTSINK only (deliver
            // raw HID reports to us even when our window is in the background).
            //
            // We do NOT use RIDEV_NOLEGACY. Despite the name, NOLEGACY only
            // suppresses WM_KEY messages for THIS process — other apps still
            // receive them normally from the same physical keystroke. Combining
            // NOLEGACY with SendInput re-injection makes focused apps see every
            // keystroke twice (the OS-delivered one + our re-injection). True
            // per-device system-wide suppression requires a WH_KEYBOARD_LL
            // hook correlated with Raw Input timing — separate feature.
            //
            // Without NOLEGACY we still observe HID reports from managed
            // scanners and emit `scanner:barcode` events for them; the OS
            // routes keystrokes to the focused app normally (same behavior as
            // the existing `device_capture.rs` hidapi-poll path).
            let devices = [RAWINPUTDEVICE {
                usUsagePage: 0x01,
                usUsage: 0x06,
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: hwnd,
            }];
            if RegisterRawInputDevices(
                &devices,
                std::mem::size_of::<RAWINPUTDEVICE>() as u32,
            )
            .is_err()
            {
                log::error!("raw_input_capture: RegisterRawInputDevices failed");
                return;
            }

            log::info!("raw_input_capture: started, listening on hidden HWND");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND(0), 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_INPUT {
            // SAFETY: we own the HRAWINPUT — Windows promises it's valid for the
            // duration of this WM_INPUT message.
            unsafe {
                handle_wm_input(HRAWINPUT(lparam.0));
            }
            return LRESULT(0);
        }
        unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
    }

    unsafe fn handle_wm_input(hraw: HRAWINPUT) {
        // First call to GetRawInputData with NULL buffer just returns the size.
        let mut size: u32 = 0;
        if GetRawInputData(
            hraw,
            RID_INPUT,
            None,
            &mut size,
            std::mem::size_of::<RAWINPUTHEADER>() as u32,
        ) != 0
            || size == 0
        {
            return;
        }
        let mut buf: Vec<u8> = vec![0; size as usize];
        let read = GetRawInputData(
            hraw,
            RID_INPUT,
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            std::mem::size_of::<RAWINPUTHEADER>() as u32,
        );
        if read != size {
            return;
        }
        let raw = &*(buf.as_ptr() as *const RAWINPUT);

        // Only handle keyboard input.
        // RIM_TYPEKEYBOARD = 1
        if raw.header.dwType != 1 {
            return;
        }

        let h_device = raw.header.hDevice.0;
        let usb = resolve_usb_id(h_device);

        let kb = &raw.data.keyboard;

        // Skip key-up events; we only emit on key-down.
        const RI_KEY_BREAK: u32 = 0x01;
        if (kb.Flags as u32) & RI_KEY_BREAK != 0 {
            return;
        }

        let is_managed = match usb {
            Some(id) => managed_ids().lock().unwrap().iter().any(|m| *m == id),
            None => false,
        };

        if !is_managed {
            // Not a managed scanner. We don't suppress (NOLEGACY removed), so
            // the OS already delivered this keystroke to the focused window
            // normally. Nothing more to do — observing it here is purely so
            // we can identify and ignore non-managed devices.
            return;
        }

        // Managed device — accumulate into per-device buffer, emit on Enter.
        let vk = kb.VKey;
        let scan_code = kb.MakeCode;
        if let Some(ch) = vk_to_char(vk, scan_code) {
            let mut buffers = scan_buffers().lock().unwrap();
            let buf = buffers.entry(h_device).or_default();
            // Reset buffer if more than 1s since last keystroke (stale scan).
            if buf.last_ts.elapsed() > Duration::from_secs(1) {
                buf.chars.clear();
            }
            buf.last_ts = Instant::now();

            if ch == '\r' || ch == '\n' {
                let code = std::mem::take(&mut buf.chars);
                drop(buffers);
                if !code.is_empty() {
                    emit_scan(&code);
                }
            } else {
                buf.chars.push(ch);
            }
        }
        // Note: managed-device input is intentionally NOT re-injected. That's
        // the whole point — it goes only to our app, never the focused window.
    }

    /// Look up the source device's USB VID/PID. Cached because the API call
    /// allocates and we'd otherwise do it on every keystroke.
    unsafe fn resolve_usb_id(h_device: isize) -> Option<UsbId> {
        if let Some(cached) = device_cache().lock().unwrap().get(&h_device) {
            return *cached;
        }

        // RIDI_DEVICENAME = 0x20000007
        const RIDI_DEVICENAME: RAW_INPUT_DEVICE_INFO_COMMAND =
            RAW_INPUT_DEVICE_INFO_COMMAND(0x20000007);

        let mut len: u32 = 0;
        GetRawInputDeviceInfoW(
            windows::Win32::Foundation::HANDLE(h_device),
            RIDI_DEVICENAME,
            None,
            &mut len,
        );
        if len == 0 {
            device_cache().lock().unwrap().insert(h_device, None);
            return None;
        }
        let mut wbuf: Vec<u16> = vec![0; len as usize];
        let read = GetRawInputDeviceInfoW(
            windows::Win32::Foundation::HANDLE(h_device),
            RIDI_DEVICENAME,
            Some(wbuf.as_mut_ptr() as *mut _),
            &mut len,
        );
        if read == u32::MAX || read == 0 {
            device_cache().lock().unwrap().insert(h_device, None);
            return None;
        }
        // Trim trailing null
        let name = String::from_utf16_lossy(&wbuf[..(read as usize).saturating_sub(1)]);
        let parsed = parse_vid_pid(&name);
        device_cache().lock().unwrap().insert(h_device, parsed);
        parsed
    }

    /// Parse `\\?\HID#VID_05AC&PID_022C&...` style device names. Both vendor
    /// and product IDs are 4 hex chars; case can vary across Windows versions
    /// so we match case-insensitively.
    fn parse_vid_pid(name: &str) -> Option<UsbId> {
        let lower = name.to_ascii_lowercase();
        let vid_idx = lower.find("vid_")? + 4;
        let vid_str: String = lower[vid_idx..].chars().take(4).collect();
        let pid_idx = lower.find("pid_")? + 4;
        let pid_str: String = lower[pid_idx..].chars().take(4).collect();
        let vid = u16::from_str_radix(&vid_str, 16).ok()?;
        let pid = u16::from_str_radix(&pid_str, 16).ok()?;
        Some(UsbId { vid, pid })
    }

    /// Best-effort virtual-key → char mapping for the digits / hex / Enter
    /// that microchip scanners actually emit. We do NOT try to be a full
    /// keyboard mapper — that's a rabbit hole (Shift, dead keys, IME, layouts).
    /// FDX-B chips and barcodes both fit in 0-9, A-F, plus Enter, so this is
    /// enough for the use case.
    fn vk_to_char(vk: u16, _scan_code: u16) -> Option<char> {
        // VK_RETURN = 0x0D
        if vk == 0x0D {
            return Some('\r');
        }
        // VK_0..VK_9 = 0x30..0x39 (matches ASCII '0'..'9')
        if (0x30..=0x39).contains(&vk) {
            return Some(vk as u8 as char);
        }
        // VK_A..VK_F = 0x41..0x46 (matches ASCII 'A'..'F')
        if (0x41..=0x46).contains(&vk) {
            return Some(vk as u8 as char);
        }
        // Numeric keypad VK_NUMPAD0..VK_NUMPAD9 = 0x60..0x69 → '0'..'9'
        if (0x60..=0x69).contains(&vk) {
            return Some(('0' as u8 + (vk - 0x60) as u8) as char);
        }
        None
    }

    fn emit_scan(code: &str) {
        log::info!("raw_input_capture: scan from managed device: {}", code);
        if let Some(app) = APP_HANDLE.get() {
            let normalized = crate::services::device_capture::normalize_microchip_public(code);
            let _ = app.emit_all(
                "scanner:barcode",
                serde_json::json!({
                    "code": normalized,
                    "device": "managed-hid",
                    "length": normalized.len(),
                    "source": "raw_input",
                }),
            );
            // Wake the window if it's hidden — same UX as the hidapi path so a
            // tray-hidden app pops to the front when the vet scans something.
            let is_hidden = app
                .get_window("main")
                .map(|w| !w.is_visible().unwrap_or(true))
                .unwrap_or(false);
            if is_hidden {
                let _ = crate::services::device_capture::throttled_show_and_focus(app);
                let _ = app.emit_all(
                    "wake-from-tray",
                    serde_json::json!({
                        "cause": "scan",
                        "code": normalized,
                        "device": "managed-hid",
                        "deviceType": "raw_input",
                    }),
                );
            }
        }
    }

    /// Reload the managed VID/PID list from SQLite. Called by the settings
    /// commands after add / update / delete so the running capture picks up
    /// changes without restart.
    pub fn reload_managed_ids_from_pool(pool: &SeaOrmPool) {
        let result = tauri::async_runtime::block_on(ManagedHidScannerService::list_enabled(pool));
        match result {
            Ok(rows) => {
                let ids: Vec<UsbId> = rows
                    .into_iter()
                    .map(|r| UsbId {
                        vid: r.vendor_id as u16,
                        pid: r.product_id as u16,
                    })
                    .collect();
                log::info!(
                    "raw_input_capture: reloaded managed scanner list, now {} entries",
                    ids.len()
                );
                *managed_ids().lock().unwrap() = ids;
            }
            Err(e) => log::warn!("raw_input_capture: reload failed: {}", e),
        }
    }

    /// UTF-16 null-terminated conversion helper.
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn parses_typical_hid_device_name() {
            // Real-world example from a paired W91B
            let name = r"\\?\HID#VID_0005&PID_FFFF&MI_01#7&abcd1234&0&0001#{...}";
            assert_eq!(
                parse_vid_pid(name),
                Some(UsbId { vid: 0x0005, pid: 0xFFFF })
            );
        }

        #[test]
        fn parses_lowercase_and_uppercase_hex() {
            let name_upper = r"\\?\HID#VID_05AC&PID_022C&MI_00#abc#{xyz}";
            let name_lower = r"\\?\HID#vid_05ac&pid_022c&MI_00#abc#{xyz}";
            assert_eq!(parse_vid_pid(name_upper), parse_vid_pid(name_lower));
            assert_eq!(
                parse_vid_pid(name_upper),
                Some(UsbId { vid: 0x05AC, pid: 0x022C })
            );
        }

        #[test]
        fn handles_missing_pid_gracefully() {
            assert_eq!(parse_vid_pid(r"\\?\HID#VID_0005&MI_01"), None);
            assert_eq!(parse_vid_pid("not a device path"), None);
            assert_eq!(parse_vid_pid(""), None);
        }

        #[test]
        fn vk_to_char_covers_digits_hex_and_enter() {
            assert_eq!(vk_to_char(0x30, 0), Some('0'));
            assert_eq!(vk_to_char(0x39, 0), Some('9'));
            assert_eq!(vk_to_char(0x41, 0), Some('A'));
            assert_eq!(vk_to_char(0x46, 0), Some('F'));
            assert_eq!(vk_to_char(0x0D, 0), Some('\r'));
            assert_eq!(vk_to_char(0x60, 0), Some('0')); // numpad 0
            assert_eq!(vk_to_char(0x69, 0), Some('9')); // numpad 9
            // Letters outside hex range and modifier keys are intentionally ignored
            assert_eq!(vk_to_char(0x47, 0), None); // 'G'
            assert_eq!(vk_to_char(0x10, 0), None); // Shift
            assert_eq!(vk_to_char(0x20, 0), None); // Space
        }
    }
}

// Cross-platform reload hook so command handlers can call it without #[cfg]
// at every call site.
#[cfg(target_os = "windows")]
pub fn reload_managed_ids(pool: &crate::database::SeaOrmPool) {
    windows_impl::reload_managed_ids_from_pool(pool);
}

#[cfg(not(target_os = "windows"))]
pub fn reload_managed_ids(_pool: &crate::database::SeaOrmPool) {
    // No-op on non-Windows: there's no Raw Input capture to refresh.
}
