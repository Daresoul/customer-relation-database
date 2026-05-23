//! Windows Raw Input capture + per-device keystroke suppression for managed
//! HID scanners.
//!
//! What this does on Windows:
//!   1. Creates a hidden, message-only window on a dedicated thread.
//!   2. Calls `RegisterRawInputDevices` with `RIDEV_INPUTSINK` for the
//!      keyboard usage page, so we receive raw HID keyboard input from every
//!      keyboard-class device even when our window is in the background.
//!   3. For each WM_INPUT message, resolves the source device's USB VID/PID
//!      via `GetRawInputDeviceInfo(RIDI_DEVICENAME)`. If it matches a row in
//!      `managed_hid_scanners` (loaded from SQLite at startup), we accumulate
//!      the character into a per-device buffer and emit a `scanner:barcode`
//!      event when Enter / CR / LF arrives.
//!   4. Installs a `WH_KEYBOARD_LL` low-level keyboard hook on the same
//!      thread. The hook sees every system-wide keystroke and consults a
//!      shared queue populated by step 3. If the keystroke corresponds to a
//!      managed-device WM_INPUT we just processed, the hook returns non-zero
//!      to swallow the event — no focused window receives it. Non-managed
//!      keyboards (POS scanners, normal keyboards) pass through untouched.
//!
//! On Raw Input vs hook timing:
//!   Windows fires `WM_INPUT` *before* the low-level keyboard hook for the
//!   same physical press (Raw Input lives below the keyboard event queue),
//!   so the suppression entry is reliably in the queue by the time the hook
//!   checks. The queue is bounded by age (200ms) and size (64) — overflow
//!   falls back to pass-through, which is the safe degradation.
//!
//! On NOLEGACY (and why we don't use it):
//!   `RIDEV_NOLEGACY` is per-process. It only stops *our* window from
//!   receiving WM_KEY messages — focused windows still get them. v0.5.0
//!   combined NOLEGACY with SendInput re-injection and ended up doubling
//!   every keystroke (OS delivery + our re-inject). The current design
//!   relies on the global LL hook instead, which is the only way to
//!   suppress per-device system-wide without driver work.
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
        CallNextHookEx, CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW,
        RegisterClassExW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, CW_USEDEFAULT,
        HHOOK, HWND_MESSAGE, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_INPUT, WNDCLASSEXW,
    };
    use std::collections::VecDeque;

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

    /// One entry per recent keystroke from a managed scanner.
    ///
    /// The `WM_INPUT` handler pushes here when it sees a managed device's HID
    /// report. The `WH_KEYBOARD_LL` low-level keyboard hook pops matching
    /// entries to decide whether to suppress the corresponding legacy
    /// `WM_KEY*` event from reaching focused windows.
    ///
    /// Windows fires `WM_INPUT` *before* the low-level hook for the same
    /// physical press (Raw Input lives below the keyboard event queue), so
    /// the entry is reliably in the queue by the time the hook checks.
    #[derive(Debug, Clone, Copy)]
    struct PendingSuppress {
        vk: u16,
        scan_code: u16,
        is_key_up: bool,
        ts: Instant,
    }

    /// Bounded queue of recent managed-scanner keystrokes awaiting suppression.
    /// Pruned by both age (>200ms) and size (cap 64) — bursts longer than that
    /// shouldn't happen for a barcode scan and overflow falls back to
    /// pass-through behavior, which is the safe degradation.
    fn pending_suppress() -> &'static Mutex<VecDeque<PendingSuppress>> {
        static Q: OnceLock<Mutex<VecDeque<PendingSuppress>>> = OnceLock::new();
        Q.get_or_init(|| Mutex::new(VecDeque::with_capacity(64)))
    }

    /// Handle returned by `SetWindowsHookExW`. Kept so `UnhookWindowsHookEx`
    /// can run on teardown (currently unused — module runs for app lifetime).
    static HOOK_HANDLE: OnceLock<Mutex<isize>> = OnceLock::new();

    fn hook_handle() -> &'static Mutex<isize> {
        HOOK_HANDLE.get_or_init(|| Mutex::new(0))
    }

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

            // Register keyboard usage page (1, 6) with INPUTSINK only.
            //
            // Raw Input is used here purely for *device identification* — it
            // tells us which physical keyboard generated each keystroke (via
            // VID/PID), which the legacy WM_KEY pipeline can't.
            //
            // Per-device system-wide suppression is handled by the
            // WH_KEYBOARD_LL hook installed below, *not* by RIDEV_NOLEGACY
            // (which is per-process and would only stop our own window from
            // seeing WM_KEY events — focused apps would still receive them).
            // See the module-level doc comment for the longer story.
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

            // Install a low-level keyboard hook on this same thread. The hook
            // sees every keystroke system-wide and can suppress them by
            // returning non-zero. We use it to drop the WM_KEY* events that
            // correspond to managed-scanner WM_INPUT messages we just
            // observed — that's how the focus-stealing fix is actually
            // achieved (Raw Input alone can't suppress per-device system-wide).
            //
            // The hook MUST run on a thread with a message loop, which is
            // why it's installed here and not in `start_raw_input_capture`.
            let hmod = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                .unwrap_or_default();
            // HMODULE → HINSTANCE conversion (same underlying handle, different newtype).
            let hinst: windows::Win32::Foundation::HINSTANCE = hmod.into();
            match SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_kbd_proc), hinst, 0) {
                Ok(handle) => {
                    *hook_handle().lock().unwrap() = handle.0;
                    log::info!("raw_input_capture: WH_KEYBOARD_LL hook installed");
                }
                Err(e) => {
                    log::error!(
                        "raw_input_capture: SetWindowsHookExW failed: {}. Focus-stealing suppression unavailable.",
                        e
                    );
                    // Continue without the hook — scans still get captured via
                    // WM_INPUT, just no suppression of focused-window typing.
                }
            }

            log::info!("raw_input_capture: started, listening on hidden HWND");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, HWND(0), 0, 0).into() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            // Cleanup on graceful exit (never reached today).
            let h = *hook_handle().lock().unwrap();
            if h != 0 {
                let _ = UnhookWindowsHookEx(HHOOK(h));
            }
        }
    }

    /// Low-level keyboard hook procedure. Runs on the message-loop thread
    /// every time *any* keyboard event happens anywhere in Windows. Must be
    /// fast (default LowLevelHooksTimeout = ~300ms before Windows nukes the
    /// hook) and panic-free — any unwind here freezes keyboard input until
    /// the OS times us out.
    extern "system" fn low_level_kbd_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        // Negative codes mean "must not process, just CallNextHookEx".
        if code < 0 {
            return unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) };
        }

        // SAFETY: lparam points at a KBDLLHOOKSTRUCT for the duration of this
        // callback per Windows API contract.
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let vk = info.vkCode as u16;
        let scan = info.scanCode as u16;

        // wparam is one of WM_KEYDOWN(0x100), WM_KEYUP(0x101), WM_SYSKEYDOWN(0x104),
        // WM_SYSKEYUP(0x105). Bit 0 set = up.
        let is_up = (wparam.0 as u32) & 0x01 != 0;

        // Look for a matching managed entry. We only suppress if it matches
        // the same up/down state — otherwise a real keyboard's down could
        // accidentally swallow a managed device's pending up.
        let suppress = {
            let mut q = pending_suppress().lock().unwrap();
            // Drop anything older than 200ms — those are stale, the matching
            // hook callback must have raced past us (very rare).
            while let Some(front) = q.front() {
                if front.ts.elapsed() > Duration::from_millis(200) {
                    q.pop_front();
                } else {
                    break;
                }
            }
            // Find the oldest matching entry and consume it.
            let pos = q.iter().position(|e| {
                e.vk == vk && e.scan_code == scan && e.is_key_up == is_up
            });
            if let Some(idx) = pos {
                q.remove(idx);
                true
            } else {
                false
            }
        };

        if suppress {
            // Non-zero return value swallows the event — no other app sees it.
            return LRESULT(1);
        }
        unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) }
    }

    /// Push a managed-scanner keystroke so the LL hook can match + suppress it.
    fn enqueue_suppress(vk: u16, scan_code: u16, is_key_up: bool) {
        let mut q = pending_suppress().lock().unwrap();
        if q.len() >= 64 {
            // Drop the oldest to bound the queue. Overflow = pass-through;
            // an unsuppressed key occasionally leaking is preferable to
            // unbounded memory.
            q.pop_front();
        }
        q.push_back(PendingSuppress {
            vk,
            scan_code,
            is_key_up,
            ts: Instant::now(),
        });
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

        const RI_KEY_BREAK: u32 = 0x01;
        let is_key_up = (kb.Flags as u32) & RI_KEY_BREAK != 0;

        let is_managed = match usb {
            Some(id) => managed_ids().lock().unwrap().iter().any(|m| *m == id),
            None => false,
        };

        if !is_managed {
            // Not a managed scanner. We don't enqueue for suppression — the OS
            // routes this keystroke to the focused window normally, which is
            // what we want.
            return;
        }

        // Managed device — tell the low-level keyboard hook to swallow the
        // corresponding WM_KEY* event so it doesn't reach focused apps.
        // Enqueue for BOTH key-down and key-up so the receiving app doesn't
        // see a phantom "key held" event.
        enqueue_suppress(kb.VKey, kb.MakeCode, is_key_up);

        // The rest of the handler only emits on key-down (we accumulate the
        // chip ID as it streams in and flush on Enter / CR / LF).
        if is_key_up {
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
