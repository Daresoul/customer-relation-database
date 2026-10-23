//! The window was hidden on every start, so a manual launch and the
//! relaunch after an update showed nothing (lifecycle.md #5). Only the
//! login start, which carries `--hidden`, starts in the tray.

use crate::services::app_launch::{autostart_args, starts_hidden, HIDDEN_ARG};

fn argv(args: &[&str]) -> Vec<String> {
    std::iter::once("C:\\Program Files\\Arkivet\\Arkivet.exe")
        .chain(args.iter().copied())
        .map(String::from)
        .collect()
}

#[test]
fn launch_at_login_registers_the_hidden_flag() {
    assert_eq!(autostart_args(), vec![HIDDEN_ARG]);
}

#[test]
fn a_start_with_the_hidden_flag_stays_in_the_tray() {
    assert!(starts_hidden(&argv(&["--hidden"])));
}

#[test]
fn a_manual_start_or_an_update_relaunch_shows_the_window() {
    assert!(!starts_hidden(&argv(&[])));
    assert!(!starts_hidden(&argv(&["--other"])));
}

#[test]
fn the_program_path_itself_is_not_read_as_the_flag() {
    assert!(!starts_hidden(&["--hidden".to_string()]));
}
