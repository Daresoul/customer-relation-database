//! Log lines reach Loki, a third-party server. They carry ids, never a
//! patient's or owner's name, a phone, an email or a microchip number
//! (security-privacy.md M4).

use std::path::{Path, PathBuf};

/// Known exceptions, each with its reason. Format: (file, text in the call).
const ALLOWED: &[(&str, &str)] = &[
    // Debug level is never written (the logger runs at Info). This file
    // belongs to the PDF work; the line goes with it.
    ("services/medical_record.rs", "Found owner"),
];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            if path.file_name().is_some_and(|n| n == "tests") {
                continue;
            }
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// Each `log::<level>!(...)` call's text, with the line it starts on.
fn log_calls(source: &str) -> Vec<(usize, String)> {
    let mut calls = Vec::new();
    for level in ["error", "warn", "info", "debug", "trace"] {
        let needle = format!("log::{level}!(");
        let mut from = 0;
        while let Some(found) = source[from..].find(&needle) {
            let start = from + found;
            let body_start = start + needle.len();
            let mut depth = 1;
            let mut end = body_start;
            let mut in_string = false;
            let mut escaped = false;
            for (i, c) in source[body_start..].char_indices() {
                if in_string {
                    match (escaped, c) {
                        (true, _) => escaped = false,
                        (false, '\\') => escaped = true,
                        (false, '"') => in_string = false,
                        _ => {}
                    }
                    continue;
                }
                match c {
                    '"' => in_string = true,
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            end = body_start + i;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            let line = source[..start].lines().count() + 1;
            calls.push((line, source[body_start..end].to_string()));
            from = end.max(body_start);
        }
    }
    calls
}

/// The format string and the arguments after it.
fn split_call(call: &str) -> (&str, &str) {
    let Some(open) = call.find('"') else { return ("", call) };
    let mut escaped = false;
    for (i, c) in call[open + 1..].char_indices() {
        match (escaped, c) {
            (true, _) => escaped = false,
            (false, '\\') => escaped = true,
            (false, '"') => return (&call[open + 1..open + 1 + i], &call[open + 1 + i + 1..]),
            _ => {}
        }
    }
    ("", "")
}

/// Names of values that hold personal data. A bare `name` or `code` counts
/// when the message is about a patient, an owner or a chip scan (elsewhere
/// it names a device, a port or a column).
fn personal_value(format: &str, args: &str) -> Option<String> {
    let personal_fields = ["name", "first_name", "last_name", "owner", "microchip_id", "phone", "email"];
    let personal_holders = ["patient", "patient_data", "owner", "household", "person", "dto", "input"];
    let message = format.to_lowercase();
    let about_a_patient = ["patient", "owner", "scan from", "chip"].iter().any(|w| message.contains(w));
    let tokens: Vec<&str> = args
        .split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '.'))
        .filter(|t| !t.is_empty())
        .collect();
    for token in tokens {
        let parts: Vec<&str> = token.split('.').collect();
        let last = *parts.last().unwrap();
        if parts.len() == 1 {
            // A PDF's path holds the pet's or the owner's name.
            let always = matches!(
                last,
                "patient_name" | "owner_name" | "owner" | "microchip" | "microchip_id" | "chip" | "phone" | "email" | "output_path"
            );
            if always || (about_a_patient && matches!(last, "name" | "code" | "identifier")) {
                return Some(token.to_string());
            }
        } else if personal_fields.contains(&last) && personal_holders.contains(&parts[parts.len() - 2]) {
            return Some(token.to_string());
        }
    }
    None
}

#[test]
fn no_log_line_prints_a_name_phone_email_or_chip() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&src, &mut files);

    let mut found = Vec::new();
    for file in files {
        let rel = file.strip_prefix(&src).unwrap().to_string_lossy().replace('\\', "/");
        let source = std::fs::read_to_string(&file).unwrap();
        for (line, call) in log_calls(&source) {
            if ALLOWED.iter().any(|(f, text)| *f == rel && call.contains(text)) {
                continue;
            }
            let (format, args) = split_call(&call);
            if let Some(value) = personal_value(format, args) {
                found.push(format!("{rel}:{line} logs `{value}`"));
            }
        }
    }
    assert!(found.is_empty(), "log lines with personal data:\n{}", found.join("\n"));
}

#[test]
fn the_scan_catches_a_name_and_skips_device_names() {
    assert!(personal_value("Creating patient: name={:?}", ", name, dto.species_id").is_some());
    assert!(personal_value("Patient info", ", patient_data.name, patient_data.owner").is_some());
    assert!(personal_value("scan from managed device: {}", ", code").is_some());
    assert!(personal_value("Found device name for {} - {}", ", port.port_name, name").is_none());
    assert!(personal_value("Open failed with code {}", ", code").is_none());
    assert!(personal_value("Watching '{}'", ", config.name, integration.name, port_name").is_none());
    assert!(personal_value("patient {} record {}", ", patient_id, record_id").is_none());
    // Final review: a chip number and a PDF path (pet or owner name in it) got past the scan.
    assert!(personal_value("Microchip {} is on {} active patients", ", identifier, n").is_some());
    assert!(personal_value("   📂 Output path: {}", ", output_path").is_some());
}

/// Each `telemetry::event(...)` call's text.
fn telemetry_calls(source: &str) -> Vec<String> {
    source
        .match_indices("telemetry::event(")
        .map(|(i, _)| source[i..].chars().take(600).collect::<String>())
        .map(|s| s.split(");").next().unwrap_or("").to_string())
        .collect()
}

// Final review: an event sent the Exigo ID2 field (a chip, a name or another id).
#[test]
fn no_telemetry_event_carries_what_the_machine_said_about_the_patient() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&src, &mut files);
    let mut found = Vec::new();
    for file in files {
        let source = std::fs::read_to_string(&file).unwrap();
        for call in telemetry_calls(&source) {
            if ["\"ID2\"", "patient_identifier", "patient_name", "microchip"].iter().any(|k| call.contains(k)) {
                found.push(format!("{}: {}", file.display(), call.lines().next().unwrap_or("")));
            }
        }
    }
    assert!(found.is_empty(), "events with patient data:\n{}", found.join("\n"));
}

// Final review: raw serial logs went to Loki whole, with what staff typed on
// the machine (patient name, id) and every value. Timing and size are kept.
#[test]
fn raw_serial_lines_reach_loki_without_their_content() {
    use crate::services::loki_shipper::redact_raw_line;
    assert_eq!(
        redact_raw_line("[2026-10-22 14:02:27.185] [9 bytes] HEX: 50 49 44 7C | ASCII: PID|"),
        "[2026-10-22 14:02:27.185] [9 bytes]"
    );
    let header = "[2026-10-22 06:35:17.177] Port: COM6 | Device: healvet_hv_fia_3000 | Baud: 9600 | Integration ID: 2";
    assert_eq!(redact_raw_line(header), header);
}
