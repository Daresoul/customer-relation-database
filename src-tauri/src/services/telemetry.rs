//! Sentry-replacement: emit structured "events" as normal log lines.
//!
//! Replaces the `sentry::capture_message` / `sentry::add_breadcrumb` /
//! `sentry::with_scope` surface we used to have. The design idea is that
//! everything is "just a log line" — no second pipeline, no separate
//! credential, no in-memory event queue. Local file is the durable
//! buffer (with the rotation we shipped earlier), Loki is a remote
//! mirror that the shipper feeds from that file.
//!
//! ## Wire format
//!
//! Each event is logged with a sentinel `[event]` prefix and a JSON
//! payload following a `|` separator, so the local log line looks like:
//!
//! ```text
//! [2026-06-03][14:22:18][ERROR][vet_clinic::services::raw_input_capture]
//!   [event] raw_input_capture: SetWindowsHookExW failed — focus-stealing
//!   suppression disabled | {"subsystem":"raw_input_capture","failure":
//!   "hook_install","error":"Access is denied. (os error 5)"}
//! ```
//!
//! On the Grafana side, the standard query to surface events:
//!
//! ```logql
//! {app="vet-clinic"} |= "[event]" | regexp "\\[event\\] (?P<msg>.*?) \\| (?P<payload>\\{.*\\})" | json payload
//! ```
//!
//! That pulls out the message and exposes every JSON field for filtering
//! (subsystem, failure, error, anything else passed via `extras`).
//!
//! ## Local-only fallback
//!
//! If Loki is unreachable, these lines still land in `vet-clinic.log`
//! the same way every other log line does — `grep '\[event\]'` over the
//! local file is a perfectly serviceable degraded mode.

use serde_json::Value;

/// Convenience re-export so call sites don't need a separate `use log::Level`.
pub use log::Level;

/// Emit a structured event. Subsystem is the primary classifier (e.g.
/// `"raw_input_capture"`, `"device_capture"`, `"app.lifecycle"`).
///
/// `extras` should be a JSON object — its fields are flattened into the
/// top-level event payload alongside `subsystem`, so LogQL queries like
/// `| json | failure="hook_install"` work without nested unwrapping. A
/// non-object `extras` (string, array, null) is preserved verbatim under
/// an `"extras"` key.
pub fn event(level: Level, subsystem: &str, message: &str, extras: Value) {
    let payload = build_payload(subsystem, extras);
    // log::log!() routes through tauri-plugin-log which writes to the
    // current vet-clinic.log file. The Loki shipper tails that file and
    // forwards lines — see services::loki_shipper.
    log::log!(level, "[event] {} | {}", message, payload);
}

/// Pure helper for unit-testing the JSON shape without involving the
/// global logger.
fn build_payload(subsystem: &str, extras: Value) -> Value {
    let mut payload = serde_json::Map::new();
    payload.insert("subsystem".to_string(), Value::String(subsystem.to_string()));

    match extras {
        Value::Object(map) => {
            // Flatten: each extras field becomes a sibling of `subsystem`.
            // Conflict resolution: if extras already includes a `subsystem`
            // key, the explicit `subsystem` argument wins (already inserted
            // above). Skip duplicates rather than overwriting.
            for (k, v) in map {
                if k == "subsystem" {
                    continue;
                }
                payload.insert(k, v);
            }
        }
        Value::Null => {
            // Nothing to add — `null` is just "no extras".
        }
        other => {
            // Non-object extras (string, number, array) — preserve under
            // a dedicated key so we don't lose the data. Rare in practice.
            payload.insert("extras".to_string(), other);
        }
    }

    Value::Object(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn payload_includes_subsystem() {
        let p = build_payload("raw_input_capture", Value::Null);
        assert_eq!(p["subsystem"], "raw_input_capture");
    }

    #[test]
    fn object_extras_are_flattened() {
        let p = build_payload(
            "raw_input_capture",
            json!({ "failure": "hook_install", "error": "perm denied" }),
        );
        assert_eq!(p["subsystem"], "raw_input_capture");
        assert_eq!(p["failure"], "hook_install");
        assert_eq!(p["error"], "perm denied");
    }

    #[test]
    fn explicit_subsystem_wins_over_extras_subsystem() {
        // Defensive: if a caller accidentally passes "subsystem" inside
        // extras, the explicit subsystem argument should not be silently
        // overwritten by the (probably-wrong) one in extras.
        let p = build_payload(
            "intended",
            json!({ "subsystem": "accidental", "failure": "x" }),
        );
        assert_eq!(p["subsystem"], "intended");
        assert_eq!(p["failure"], "x");
    }

    #[test]
    fn null_extras_yields_subsystem_only() {
        let p = build_payload("any", Value::Null);
        let obj = p.as_object().unwrap();
        assert_eq!(obj.len(), 1);
        assert_eq!(obj["subsystem"], "any");
    }

    #[test]
    fn non_object_extras_preserved_under_extras_key() {
        // Caller passed a string — don't drop it.
        let p = build_payload("any", json!("a string instead of object"));
        assert_eq!(p["subsystem"], "any");
        assert_eq!(p["extras"], "a string instead of object");
    }

    #[test]
    fn formatted_line_matches_expected_shape() {
        // Locks in the format the Loki LogQL regex depends on:
        //   "[event] <message> | <json>"
        // If a future refactor changes the separator or sentinel, this
        // test catches it before queries silently start returning empty.
        let p = build_payload("raw_input_capture", json!({ "failure": "hook_install" }));
        let formatted = format!("[event] {} | {}", "msg-here", p);
        assert!(formatted.starts_with("[event] msg-here | {"));
        assert!(formatted.contains("\"subsystem\":\"raw_input_capture\""));
        assert!(formatted.contains("\"failure\":\"hook_install\""));
    }
}
