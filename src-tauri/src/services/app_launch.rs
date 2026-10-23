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
