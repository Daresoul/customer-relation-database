//! How the app was started. Launch at login passes `--hidden`, so the app
//! starts in the tray; a manual start and the relaunch after an update pass
//! nothing and show the window.

pub const HIDDEN_ARG: &str = "--hidden";

/// The arguments the login entry starts the app with.
pub fn autostart_args() -> Vec<&'static str> {
    vec![HIDDEN_ARG]
}

/// `argv` as the process got it, program path first.
pub fn starts_hidden(argv: &[String]) -> bool {
    argv.iter().skip(1).any(|a| a == HIDDEN_ARG)
}

/// Room the Windows taskbar takes at the bottom of the screen.
const TASKBAR: u32 = 48;

/// Whether the window, at its configured size, runs off the screen
/// (both in logical pixels).
pub fn overflows_screen(window: (u32, u32), screen: (u32, u32)) -> bool {
    window.0 > screen.0 || window.1 + TASKBAR > screen.1
}
