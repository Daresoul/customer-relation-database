//! Tauri command bridging React-side telemetry into Rust's structured logger.
//!
//! The React `ErrorBoundary` and `invoke.ts` error wrapper both call this
//! `log_event` command instead of pushing to Loki directly. Routing through
//! Rust gives us:
//! - One credential (in the binary, not the JS bundle)
//! - The same offline-queue semantics as Rust-side events (the line lands
//!   in `vet-clinic.log` first, then the shipper picks it up)
//! - A single Loki stream label set for both frontend and backend telemetry

use serde::Deserialize;
use crate::services::telemetry;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEventInput {
    /// Level as a lowercase string: "error" / "warn" / "info" / "debug" / "trace".
    /// Anything unrecognized falls back to "info" so a malformed frontend call
    /// doesn't silently drop the event.
    pub level: String,
    /// Subsystem classifier (e.g. "react.error_boundary", "tauri.invoke").
    pub subsystem: String,
    pub message: String,
    /// Free-form structured data. Must be a JSON object for fields to be
    /// flattened into the event payload; non-object values are preserved
    /// under an `extras` key.
    #[serde(default)]
    pub extras: serde_json::Value,
}

#[tauri::command]
pub fn log_event(input: LogEventInput) -> Result<(), String> {
    let level = parse_level(&input.level);
    telemetry::event(level, &input.subsystem, &input.message, input.extras);
    Ok(())
}

fn parse_level(s: &str) -> log::Level {
    match s.to_ascii_lowercase().as_str() {
        "error" => log::Level::Error,
        "warn" | "warning" => log::Level::Warn,
        "info" => log::Level::Info,
        "debug" => log::Level::Debug,
        "trace" => log::Level::Trace,
        _ => log::Level::Info,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_level_handles_common_values() {
        assert_eq!(parse_level("error"), log::Level::Error);
        assert_eq!(parse_level("warn"), log::Level::Warn);
        assert_eq!(parse_level("warning"), log::Level::Warn);
        assert_eq!(parse_level("info"), log::Level::Info);
        assert_eq!(parse_level("debug"), log::Level::Debug);
        assert_eq!(parse_level("trace"), log::Level::Trace);
    }

    #[test]
    fn parse_level_is_case_insensitive() {
        assert_eq!(parse_level("ERROR"), log::Level::Error);
        assert_eq!(parse_level("Error"), log::Level::Error);
    }

    #[test]
    fn parse_level_unknown_falls_back_to_info() {
        // Belt-and-suspenders: a malformed frontend call shouldn't drop
        // the event silently. Worst case it lands at the wrong level.
        assert_eq!(parse_level("hyperbolic"), log::Level::Info);
        assert_eq!(parse_level(""), log::Level::Info);
    }
}
