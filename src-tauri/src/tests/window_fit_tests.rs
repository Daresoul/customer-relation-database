//! The window opens 1200×800. On a 1280×800 or 1366×768 screen its bottom,
//! Save buttons included, sat under the taskbar or off the screen.

use crate::services::app_launch::overflows_screen;

#[test]
fn a_small_screen_cannot_hold_the_window() {
    assert!(overflows_screen((1200, 800), (1280, 800)));
    assert!(overflows_screen((1200, 800), (1366, 768)));
    assert!(overflows_screen((1200, 800), (1024, 900)));
}

#[test]
fn a_usual_desktop_screen_holds_it() {
    assert!(!overflows_screen((1200, 800), (1920, 1080)));
    assert!(!overflows_screen((1200, 800), (1280, 1024)));
}
