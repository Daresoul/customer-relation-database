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

        let is_up = kbd_msg_is_key_up(wparam.0 as u32);

        let suppress = {
            let mut q = pending_suppress().lock().unwrap();
            try_consume_suppress(&mut q, vk, scan, is_up, Instant::now())
        };

        if suppress {
            // Non-zero return value swallows the event — no other app sees it.
            return LRESULT(1);
        }
        unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) }
    }

    /// Decode the keyboard-message kind from the LL-hook wparam value.
    /// wparam is one of WM_KEYDOWN (0x100), WM_KEYUP (0x101),
    /// WM_SYSKEYDOWN (0x104), WM_SYSKEYUP (0x105). The low bit is the
    /// up/down discriminant for both regular and SYS variants.
    ///
    /// Extracted as a one-liner function purely so a test can pin the bit
    /// math — inverting this `& 0x01` would silently swap suppression of
    /// every key-down with every key-up, which is exactly the class of bug
    /// that "feels right" until a user holds a key.
    fn kbd_msg_is_key_up(wparam_msg: u32) -> bool {
        wparam_msg & 0x01 != 0
    }

    /// Decide whether a keystroke that just hit the LL hook should be
    /// suppressed. Mutates the queue: prunes stale entries (>200ms) and
    /// consumes the matched one. Extracted as a pure-ish function so it can
    /// be unit-tested without involving Win32 APIs.
    ///
    /// Match criteria: same VK, same scancode, same up/down state. Up/down
    /// matters because a real keyboard's down event shouldn't accidentally
    /// swallow a managed device's pending up.
    fn try_consume_suppress(
        q: &mut VecDeque<PendingSuppress>,
        vk: u16,
        scan_code: u16,
        is_key_up: bool,
        now: Instant,
    ) -> bool {
        // Stale-prune from the front; entries are pushed monotonically.
        while let Some(front) = q.front() {
            if now.duration_since(front.ts) > Duration::from_millis(200) {
                q.pop_front();
            } else {
                break;
            }
        }
        if let Some(idx) = q.iter().position(|e| {
            e.vk == vk && e.scan_code == scan_code && e.is_key_up == is_key_up
        }) {
            q.remove(idx);
            true
        } else {
            false
        }
    }

    /// What `handle_wm_input` should do with a parsed RAWINPUT keyboard
    /// event. Extracting this decision keeps the unsafe Win32 block of
    /// `handle_wm_input` thin and lets tests pin the regression-critical
    /// invariants (non-managed never enqueues; managed always enqueues for
    /// both down AND up; only key-down with a mappable VK accumulates).
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum HandlerAction {
        /// Not a managed scanner — let the OS route to the focused window.
        PassThrough,
        /// Managed device, but not a chip character (key-up, modifier,
        /// function key). Suppress the WM_KEY* but don't accumulate.
        Suppress,
        /// Managed device, key-down, mappable to digit/hex/Enter. Suppress
        /// AND feed `ch` into the per-device buffer.
        SuppressAndChar(char),
    }

    fn classify_handler_action(
        is_managed: bool,
        vk: u16,
        scan_code: u16,
        is_key_up: bool,
    ) -> HandlerAction {
        if !is_managed {
            return HandlerAction::PassThrough;
        }
        if is_key_up {
            return HandlerAction::Suppress;
        }
        match vk_to_char(vk, scan_code) {
            Some(ch) => HandlerAction::SuppressAndChar(ch),
            None => HandlerAction::Suppress,
        }
    }

    /// Append a chip character into the per-device scan buffer. Returns the
    /// completed code if `ch` was Enter (CR / LF) AND the buffer had content.
    ///
    /// Per-device isolation matters: two scanners firing at once must NOT
    /// merge their chip IDs. Stale-reset matters: a half-finished scan must
    /// not splice into the next scan. The 1-second threshold is heuristic
    /// (much longer than any realistic inter-character gap, much shorter
    /// than any user noticing).
    fn accumulate_scan_char(
        buffers: &mut HashMap<isize, ScanBuffer>,
        h_device: isize,
        ch: char,
        now: Instant,
    ) -> Option<String> {
        // Use `or_insert_with` so a fresh buffer's `last_ts` is the passed-in
        // `now` rather than `Instant::now()` of an unrelated moment — keeps
        // the staleness arithmetic deterministic for tests.
        let buf = buffers.entry(h_device).or_insert_with(|| ScanBuffer {
            chars: String::new(),
            last_ts: now,
        });
        if now.duration_since(buf.last_ts) > Duration::from_secs(1) {
            buf.chars.clear();
        }
        buf.last_ts = now;

        if ch == '\r' || ch == '\n' {
            let code = std::mem::take(&mut buf.chars);
            if code.is_empty() {
                None
            } else {
                Some(code)
            }
        } else {
            buf.chars.push(ch);
            None
        }
    }

    /// Push a managed-scanner keystroke so the LL hook can match + suppress it.
    fn enqueue_suppress(vk: u16, scan_code: u16, is_key_up: bool) {
        let mut q = pending_suppress().lock().unwrap();
        enqueue_suppress_into(&mut q, vk, scan_code, is_key_up, Instant::now());
    }

    /// Pure-ish core of `enqueue_suppress`: the bounded-push logic, extracted
    /// so it can be unit-tested without touching the global mutex / clock.
    fn enqueue_suppress_into(
        q: &mut VecDeque<PendingSuppress>,
        vk: u16,
        scan_code: u16,
        is_key_up: bool,
        ts: Instant,
    ) {
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
            ts,
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

        let vk = kb.VKey;
        let scan_code = kb.MakeCode;

        match classify_handler_action(is_managed, vk, scan_code, is_key_up) {
            HandlerAction::PassThrough => {
                // Not a managed scanner. We don't enqueue for suppression — the
                // OS routes this keystroke to the focused window normally,
                // which is what we want.
            }
            HandlerAction::Suppress => {
                // Managed device, but not a chip character (key-up, modifier,
                // function key, etc.). Tell the LL hook to swallow the
                // corresponding WM_KEY* but don't accumulate.
                enqueue_suppress(vk, scan_code, is_key_up);
            }
            HandlerAction::SuppressAndChar(ch) => {
                // Managed device, key-down, mappable character. Suppress AND
                // feed the char into the per-device buffer; flush on Enter.
                enqueue_suppress(vk, scan_code, is_key_up);
                let now = Instant::now();
                let mut buffers = scan_buffers().lock().unwrap();
                let emitted = accumulate_scan_char(&mut buffers, h_device, ch, now);
                drop(buffers);
                if let Some(code) = emitted {
                    emit_scan(&code);
                }
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

        // v0.5.6 diagnostic: log the FIRST time we see each new device handle,
        // showing the raw device path AND the parsed VID/PID. This is the only
        // way to find out what Raw Input actually sees for Bluetooth HID
        // devices — hidapi reports the device's claimed HID-descriptor VID/PID
        // but Raw Input's RIDI_DEVICENAME for BT-routed HID is structured
        // entirely differently and may have a different VID/PID (or none).
        //
        // First-time-only because WM_INPUT fires per-keystroke and we'd
        // otherwise spam the log every keypress for the lifetime of the
        // process. The cache insert below de-duplicates.
        let is_managed_at_parse_time = match parsed {
            Some(id) => managed_ids().lock().unwrap().iter().any(|m| *m == id),
            None => false,
        };
        log::info!(
            "raw_input_capture: new device seen | path='{}' parsed_vid_pid={:?} is_managed={}",
            name, parsed, is_managed_at_parse_time
        );

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

        // ---------------------------------------------------------------
        // try_consume_suppress: the LL-hook decision logic. This is the
        // most safety-critical path — a regression here either lets
        // managed-scanner keystrokes leak into focused apps (focus-steal
        // returns) or wrongly suppresses real-keyboard input (user can't
        // type). Tests cover both directions explicitly.
        // ---------------------------------------------------------------

        fn entry(vk: u16, scan: u16, is_up: bool, ts: Instant) -> PendingSuppress {
            PendingSuppress { vk, scan_code: scan, is_key_up: is_up, ts }
        }

        #[test]
        fn try_consume_suppress_empty_queue_returns_false() {
            let mut q: VecDeque<PendingSuppress> = VecDeque::new();
            let now = Instant::now();
            assert!(!try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty());
        }

        #[test]
        fn try_consume_suppress_matches_and_consumes_entry() {
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, now));
            assert!(try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty(), "matched entry should be consumed");
        }

        #[test]
        fn try_consume_suppress_no_match_when_vk_differs() {
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, now));
            assert!(!try_consume_suppress(&mut q, 0x31, 11, false, now));
            assert_eq!(q.len(), 1, "non-matching candidate must not consume");
        }

        #[test]
        fn try_consume_suppress_no_match_when_scan_differs() {
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, now));
            assert!(!try_consume_suppress(&mut q, 0x30, 12, false, now));
            assert_eq!(q.len(), 1);
        }

        #[test]
        fn try_consume_suppress_no_match_when_up_down_differs() {
            // Up/down must match — a real keyboard's down event must not
            // swallow a managed device's pending key-up entry, or the
            // managed device's up would leak through. (Conversely a real
            // keyboard's up must not swallow a managed down.)
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, true, now)); // managed key-up
            assert!(
                !try_consume_suppress(&mut q, 0x30, 11, false, now),
                "real-keyboard down must not consume managed up"
            );
            assert_eq!(q.len(), 1, "managed up entry must still be queued");
        }

        #[test]
        fn try_consume_suppress_prunes_stale_entries() {
            // 250ms old should be pruned (>200ms threshold).
            let old_ts = Instant::now() - Duration::from_millis(250);
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, old_ts));
            assert!(!try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty(), "stale entry must be pruned even on no match");
        }

        #[test]
        fn try_consume_suppress_keeps_fresh_entries_after_stale_prune() {
            // Front entry is stale, a fresher matching one is behind it.
            let now = Instant::now();
            let old_ts = now - Duration::from_millis(250);
            let mut q = VecDeque::new();
            q.push_back(entry(0xAA, 99, false, old_ts)); // stale, gets pruned
            q.push_back(entry(0x30, 11, false, now));    // fresh, will match
            assert!(try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty());
        }

        #[test]
        fn try_consume_suppress_consumes_oldest_matching_entry_first() {
            // Two entries for the same key (e.g. user scanned the same chip
            // twice fast). The older one should be consumed first so each
            // physical press gets paired with its own LL-hook callback.
            let now = Instant::now();
            let older = now - Duration::from_millis(50);
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, older));
            q.push_back(entry(0x30, 11, false, now));
            assert!(try_consume_suppress(&mut q, 0x30, 11, false, now));
            // The older one was consumed; the fresh one remains.
            assert_eq!(q.len(), 1);
            assert_eq!(q.front().unwrap().ts, now);
        }

        #[test]
        fn try_consume_suppress_matching_paired_down_then_up() {
            // Realistic scenario: scanner sends key-down, OS routes WM_INPUT
            // first (we enqueue down), then LL hook fires for down
            // (suppressed), then WM_INPUT for up, then LL hook for up.
            let t1 = Instant::now();
            let t2 = t1 + Duration::from_millis(5);
            let t3 = t1 + Duration::from_millis(10);
            let t4 = t1 + Duration::from_millis(15);

            let mut q = VecDeque::new();

            // WM_INPUT for key-down arrives
            q.push_back(entry(0x35, 6, false, t1));

            // LL hook for key-down → should suppress
            assert!(try_consume_suppress(&mut q, 0x35, 6, false, t2));
            assert!(q.is_empty(), "down consumed");

            // WM_INPUT for key-up arrives
            q.push_back(entry(0x35, 6, true, t3));

            // LL hook for key-up → should also suppress
            assert!(try_consume_suppress(&mut q, 0x35, 6, true, t4));
            assert!(q.is_empty(), "up consumed");
        }

        #[test]
        fn try_consume_suppress_picks_only_matching_distinct_entry() {
            // Queue contains entries for three distinct keys; only the one
            // matching the LL-hook callback should be consumed.
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, now)); // '0'
            q.push_back(entry(0x31, 2, false, now));  // '1'
            q.push_back(entry(0x32, 3, false, now));  // '2'

            assert!(try_consume_suppress(&mut q, 0x31, 2, false, now));
            assert_eq!(q.len(), 2);
            // Verify the consumed entry was the middle one — others remain.
            assert!(q.iter().any(|e| e.vk == 0x30));
            assert!(q.iter().any(|e| e.vk == 0x32));
            assert!(!q.iter().any(|e| e.vk == 0x31));
        }

        #[test]
        fn try_consume_suppress_at_exactly_200ms_keeps_entry() {
            // Boundary: prune condition is `> 200ms`, so exactly 200ms must
            // NOT prune. A scanner whose WM_INPUT-to-LL-hook latency lands on
            // the boundary still needs its suppression.
            let now = Instant::now();
            let exactly_at_threshold = now - Duration::from_millis(200);
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, exactly_at_threshold));
            assert!(try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty());
        }

        #[test]
        fn try_consume_suppress_one_ms_past_threshold_prunes() {
            // Complement of the above: 201ms IS pruned.
            let now = Instant::now();
            let just_past = now - Duration::from_millis(201);
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, just_past));
            assert!(!try_consume_suppress(&mut q, 0x30, 11, false, now));
            assert!(q.is_empty(), "stale entry must be pruned");
        }

        #[test]
        fn try_consume_suppress_prunes_multiple_stale_at_front() {
            // Three stale entries at front, one fresh non-matching behind.
            // All three should prune in a single call; the fresh one stays.
            let now = Instant::now();
            let stale = now - Duration::from_millis(500);
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, stale));
            q.push_back(entry(0x31, 2, false, stale));
            q.push_back(entry(0x32, 3, false, stale));
            q.push_back(entry(0x33, 4, false, now)); // fresh, non-matching

            assert!(!try_consume_suppress(&mut q, 0xAA, 99, false, now));
            assert_eq!(q.len(), 1, "stale entries pruned, fresh one kept");
            assert_eq!(q.front().unwrap().vk, 0x33);
        }

        #[test]
        fn try_consume_suppress_stale_entries_in_middle_not_pruned() {
            // The prune loop only walks the front. If a stale entry is
            // sandwiched between fresh ones (which shouldn't happen given
            // monotonic pushes, but is a worth documenting), it survives.
            // This locks in the algorithm's actual behavior so a future
            // refactor doesn't silently change it.
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x30, 11, false, now));
            q.push_back(entry(0x31, 2, false, now - Duration::from_millis(500))); // stale, but not at front
            q.push_back(entry(0x32, 3, false, now));

            // Non-matching probe — triggers prune from front (none stale at front).
            assert!(!try_consume_suppress(&mut q, 0xAA, 99, false, now));
            assert_eq!(q.len(), 3, "front-only prune leaves middle stale entry");
        }

        #[test]
        fn try_consume_suppress_real_keyboard_passes_through_with_pending_scanner() {
            // Critical safety property: while scanner suppression is pending
            // for key '5', a real-keyboard press of '4' must NOT be consumed.
            // (If it were, the user's typing would silently vanish.)
            let now = Instant::now();
            let mut q = VecDeque::new();
            q.push_back(entry(0x35, 6, false, now)); // scanner has '5' pending

            assert!(
                !try_consume_suppress(&mut q, 0x34, 5, false, now),
                "real-keyboard '4' must not be swallowed by scanner '5' pending"
            );
            assert_eq!(q.len(), 1, "scanner's '5' still pending for its own hook callback");
        }

        // ---------------------------------------------------------------
        // enqueue_suppress_into: bounded-queue push logic. The cap (64) and
        // the FIFO drop-oldest behavior are how this module degrades
        // gracefully under burst — an unsuppressed key leaking is far
        // better than unbounded memory growth on a stuck LL-hook callback.
        // ---------------------------------------------------------------

        #[test]
        fn enqueue_suppress_into_appends_to_back() {
            let mut q = VecDeque::new();
            let ts = Instant::now();
            enqueue_suppress_into(&mut q, 0x30, 11, false, ts);
            enqueue_suppress_into(&mut q, 0x31, 2, false, ts);
            assert_eq!(q.len(), 2);
            assert_eq!(q.front().unwrap().vk, 0x30);
            assert_eq!(q.back().unwrap().vk, 0x31);
        }

        #[test]
        fn enqueue_suppress_into_under_cap_does_not_drop() {
            let mut q = VecDeque::new();
            let ts = Instant::now();
            for i in 0..63u16 {
                enqueue_suppress_into(&mut q, i + 0x30, i, false, ts);
            }
            assert_eq!(q.len(), 63, "63 entries fit under the 64 cap");
            assert_eq!(q.front().unwrap().vk, 0x30, "oldest still at front");
        }

        #[test]
        fn enqueue_suppress_into_at_cap_drops_oldest() {
            // Fill to exactly 64 (the cap), then push one more. The oldest
            // (vk=0x30) must be dropped, and the new one appended at the back.
            let mut q = VecDeque::new();
            let ts = Instant::now();
            for i in 0..64u16 {
                enqueue_suppress_into(&mut q, i + 0x30, i, false, ts);
            }
            assert_eq!(q.len(), 64, "filled to cap");

            enqueue_suppress_into(&mut q, 0xFF, 999, true, ts);
            assert_eq!(q.len(), 64, "size stays bounded after overflow");
            assert_eq!(
                q.front().unwrap().vk,
                0x31,
                "oldest dropped, what was second now leads"
            );
            assert_eq!(q.back().unwrap().vk, 0xFF, "newest at back");
            assert_eq!(q.back().unwrap().is_key_up, true);
        }

        #[test]
        fn enqueue_suppress_into_handles_large_burst() {
            // Burst of 200 keystrokes — would overflow ~3x. Queue stays
            // bounded; only the latest 64 survive.
            let mut q = VecDeque::new();
            let ts = Instant::now();
            for i in 0..200u16 {
                enqueue_suppress_into(&mut q, i, i, false, ts);
            }
            assert_eq!(q.len(), 64, "bounded under 3x burst");
            // After 200 pushes with cap=64, the front entry should be the
            // 137th push (200 - 64 + 1 = 137th 0-indexed pushed value 136).
            assert_eq!(q.front().unwrap().vk, 200 - 64);
            assert_eq!(q.back().unwrap().vk, 199);
        }

        #[test]
        fn enqueue_suppress_into_preserves_timestamps() {
            // The LL hook prunes by `ts`, so the field must round-trip exactly.
            let mut q = VecDeque::new();
            let t1 = Instant::now();
            let t2 = t1 + Duration::from_millis(10);
            enqueue_suppress_into(&mut q, 0x30, 11, false, t1);
            enqueue_suppress_into(&mut q, 0x31, 2, true, t2);
            assert_eq!(q.front().unwrap().ts, t1);
            assert_eq!(q.back().unwrap().ts, t2);
            assert_eq!(q.back().unwrap().is_key_up, true);
        }

        // ---------------------------------------------------------------
        // Full-cycle scenario tests — combine enqueue + consume to verify
        // realistic scanner flows behave as intended end-to-end (at the
        // logic level; not the Win32 callback level).
        // ---------------------------------------------------------------

        #[test]
        fn full_cycle_simulates_short_chipid_scan() {
            // Scanner emits "5A" + Enter; that's three characters, each with
            // down+up → six WM_INPUT events. The LL hook fires six matching
            // callbacks (one for each WM_KEY*) and must consume all of them.
            let mut q = VecDeque::new();
            let t0 = Instant::now();

            // VK codes for '5' (0x35), 'A' (0x41), Enter (0x0D)
            let presses = [(0x35u16, 6u16), (0x41u16, 30u16), (0x0Du16, 28u16)];

            for (i, (vk, scan)) in presses.iter().enumerate() {
                let ts = t0 + Duration::from_millis(i as u64 * 10);
                // WM_INPUT for down
                enqueue_suppress_into(&mut q, *vk, *scan, false, ts);
                // WM_INPUT for up
                enqueue_suppress_into(
                    &mut q,
                    *vk,
                    *scan,
                    true,
                    ts + Duration::from_millis(2),
                );
            }
            assert_eq!(q.len(), 6, "3 chars × down+up");

            // LL hook fires in the same order; all should suppress.
            for (i, (vk, scan)) in presses.iter().enumerate() {
                let ts = t0 + Duration::from_millis(i as u64 * 10 + 1);
                assert!(
                    try_consume_suppress(&mut q, *vk, *scan, false, ts),
                    "down callback for {:#x} must suppress",
                    vk
                );
                assert!(
                    try_consume_suppress(
                        &mut q,
                        *vk,
                        *scan,
                        true,
                        ts + Duration::from_millis(3)
                    ),
                    "up callback for {:#x} must suppress",
                    vk
                );
            }
            assert!(q.is_empty(), "all scanner keystrokes consumed");
        }

        #[test]
        fn full_cycle_interleaves_scanner_and_real_keyboard() {
            // Scanner '5' fires (enqueued), THEN user types '4' on real
            // keyboard, THEN scanner LL-hook fires for '5'. The '4' should
            // pass through; '5' should suppress; neither should affect the
            // other.
            let mut q = VecDeque::new();
            let t0 = Instant::now();

            // Scanner WM_INPUT for '5' down
            enqueue_suppress_into(&mut q, 0x35, 6, false, t0);

            // LL hook for real-keyboard '4' down — no match, pass through
            assert!(
                !try_consume_suppress(&mut q, 0x34, 5, false, t0 + Duration::from_millis(1)),
                "real '4' must pass through"
            );
            assert_eq!(q.len(), 1, "scanner '5' still pending");

            // LL hook for scanner '5' down — must suppress
            assert!(
                try_consume_suppress(&mut q, 0x35, 6, false, t0 + Duration::from_millis(2)),
                "scanner '5' must be consumed"
            );
            assert!(q.is_empty());

            // LL hook for real-keyboard '4' up — no match, pass through
            assert!(
                !try_consume_suppress(&mut q, 0x34, 5, true, t0 + Duration::from_millis(3)),
                "real '4' up must also pass through"
            );
        }

        #[test]
        fn full_cycle_two_scanners_concurrent_no_crosstalk() {
            // Two managed scanners both scan at the same moment. As long as
            // their keystrokes have distinct (vk,scan,up) tuples, queue order
            // doesn't matter — the LL hook will pair each up with the right
            // enqueue. (If their keys happen to collide, FIFO order
            // guarantees the oldest is consumed first — see the
            // "oldest matching" test.)
            let mut q = VecDeque::new();
            let t0 = Instant::now();

            // Scanner A: '5' down
            enqueue_suppress_into(&mut q, 0x35, 6, false, t0);
            // Scanner B: 'A' down (different vk)
            enqueue_suppress_into(&mut q, 0x41, 30, false, t0 + Duration::from_millis(1));

            // LL hook fires in same order
            assert!(try_consume_suppress(&mut q, 0x35, 6, false, t0 + Duration::from_millis(2)));
            assert!(try_consume_suppress(&mut q, 0x41, 30, false, t0 + Duration::from_millis(3)));
            assert!(q.is_empty());
        }

        // ---------------------------------------------------------------
        // Additional parse_vid_pid edge cases
        // ---------------------------------------------------------------

        #[test]
        fn parses_only_vid_present_returns_none() {
            // Some hot-plug events may emit partial device names before
            // enumeration completes. Without PID we can't manage the device.
            assert_eq!(
                parse_vid_pid(r"\\?\HID#VID_05AC&MI_01#abc#{xyz}"),
                None
            );
        }

        #[test]
        fn parses_only_pid_present_returns_none() {
            // Equally, PID alone with no VID is unusable.
            assert_eq!(
                parse_vid_pid(r"\\?\HID#PID_022C&MI_01#abc#{xyz}"),
                None
            );
        }

        #[test]
        fn parses_invalid_hex_chars_returns_none() {
            // "GGGG" is not valid hex — must fail rather than guess.
            assert_eq!(
                parse_vid_pid(r"\\?\HID#VID_GGGG&PID_022C&MI_00#abc#{xyz}"),
                None
            );
            assert_eq!(
                parse_vid_pid(r"\\?\HID#VID_05AC&PID_ZZZZ&MI_00#abc#{xyz}"),
                None
            );
        }

        #[test]
        fn parses_first_match_when_multiple_vid_pid_substrings() {
            // Pathological case: somehow "vid_" appears twice in the path
            // (e.g., in the GUID portion). We use first match for both, which
            // is fine as long as the convention holds (VID/PID come right
            // after `HID#`).
            let name = r"\\?\HID#VID_05AC&PID_022C&MI_00#vid_FFFF&pid_FFFF#{xyz}";
            assert_eq!(parse_vid_pid(name), Some(UsbId { vid: 0x05AC, pid: 0x022C }));
        }

        #[test]
        fn parses_truncated_vid_pid_uses_what_is_there() {
            // Documented behavior: we `take(4)` from the position after VID_,
            // so a short input is interpreted as a short hex value. Not ideal
            // but harmless — such a string is unlikely to ever match a real
            // managed scanner's VID/PID, so it just falls through to
            // pass-through behavior.
            //
            // Locking this in so we notice if a future refactor tightens the
            // parser (which would be fine, but should be a deliberate change).
            assert_eq!(
                parse_vid_pid("VID_05AC&PID_02"),
                Some(UsbId { vid: 0x05AC, pid: 0x0002 })
            );
        }

        #[test]
        fn parses_real_world_w91b_microchip_scanner_path() {
            // Representative W91B paired path captured from Windows. The
            // exact GUID varies but the prefix structure is stable.
            let name = r"\\?\HID#VID_05AC&PID_022C&MI_00&Col01#7&1234abcd&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}";
            assert_eq!(
                parse_vid_pid(name),
                Some(UsbId { vid: 0x05AC, pid: 0x022C })
            );
        }

        // ---------------------------------------------------------------
        // vk_to_char additional boundary cases
        // ---------------------------------------------------------------

        #[test]
        fn vk_to_char_returns_none_just_below_digit_range() {
            assert_eq!(vk_to_char(0x2F, 0), None); // one below '0'
        }

        #[test]
        fn vk_to_char_returns_none_just_above_digit_range() {
            assert_eq!(vk_to_char(0x3A, 0), None); // one above '9' (':')
        }

        #[test]
        fn vk_to_char_returns_none_just_above_hex_letter_range() {
            assert_eq!(vk_to_char(0x47, 0), None); // 'G'
            assert_eq!(vk_to_char(0x5A, 0), None); // 'Z'
        }

        #[test]
        fn vk_to_char_returns_none_for_numpad_operators() {
            // Numpad punctuation keys must NOT be misinterpreted as digits.
            // VK_MULTIPLY = 0x6A, VK_ADD = 0x6B, VK_SUBTRACT = 0x6D,
            // VK_DECIMAL = 0x6E, VK_DIVIDE = 0x6F — all just above the
            // numpad-digit range (0x60..0x69) we map.
            assert_eq!(vk_to_char(0x6A, 0), None);
            assert_eq!(vk_to_char(0x6B, 0), None);
            assert_eq!(vk_to_char(0x6D, 0), None);
            assert_eq!(vk_to_char(0x6E, 0), None);
            assert_eq!(vk_to_char(0x6F, 0), None);
        }

        #[test]
        fn vk_to_char_returns_none_for_function_keys() {
            // VK_F1..VK_F12 = 0x70..0x7B — well outside any range we care about.
            for vk in 0x70..=0x7Bu16 {
                assert_eq!(vk_to_char(vk, 0), None, "VK_F? = {:#x} must be None", vk);
            }
        }

        #[test]
        fn vk_to_char_matches_ascii_for_full_digit_range() {
            // Every digit 0..9 should round-trip to the matching ASCII char.
            for (i, vk) in (0x30..=0x39u16).enumerate() {
                let expected = char::from_u32('0' as u32 + i as u32).unwrap();
                assert_eq!(vk_to_char(vk, 0), Some(expected));
            }
        }

        #[test]
        fn vk_to_char_matches_ascii_for_full_hex_letter_range() {
            for (i, vk) in (0x41..=0x46u16).enumerate() {
                let expected = char::from_u32('A' as u32 + i as u32).unwrap();
                assert_eq!(vk_to_char(vk, 0), Some(expected));
            }
        }

        #[test]
        fn vk_to_char_numpad_digits_match_main_digits() {
            // VK_NUMPAD0 ('0') and VK_0 ('0') must produce identical chars
            // — barcode scanners commonly emit numpad codes regardless of
            // Num Lock state, and the scan ID must match either way.
            for i in 0..10u16 {
                assert_eq!(vk_to_char(0x30 + i, 0), vk_to_char(0x60 + i, 0));
            }
        }

        // ---------------------------------------------------------------
        // UTF-16 helper
        // ---------------------------------------------------------------

        #[test]
        fn wide_terminates_with_null() {
            assert_eq!(wide(""), vec![0u16]);
            let s = wide("A");
            assert_eq!(s.last(), Some(&0u16));
        }

        #[test]
        fn wide_encodes_ascii_one_to_one() {
            assert_eq!(wide("ABC"), vec![0x41, 0x42, 0x43, 0x00]);
        }

        #[test]
        fn wide_encodes_class_name_as_used_by_module() {
            // Smoke test using the actual constant the module passes to
            // RegisterClassExW. If anything ever silently breaks UTF-16
            // encoding, this will catch it.
            let encoded = wide("VetClinicRawInputSinkClass");
            assert_eq!(encoded.first(), Some(&(b'V' as u16)));
            assert_eq!(encoded.last(), Some(&0u16));
            // 26 chars + null terminator
            assert_eq!(encoded.len(), 27);
        }

        // ---------------------------------------------------------------
        // kbd_msg_is_key_up: the bit math for decoding the LL hook's
        // wparam. Trivial as code, but a SHIFT from `& 0x01` to something
        // else (e.g., `& 0x02`, or accidentally inverting with `== 0`)
        // would silently swap every suppressed key-down with key-up. Pin
        // the exact contract with the four wparam values Windows uses.
        // ---------------------------------------------------------------

        #[test]
        fn kbd_msg_decodes_wm_keydown_as_down() {
            // WM_KEYDOWN = 0x0100
            assert_eq!(kbd_msg_is_key_up(0x0100), false);
        }

        #[test]
        fn kbd_msg_decodes_wm_keyup_as_up() {
            // WM_KEYUP = 0x0101
            assert_eq!(kbd_msg_is_key_up(0x0101), true);
        }

        #[test]
        fn kbd_msg_decodes_wm_syskeydown_as_down() {
            // WM_SYSKEYDOWN = 0x0104 (used for Alt+key combos)
            assert_eq!(kbd_msg_is_key_up(0x0104), false);
        }

        #[test]
        fn kbd_msg_decodes_wm_syskeyup_as_up() {
            // WM_SYSKEYUP = 0x0105
            assert_eq!(kbd_msg_is_key_up(0x0105), true);
        }

        // ---------------------------------------------------------------
        // classify_handler_action: the heart of the focus-stealing fix.
        // The "double letter everywhere when the app is open" regression
        // from v0.5.0 would manifest here as the wrong action returned —
        // either suppressing non-managed devices (real keyboards stop
        // working) or pass-through for managed ones (focus-steal returns).
        // Every branch gets explicit coverage.
        // ---------------------------------------------------------------

        #[test]
        fn classify_non_managed_key_down_is_pass_through() {
            // Critical safety property: a real keyboard's '5' down must
            // never be intercepted. If this regressed, the LL hook would
            // start swallowing user typing system-wide.
            assert_eq!(
                classify_handler_action(false, 0x35, 6, false),
                HandlerAction::PassThrough
            );
        }

        #[test]
        fn classify_non_managed_key_up_is_pass_through() {
            // Same property for key-up — if we falsely enqueued non-managed
            // ups, real keyboards would produce "stuck key" symptoms (down
            // delivered, up swallowed).
            assert_eq!(
                classify_handler_action(false, 0x35, 6, true),
                HandlerAction::PassThrough
            );
        }

        #[test]
        fn classify_non_managed_enter_is_pass_through() {
            // Even Enter from a real keyboard must pass through. (Without
            // this, hitting Enter in Notepad would silently vanish.)
            assert_eq!(
                classify_handler_action(false, 0x0D, 28, false),
                HandlerAction::PassThrough
            );
        }

        #[test]
        fn classify_managed_key_down_digit_suppresses_and_accumulates() {
            assert_eq!(
                classify_handler_action(true, 0x35, 6, false),
                HandlerAction::SuppressAndChar('5')
            );
        }

        #[test]
        fn classify_managed_key_down_hex_letter_suppresses_and_accumulates() {
            assert_eq!(
                classify_handler_action(true, 0x41, 30, false),
                HandlerAction::SuppressAndChar('A')
            );
        }

        #[test]
        fn classify_managed_key_down_numpad_suppresses_and_accumulates() {
            // Some scanners emit numpad scancodes regardless of Num Lock —
            // VK_NUMPAD5 (0x65) must still resolve to '5'.
            assert_eq!(
                classify_handler_action(true, 0x65, 0, false),
                HandlerAction::SuppressAndChar('5')
            );
        }

        #[test]
        fn classify_managed_key_down_enter_suppresses_and_accumulates_cr() {
            // Enter from a managed device must still produce a char (CR)
            // so accumulate_scan_char can use it as the terminator. If
            // this regressed to Suppress, scans would never flush.
            assert_eq!(
                classify_handler_action(true, 0x0D, 28, false),
                HandlerAction::SuppressAndChar('\r')
            );
        }

        #[test]
        fn classify_managed_key_up_suppresses_without_char() {
            // Key-up must still suppress (otherwise focused apps would see
            // a phantom "key held forever" event), but must NOT accumulate
            // (otherwise the buffer would have each char twice).
            assert_eq!(
                classify_handler_action(true, 0x35, 6, true),
                HandlerAction::Suppress
            );
        }

        #[test]
        fn classify_managed_key_up_enter_suppresses_without_char() {
            // Even the Enter's key-up shouldn't trigger a flush. The flush
            // happens on Enter's key-down. (If both fired flushes, we'd
            // emit each scan twice.)
            assert_eq!(
                classify_handler_action(true, 0x0D, 28, true),
                HandlerAction::Suppress
            );
        }

        #[test]
        fn classify_managed_key_down_modifier_suppresses_without_char() {
            // VK_SHIFT (0x10) — managed device pressing Shift should still
            // be suppressed (so it doesn't leak to focused apps) but isn't
            // a chip character.
            assert_eq!(
                classify_handler_action(true, 0x10, 42, false),
                HandlerAction::Suppress
            );
        }

        #[test]
        fn classify_managed_key_down_function_key_suppresses_without_char() {
            // VK_F1 (0x70). Same as modifier — suppress but no accumulate.
            assert_eq!(
                classify_handler_action(true, 0x70, 0, false),
                HandlerAction::Suppress
            );
        }

        #[test]
        fn classify_managed_key_down_letter_outside_hex_suppresses_without_char() {
            // VK_G (0x47) — outside the hex letter range. Some scanners
            // might emit unexpected chars for misreads; we still need to
            // suppress so the focused app doesn't see them.
            assert_eq!(
                classify_handler_action(true, 0x47, 34, false),
                HandlerAction::Suppress
            );
        }

        // ---------------------------------------------------------------
        // accumulate_scan_char: per-device buffer state machine. The
        // properties under test are the ones a real bug would violate:
        // - Two scanners scanning simultaneously must not splice their IDs
        // - A half-finished scan must reset after staleness (>1s) so the
        //   next scan starts clean
        // - Enter on an empty buffer must NOT emit (or we'd send "" to
        //   the frontend on stray Enter keys)
        // - Both CR and LF terminate (different scanners use different
        //   line endings)
        // ---------------------------------------------------------------

        #[test]
        fn accumulate_first_char_no_emit() {
            let mut bufs = HashMap::new();
            let t = Instant::now();
            assert_eq!(accumulate_scan_char(&mut bufs, 1, '5', t), None);
            assert_eq!(bufs.get(&1).unwrap().chars, "5");
        }

        #[test]
        fn accumulate_multiple_chars_no_emit_until_enter() {
            let mut bufs = HashMap::new();
            let t = Instant::now();
            assert_eq!(accumulate_scan_char(&mut bufs, 1, '9', t), None);
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '8', t + Duration::from_millis(10)),
                None
            );
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '5', t + Duration::from_millis(20)),
                None
            );
            assert_eq!(bufs.get(&1).unwrap().chars, "985");
        }

        #[test]
        fn accumulate_enter_emits_buffer_and_clears() {
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '9', t);
            accumulate_scan_char(&mut bufs, 1, '8', t + Duration::from_millis(5));
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\r', t + Duration::from_millis(10)),
                Some("98".to_string())
            );
            // Buffer is empty after flush; next scan starts fresh.
            assert_eq!(bufs.get(&1).unwrap().chars, "");
        }

        #[test]
        fn accumulate_newline_also_emits() {
            // Some scanners use LF instead of CR. Both must flush.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, 'A', t);
            accumulate_scan_char(&mut bufs, 1, 'B', t + Duration::from_millis(5));
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\n', t + Duration::from_millis(10)),
                Some("AB".to_string())
            );
        }

        #[test]
        fn accumulate_enter_with_empty_buffer_returns_none() {
            // Stray Enter (e.g., scanner fires Enter without preceding
            // chars due to mis-scan or noise) must NOT emit an empty code.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            assert_eq!(accumulate_scan_char(&mut bufs, 1, '\r', t), None);
            assert_eq!(bufs.get(&1).unwrap().chars, "");
        }

        #[test]
        fn accumulate_stale_buffer_resets_before_appending() {
            // Vet scans half a chip, gets distracted for 2s, then a new
            // scan starts. The new scan must NOT have leftover chars from
            // the interrupted one.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '1', t);
            accumulate_scan_char(&mut bufs, 1, '2', t + Duration::from_millis(50));
            accumulate_scan_char(&mut bufs, 1, '3', t + Duration::from_millis(100));
            assert_eq!(bufs.get(&1).unwrap().chars, "123");

            // 2 seconds later — well past the 1s threshold — next char.
            // Buffer must reset to just this char.
            let later = t + Duration::from_secs(2);
            assert_eq!(accumulate_scan_char(&mut bufs, 1, '9', later), None);
            assert_eq!(bufs.get(&1).unwrap().chars, "9");
        }

        #[test]
        fn accumulate_just_under_stale_threshold_keeps_buffer() {
            // 900ms gap — under the 1s threshold — buffer must continue.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '1', t);
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '2', t + Duration::from_millis(900)),
                None
            );
            assert_eq!(bufs.get(&1).unwrap().chars, "12");
        }

        #[test]
        fn accumulate_exactly_at_stale_threshold_keeps_buffer() {
            // Boundary: condition is `> 1s`, so exactly 1s keeps the buffer.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '1', t);
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '2', t + Duration::from_secs(1)),
                None
            );
            assert_eq!(bufs.get(&1).unwrap().chars, "12");
        }

        #[test]
        fn accumulate_one_ms_past_stale_threshold_resets_buffer() {
            // Complement: 1001ms IS over the threshold.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '1', t);
            assert_eq!(
                accumulate_scan_char(
                    &mut bufs,
                    1,
                    '2',
                    t + Duration::from_millis(1001),
                ),
                None
            );
            assert_eq!(bufs.get(&1).unwrap().chars, "2", "stale → reset");
        }

        #[test]
        fn accumulate_two_devices_keep_separate_buffers() {
            // Critical no-crosstalk property: two scanners scanning at
            // overlapping times must produce two independent chip IDs.
            let mut bufs = HashMap::new();
            let t = Instant::now();
            accumulate_scan_char(&mut bufs, 1, '1', t);
            accumulate_scan_char(&mut bufs, 2, 'A', t + Duration::from_millis(1));
            accumulate_scan_char(&mut bufs, 1, '2', t + Duration::from_millis(2));
            accumulate_scan_char(&mut bufs, 2, 'B', t + Duration::from_millis(3));
            accumulate_scan_char(&mut bufs, 1, '3', t + Duration::from_millis(4));

            assert_eq!(bufs.get(&1).unwrap().chars, "123");
            assert_eq!(bufs.get(&2).unwrap().chars, "AB");

            // Enter from device 1 flushes only its buffer.
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\r', t + Duration::from_millis(5)),
                Some("123".to_string())
            );
            // Device 2's buffer is untouched.
            assert_eq!(bufs.get(&2).unwrap().chars, "AB");

            // Enter from device 2 now flushes its buffer.
            assert_eq!(
                accumulate_scan_char(&mut bufs, 2, '\n', t + Duration::from_millis(6)),
                Some("AB".to_string())
            );
        }

        #[test]
        fn accumulate_back_to_back_scans_same_device_dont_merge() {
            // Realistic scenario: same scanner, two chips in quick succession
            // (vet scans chip A, presses Enter, scans chip B, presses Enter).
            // Each emit must be independent — the second chip ID must not
            // have leftover chars from the first.
            let mut bufs = HashMap::new();
            let t = Instant::now();

            // First scan: "12" + Enter
            accumulate_scan_char(&mut bufs, 1, '1', t);
            accumulate_scan_char(&mut bufs, 1, '2', t + Duration::from_millis(10));
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\r', t + Duration::from_millis(20)),
                Some("12".to_string())
            );

            // Second scan: "34" + Enter (only 100ms later — well under stale)
            accumulate_scan_char(&mut bufs, 1, '3', t + Duration::from_millis(120));
            accumulate_scan_char(&mut bufs, 1, '4', t + Duration::from_millis(130));
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\r', t + Duration::from_millis(140)),
                Some("34".to_string()),
                "second scan must NOT include first scan's chars"
            );
        }

        #[test]
        fn accumulate_realistic_fdxb_15_char_chip_id() {
            // FDX-B microchip ID is 15 hex digits + Enter. Verify the full
            // sequence accumulates and emits intact.
            let mut bufs = HashMap::new();
            let t0 = Instant::now();
            let chip_id = "900164001234567";

            for (i, ch) in chip_id.chars().enumerate() {
                let ts = t0 + Duration::from_millis(i as u64 * 5);
                assert_eq!(accumulate_scan_char(&mut bufs, 1, ch, ts), None);
            }

            let enter_ts = t0 + Duration::from_millis(chip_id.len() as u64 * 5);
            assert_eq!(
                accumulate_scan_char(&mut bufs, 1, '\r', enter_ts),
                Some(chip_id.to_string())
            );
        }

        // ---------------------------------------------------------------
        // Combined: classify → accumulate end-to-end. Walks a realistic
        // RAWINPUT sequence through both layers to verify the integration
        // boundary (the spot handle_wm_input wires them together).
        // ---------------------------------------------------------------

        #[test]
        fn end_to_end_managed_scan_classify_then_accumulate() {
            // Scanner emits chip "5A" then Enter. Each press is a down
            // followed by an up. Walk every event through classify, then
            // (for SuppressAndChar) through accumulate. Verify the final
            // emission is correct AND that key-up events don't accumulate.
            let mut bufs = HashMap::new();
            let t0 = Instant::now();

            // Each entry: (vk, scan, is_up, expected_action)
            let events = [
                (0x35u16, 6u16, false, HandlerAction::SuppressAndChar('5')),
                (0x35u16, 6u16, true, HandlerAction::Suppress),
                (0x41u16, 30u16, false, HandlerAction::SuppressAndChar('A')),
                (0x41u16, 30u16, true, HandlerAction::Suppress),
                (0x0Du16, 28u16, false, HandlerAction::SuppressAndChar('\r')),
                (0x0Du16, 28u16, true, HandlerAction::Suppress),
            ];

            let mut emitted: Option<String> = None;
            for (i, (vk, scan, is_up, expected)) in events.iter().enumerate() {
                let action = classify_handler_action(true, *vk, *scan, *is_up);
                assert_eq!(action, *expected, "event #{} action mismatch", i);

                if let HandlerAction::SuppressAndChar(ch) = action {
                    let ts = t0 + Duration::from_millis(i as u64 * 5);
                    if let Some(code) = accumulate_scan_char(&mut bufs, 99, ch, ts) {
                        assert!(emitted.is_none(), "must not emit twice");
                        emitted = Some(code);
                    }
                }
            }

            assert_eq!(emitted, Some("5A".to_string()));
        }

        #[test]
        fn end_to_end_non_managed_never_accumulates() {
            // Critical regression test for the focus-stealing fix: when
            // a non-managed keyboard fires the EXACT same key sequence as
            // a chip scan, none of it should accumulate into any buffer.
            // (If it did, the user typing "5A<Enter>" on a real keyboard
            // would mysteriously become a scan event.)
            //
            // Explicit type annotation: no call to accumulate_scan_char in
            // this test (that's the whole point) means inference can't
            // pin K/V from usage. Spell out the same signature
            // accumulate_scan_char expects.
            let bufs: HashMap<isize, ScanBuffer> = HashMap::new();

            let events = [
                (0x35u16, 6u16, false),
                (0x35u16, 6u16, true),
                (0x41u16, 30u16, false),
                (0x41u16, 30u16, true),
                (0x0Du16, 28u16, false),
                (0x0Du16, 28u16, true),
            ];

            for (vk, scan, is_up) in events {
                let action = classify_handler_action(false, vk, scan, is_up);
                assert_eq!(
                    action,
                    HandlerAction::PassThrough,
                    "non-managed must always pass through"
                );
                // Intentional: NO call to accumulate_scan_char — production
                // handler only accumulates for SuppressAndChar, and we're
                // verifying the buffer stays untouched.
            }

            assert!(bufs.is_empty(), "non-managed must never touch any buffer");
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
