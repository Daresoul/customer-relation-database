//! Tells a crash, a power cut or a killed process apart from a clean exit.
//! A marker file is written when the app starts and removed when it quits
//! cleanly. Still there at the next start means the last session ended
//! unexpectedly, unless the version changed (the updater ends the old
//! version itself).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

const MARKER_FILE: &str = "session.lock";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreviousSession {
    EndedCleanly,
    EndedUnexpectedly { version: String, started_at: String },
    EndedForUpdate { from_version: String },
}

#[derive(Serialize, Deserialize)]
struct Marker {
    version: String,
    started_at: String,
}

/// Reads what the last session left behind, then writes this session's
/// marker. A marker that can't be written is logged; it only costs the
/// next start its check.
pub fn begin_session(dir: &Path, version: &str, now: DateTime<Utc>) -> PreviousSession {
    let path = dir.join(MARKER_FILE);
    let previous = match std::fs::read_to_string(&path) {
        Err(_) => PreviousSession::EndedCleanly,
        Ok(text) => match serde_json::from_str::<Marker>(&text) {
            Ok(m) if m.version != version => PreviousSession::EndedForUpdate { from_version: m.version },
            Ok(m) => PreviousSession::EndedUnexpectedly { version: m.version, started_at: m.started_at },
            Err(_) => PreviousSession::EndedUnexpectedly {
                version: "unknown".to_string(),
                started_at: "unknown".to_string(),
            },
        },
    };
    let marker = Marker { version: version.to_string(), started_at: now.to_rfc3339() };
    let written = std::fs::create_dir_all(dir)
        .and_then(|_| std::fs::write(&path, serde_json::to_vec(&marker).unwrap_or_default()));
    if let Err(e) = written {
        log::warn!("Session marker not written ({}): {}", path.display(), e);
    }
    previous
}

/// Called on a clean exit.
pub fn end_session(dir: &Path) {
    let _ = std::fs::remove_file(dir.join(MARKER_FILE));
}

/// Logs how the previous session ended, as a telemetry event.
pub fn report_previous_session(previous: &PreviousSession) {
    match previous {
        PreviousSession::EndedCleanly => {}
        PreviousSession::EndedForUpdate { from_version } => crate::services::telemetry::event(
            log::Level::Info,
            "app.lifecycle",
            &format!("Previous session ({from_version}) ended for an update"),
            serde_json::json!({ "previous_version": from_version }),
        ),
        PreviousSession::EndedUnexpectedly { version, started_at } => crate::services::telemetry::event(
            log::Level::Warn,
            "app.lifecycle",
            "Previous session ended unexpectedly",
            serde_json::json!({
                "failure": "unclean_shutdown",
                "previous_version": version,
                "previous_started_at": started_at,
            }),
        ),
    }
}
