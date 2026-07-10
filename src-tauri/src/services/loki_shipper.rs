//! Loki log shipper — tails local log files and pushes new lines to the
//! Grafana Loki HTTP push API.
//!
//! ## Design
//!
//! - Runs as a single tokio task spawned at app startup.
//! - Local files are the durable buffer. The shipper tracks per-file
//!   byte offsets in a state file written atomically after each
//!   successful batch. When offline, the offset doesn't advance — the
//!   local file keeps growing (subject to the daily-rotation pruning in
//!   [`crate::services::log_rotation`]) — and on reconnect the shipper
//!   resumes from where it left off. Effectively unlimited queue depth.
//! - The shipper is **read-only** on the log files. Local logging (via
//!   `tauri-plugin-log` for the main log, direct file writes for raw
//!   serial logs) keeps working unchanged.
//!
//! ## Files shipped
//!
//! - `<log_dir>/<*.log>` — main app log and any rotation archives
//! - `<app_data>/raw_serial_logs/raw_*.log` — per-port HID byte streams
//!
//! ## Loki stream labels
//!
//! Each line lands in a stream keyed by `(app, clinic, environment, file, level)`.
//! - `file` is the basename **with the `-YYYY-MM-DD` date suffix stripped**, so
//!   that rotation across midnight doesn't fragment a clinic's day into
//!   two streams. (Loki dedups within a stream by `(timestamp, line)`,
//!   so the rare overlap after rotation is silently handled.)
//! - `level` is parsed from the line prefix for the main log
//!   (`INFO`/`WARN`/`ERROR`/`DEBUG`/`TRACE`), or `raw` for raw serial
//!   lines. Keeps level filtering fast on the Grafana side.
//!
//! ## Threat model note
//!
//! Bearer credentials (URL + user + password) are taken from env vars
//! at startup, with a compile-time fallback for production builds. Same
//! trust posture as the old Sentry DSN — anyone with the binary can
//! extract the credential. Mitigated by server-side rate limits in
//! `loki-config.yml`. See `docs/logging.md` in the sadgegames repo and
//! the long-form plan in `.claude/plans/`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;

// =============================================================================
// Config
// =============================================================================

/// Runtime configuration. Built once at startup; if any of URL/user/password
/// are unresolvable (no env var AND no compile-time fallback), the shipper
/// is disabled (this is the normal case for dev builds).
#[derive(Debug, Clone)]
pub struct ShipperConfig {
    pub url: String,
    pub user: String,
    pub password: String,
    /// Used as the `clinic` label on every stream. Same value the old
    /// Sentry setup put in the `machine_name` tag.
    pub clinic: String,
    /// Used as the `environment` label: "production" / "development" / "e2e_test".
    pub environment: String,
    /// App version (from tauri.conf.json at build). Becomes the `version`
    /// Loki label so Grafana can group clinics by which build they run.
    pub version: String,
    pub log_dir: PathBuf,
    pub raw_serial_dir: PathBuf,
    pub state_file: PathBuf,
}

/// Build a config from env vars, with a compile-time fallback for
/// production builds (where the credentials are baked into the binary
/// the same way the old Sentry DSN was). Returns `None` if no config
/// is available — caller should skip spawning the shipper in that case.
pub fn config_from_env(
    app_handle: &AppHandle,
    clinic: String,
    environment: &str,
    version: String,
) -> Option<ShipperConfig> {
    let url = std::env::var("ARKIVET_LOKI_URL")
        .ok()
        .or_else(prod_url)?;
    let user = std::env::var("ARKIVET_LOKI_USER")
        .ok()
        .or_else(prod_user)?;
    let password = std::env::var("ARKIVET_LOKI_PASSWORD")
        .ok()
        .or_else(prod_password)?;

    let app_data_dir = app_handle.path_resolver().app_data_dir()?;
    let log_dir = tauri::api::path::app_log_dir(&app_handle.config())?;
    let raw_serial_dir = app_data_dir.join("raw_serial_logs");
    let state_file = app_data_dir.join("loki_shipper_state.json");

    Some(ShipperConfig {
        url,
        user,
        password,
        clinic,
        environment: environment.to_string(),
        version,
        log_dir,
        raw_serial_dir,
        state_file,
    })
}

/// Compile-time-baked production credential URL.
///
/// Same trust model as the embedded Sentry DSN we used to have: anyone
/// with the binary can extract it, mitigated by server-side rate limits.
#[cfg(not(debug_assertions))]
fn prod_url() -> Option<String> {
    Some("https://loki.stage.sagdegames.com/loki/api/v1/push".to_string())
}
#[cfg(debug_assertions)]
fn prod_url() -> Option<String> {
    None
}

#[cfg(not(debug_assertions))]
fn prod_user() -> Option<String> {
    Some("arkivet".to_string())
}
#[cfg(debug_assertions)]
fn prod_user() -> Option<String> {
    None
}

#[cfg(not(debug_assertions))]
fn prod_password() -> Option<String> {
    Some("XV9vw0HVCRjeFyZxO0xzhdhOvODT".to_string())
}
#[cfg(debug_assertions)]
fn prod_password() -> Option<String> {
    None
}

// =============================================================================
// State
// =============================================================================

#[derive(Debug, Default, Serialize, Deserialize)]
struct ShipperState {
    /// Byte offset into each file we've successfully shipped up to. Key
    /// is the full path as a string (PathBuf doesn't have a stable JSON
    /// representation across platforms).
    offsets: HashMap<String, u64>,
}

fn load_state(path: &Path) -> ShipperState {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return ShipperState::default(), // first run, missing file
    };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

fn save_state(path: &Path, state: &ShipperState) -> std::io::Result<()> {
    // Write to a temp file then rename — atomic on POSIX, and on Windows
    // close-enough (`fs::rename` is atomic on the same volume for
    // existing destinations on modern Windows). Avoids a partial state
    // file if the process is killed mid-write.
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(state)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(&tmp, &body)?;
    std::fs::rename(&tmp, path)
}

// =============================================================================
// Public entry point
// =============================================================================

/// Spawn the shipper task. Returns immediately. If `config` is None,
/// logs and does nothing — used to keep the call site in main.rs
/// branch-free.
pub fn start(config: Option<ShipperConfig>) {
    let config = match config {
        Some(c) => c,
        None => {
            log::info!("loki_shipper: disabled (no URL/credentials configured)");
            return;
        }
    };

    log::info!(
        "loki_shipper: enabled, target={}, clinic={}, env={}",
        redact_url(&config.url),
        config.clinic,
        config.environment,
    );

    tauri::async_runtime::spawn(async move {
        run_loop(config).await;
    });
}

/// Redact the path of the URL so we don't print the auth-required
/// endpoint location verbatim in logs. Keeps the host visible (helpful
/// for "is the URL right?" debugging) but obscures the rest.
fn redact_url(url: &str) -> String {
    match url.find("://") {
        Some(i) => {
            let scheme_host = &url[..i + 3];
            let rest = &url[i + 3..];
            let host_end = rest.find('/').unwrap_or(rest.len());
            format!("{}{}/…", scheme_host, &rest[..host_end])
        }
        None => "<malformed url>".to_string(),
    }
}

// =============================================================================
// Main loop
// =============================================================================

async fn run_loop(config: ShipperConfig) {
    let mut state = load_state(&config.state_file);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("reqwest client build never fails with these options");

    let mut backoff = Duration::from_secs(30);
    let max_backoff = Duration::from_secs(300);
    let normal_interval = Duration::from_secs(30);

    loop {
        tokio::time::sleep(normal_interval).await;

        match try_ship_batch(&client, &config, &mut state).await {
            Ok(lines_shipped) => {
                if lines_shipped > 0 {
                    log::debug!("loki_shipper: shipped {} line(s)", lines_shipped);
                }
                backoff = Duration::from_secs(30);
            }
            // Only transient errors (network, 5xx) land here — permanent 4xx
            // rejections are handled inside try_ship_batch by dropping the
            // batch and advancing offsets, so they can never wedge the loop.
            Err(e) => {
                log::warn!("loki_shipper: batch failed: {} — backing off {}s", e, backoff.as_secs());
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(max_backoff);
            }
        }
    }
}

// =============================================================================
// Batch processing
// =============================================================================

/// A discovered log file with everything needed to decide whether and
/// in what order to ship from it this tick.
struct FileCursor {
    path: PathBuf,
    path_key: String,
    /// Read offset for this tick (saved offset, or 0 after truncation).
    offset: u64,
    size: u64,
    /// Loki `file` label — basename with extension and date suffix stripped.
    label: String,
    /// Date parsed from the `-YYYY-MM-DD` filename suffix, if present.
    /// Drives oldest-first ordering within a label.
    date: Option<chrono::NaiveDate>,
}

/// Keep, per stream label, only the OLDEST file that still has unread
/// bytes. Loki enforces per-stream chronological order (out-of-order
/// tolerated only within ~1h of the stream head), and `strip_date_suffix`
/// deliberately merges all day-files of one source into one stream — so
/// reading a newer day-file before an older one has fully drained would
/// advance the stream head and get the older lines permanently rejected.
/// Draining strictly oldest-first keeps each stream monotonic across
/// ticks. Undated files sort before dated ones (irrelevant in practice:
/// a label is either always dated or never).
fn select_shippable(cursors: &mut Vec<FileCursor>) {
    cursors.sort_by(|a, b| {
        a.label
            .cmp(&b.label)
            .then(a.date.cmp(&b.date))
            .then(a.path_key.cmp(&b.path_key))
    });
    let mut labels_taken: std::collections::HashSet<String> = std::collections::HashSet::new();
    cursors.retain(|c| c.size > c.offset && labels_taken.insert(c.label.clone()));
}

/// Read new bytes from tracked files (oldest-first per stream), build a
/// Loki push payload, POST it, and persist new offsets. Returns the
/// number of lines shipped (0 if there was nothing new).
///
/// Error semantics: `Err` is returned only for transient failures
/// (network, 5xx) — the caller backs off and the same batch is retried.
/// A permanent rejection (4xx) is logged, the batch is DROPPED, and
/// offsets advance anyway: Loki has already ingested what it could and
/// will never accept the rest, so retrying would wedge the shipper
/// forever (which is exactly what happened with out-of-order backlog
/// batches before this was handled).
async fn try_ship_batch(
    client: &reqwest::Client,
    config: &ShipperConfig,
    state: &mut ShipperState,
) -> Result<usize, String> {
    let files = discover_files(&config.log_dir, &config.raw_serial_dir);

    let mut cursors: Vec<FileCursor> = files
        .iter()
        .filter_map(|file| {
            let path_key = file.to_string_lossy().to_string();
            let saved_offset = state.offsets.get(&path_key).copied().unwrap_or(0);
            // File disappeared between glob and stat — ignore.
            let size = std::fs::metadata(file).ok()?.len();

            // Detect truncation/replacement: file is smaller than where we
            // last left off. Most likely cause is rotation creating a fresh
            // empty file under the same path. Reset to 0 and read forward.
            let offset = if size < saved_offset { 0 } else { saved_offset };

            let basename = file
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            let stem = basename_without_ext(basename);
            Some(FileCursor {
                path: file.clone(),
                path_key,
                offset,
                size,
                label: strip_date_suffix(stem),
                date: date_suffix(stem),
            })
        })
        .collect();

    select_shippable(&mut cursors);

    // streams: (file_label, level_label) -> Vec<(ts_ns_string, line)>
    let mut streams: HashMap<(String, String), Vec<(String, String)>> = HashMap::new();
    let mut new_offsets: HashMap<String, u64> = HashMap::new();
    let mut total_lines = 0usize;
    let now_floor_ns = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(i64::MAX);

    for cursor in &cursors {
        // Cap per-file read to avoid loading a massive backlog into RAM
        // all at once. The next tick picks up the rest.
        const PER_FILE_CAP: u64 = 1_000_000;
        let to_read = (cursor.size - cursor.offset).min(PER_FILE_CAP);

        let bytes = match read_chunk(&cursor.path, cursor.offset, to_read) {
            Ok(b) => b,
            Err(e) => {
                log::debug!("loki_shipper: read failed for {:?}: {}", cursor.path, e);
                continue;
            }
        };

        let is_raw_serial = cursor.label.starts_with("raw_");

        // Parse each newline-terminated line out of the byte buffer.
        // Partial trailing lines (no newline) are NOT consumed — they
        // wait for the next tick. We advance `offset` only as far as
        // the last full newline.
        let (consumed, lines) = split_complete_lines(&bytes);
        for line in lines {
            let (ts_ns, level) = if is_raw_serial {
                (parse_raw_serial_ts(line).unwrap_or_else(now_ns), "raw".to_string())
            } else {
                let ts = parse_main_log_ts(line).unwrap_or_else(now_ns);
                let lvl = parse_main_log_level(line).unwrap_or("INFO").to_string();
                (ts, lvl)
            };
            // Clamp future timestamps (skewed machine clock, garbage in a
            // parsed line) to now — Loki rejects entries more than ~10min
            // ahead of ITS clock, and one such line would poison the batch.
            let ts_ns = clamp_to_now(ts_ns, now_floor_ns);
            streams
                .entry((cursor.label.clone(), level))
                .or_default()
                .push((ts_ns, line.to_string()));
            total_lines += 1;
        }

        new_offsets.insert(cursor.path_key.clone(), cursor.offset + consumed as u64);
    }

    if total_lines == 0 {
        // Even with zero new content, save state so cleanup of
        // disappeared-file entries happens — see below.
        cleanup_state(state, &files);
        return Ok(0);
    }

    // Loki requires ascending timestamps within a push. Lines within one
    // file are already chronological, but clamping and the now_ns()
    // fallback can perturb individual entries — stable sort restores
    // monotonicity while preserving file order for equal timestamps.
    for values in streams.values_mut() {
        values.sort_by_key(|(ts, _)| ts.parse::<i64>().unwrap_or(0));
    }

    let payload = build_payload(config, &streams);
    match push(client, config, &payload).await? {
        PushOutcome::Accepted => {}
        PushOutcome::Rejected { status, body } => {
            log::warn!(
                "loki_shipper: batch permanently rejected ({}), dropping {} line(s) and advancing offsets: {}",
                status,
                total_lines,
                body.chars().take(500).collect::<String>(),
            );
        }
    }

    // Apply new offsets and persist — on Accepted AND on Rejected (a
    // rejected batch will never be accepted; freezing offsets here would
    // retry it forever and silence the machine).
    for (k, v) in new_offsets {
        state.offsets.insert(k, v);
    }
    cleanup_state(state, &files);
    if let Err(e) = save_state(&config.state_file, state) {
        log::warn!("loki_shipper: failed to persist state: {}", e);
    }

    Ok(total_lines)
}

/// Drop state entries for files we no longer see in the log dirs. Keeps
/// the state file from growing unbounded as raw-serial dated files age
/// out of the 30-day retention window.
fn cleanup_state(state: &mut ShipperState, present_files: &[PathBuf]) {
    let present: std::collections::HashSet<String> = present_files
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    state.offsets.retain(|k, _| present.contains(k));
}

// =============================================================================
// File discovery and reading
// =============================================================================

fn discover_files(log_dir: &Path, raw_serial_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    list_log_files(log_dir, &mut out);
    list_log_files(raw_serial_dir, &mut out);
    out
}

fn list_log_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // dir doesn't exist yet — skip
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("log") {
            out.push(path);
        }
    }
}

fn read_chunk(path: &Path, offset: u64, max_bytes: u64) -> std::io::Result<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path)?;
    f.seek(SeekFrom::Start(offset))?;
    let mut buf = vec![0u8; max_bytes as usize];
    let n = f.read(&mut buf)?;
    buf.truncate(n);
    Ok(buf)
}

/// Split a byte buffer into complete lines, returning the number of
/// bytes consumed (so the caller can advance the offset by exactly that
/// amount and leave any trailing partial line for the next tick).
fn split_complete_lines(bytes: &[u8]) -> (usize, Vec<&str>) {
    let last_newline = match bytes.iter().rposition(|&b| b == b'\n') {
        Some(i) => i,
        None => return (0, Vec::new()), // no complete line in this chunk yet
    };
    let consumed = last_newline + 1;
    let complete = &bytes[..consumed];
    let text = match std::str::from_utf8(complete) {
        Ok(s) => s,
        Err(_) => {
            // Non-UTF8 bytes in the log (could happen with raw serial
            // garbage). Lossy-decode and skip the bad line content
            // rather than poisoning the whole batch. We log only via
            // ASCII so this should be very rare in main log; raw
            // serial logs ARE encoded to ASCII-with-dots already.
            return (consumed, Vec::new());
        }
    };
    let lines: Vec<&str> = text.lines().collect();
    (consumed, lines)
}

// =============================================================================
// Log-line parsing
// =============================================================================

/// Extract timestamp (as Unix nanoseconds, as a string for the Loki API)
/// from a main-log line of shape `[YYYY-MM-DD][HH:MM:SS][LEVEL][module] msg`.
fn parse_main_log_ts(line: &str) -> Option<String> {
    // Need at least "[YYYY-MM-DD][HH:MM:SS]" = 22 chars
    if line.len() < 22 || !line.starts_with('[') {
        return None;
    }
    // Find the two `[...]` segments — date and time
    let date_end = line[1..].find(']')? + 1; // position of first ']'
    let date_str = &line[1..date_end];
    let after_date = &line[date_end + 1..];
    if !after_date.starts_with('[') {
        return None;
    }
    let time_end = after_date[1..].find(']')? + 1;
    let time_str = &after_date[1..time_end];

    // Parse as UTC — that's how tauri-plugin-log records timestamps.
    let datetime = chrono::NaiveDateTime::parse_from_str(
        &format!("{} {}", date_str, time_str),
        "%Y-%m-%d %H:%M:%S",
    )
    .ok()?;
    let ns = datetime.and_utc().timestamp_nanos_opt()?;
    Some(ns.to_string())
}

/// Extract the level token (`INFO`/`WARN`/`ERROR`/`DEBUG`/`TRACE`) from
/// the third bracketed segment of a main-log line. Returns `None` if
/// the line doesn't match the expected shape.
fn parse_main_log_level(line: &str) -> Option<&str> {
    // Skip past date `[..]` and time `[..]`, then the next `[..]` is level.
    let after_date = skip_bracketed(line)?;
    let after_time = skip_bracketed(after_date)?;
    if !after_time.starts_with('[') {
        return None;
    }
    let inner = &after_time[1..];
    let end = inner.find(']')?;
    Some(&inner[..end])
}

/// Skip past a leading `[...]` segment. Returns the slice starting
/// immediately after the closing `]`, or None if not present.
fn skip_bracketed(s: &str) -> Option<&str> {
    if !s.starts_with('[') {
        return None;
    }
    let end = s[1..].find(']')? + 1;
    Some(&s[end + 1..])
}

/// Extract timestamp from a raw-serial-log line of shape
/// `[YYYY-MM-DD HH:MM:SS.SSS] [N bytes] HEX: ... | ASCII: ...`.
fn parse_raw_serial_ts(line: &str) -> Option<String> {
    if !line.starts_with('[') {
        return None;
    }
    let end = line[1..].find(']')? + 1;
    let inner = &line[1..end];
    // Format `YYYY-MM-DD HH:MM:SS.SSS`
    let datetime = chrono::NaiveDateTime::parse_from_str(inner, "%Y-%m-%d %H:%M:%S%.3f").ok()?;
    let ns = datetime.and_utc().timestamp_nanos_opt()?;
    Some(ns.to_string())
}

/// Fallback when we can't parse a timestamp out of the line — use
/// the current wall clock. Loki requires timestamps to be monotonic
/// per stream, so this can cause rejections on rare malformed lines,
/// but it's better than dropping the line entirely.
fn now_ns() -> String {
    chrono::Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or(0)
        .to_string()
}

/// Parse the `-YYYY-MM-DD` suffix of a filename stem, if present.
fn date_suffix(name: &str) -> Option<chrono::NaiveDate> {
    let n = name.len();
    if n < 11 || !name[..n - 10].ends_with('-') {
        return None;
    }
    chrono::NaiveDate::parse_from_str(&name[n - 10..], "%Y-%m-%d").ok()
}

/// Strip `-YYYY-MM-DD` suffix from a filename stem so rotation across
/// midnight doesn't fragment a clinic's stream. Returns the input
/// unchanged if no recognizable date suffix is present.
fn strip_date_suffix(name: &str) -> String {
    if date_suffix(name).is_some() {
        name[..name.len() - 11].to_string()
    } else {
        name.to_string()
    }
}

/// Clamp a nanosecond-timestamp string to `now_ns` if it lies in the
/// future. Unparseable input is passed through unchanged (Loki will
/// judge it).
fn clamp_to_now(ts_ns: String, now_ns: i64) -> String {
    match ts_ns.parse::<i64>() {
        Ok(ts) if ts > now_ns => now_ns.to_string(),
        _ => ts_ns,
    }
}

fn basename_without_ext(s: &str) -> &str {
    s.rsplit_once('.').map(|(a, _)| a).unwrap_or(s)
}

// =============================================================================
// Loki push payload + HTTP
// =============================================================================

/// Build the JSON body expected by `POST /loki/api/v1/push`.
fn build_payload(
    config: &ShipperConfig,
    streams: &HashMap<(String, String), Vec<(String, String)>>,
) -> serde_json::Value {
    let stream_objs: Vec<serde_json::Value> = streams
        .iter()
        .map(|((file, level), lines)| {
            let values: Vec<serde_json::Value> = lines
                .iter()
                .map(|(ts, line)| json!([ts, line]))
                .collect();
            json!({
                "stream": {
                    "app": "vet-clinic",
                    "clinic": &config.clinic,
                    "environment": &config.environment,
                    "version": &config.version,
                    "file": file,
                    "level": level,
                },
                "values": values,
            })
        })
        .collect();

    json!({ "streams": stream_objs })
}

/// Outcome of a push that reached Loki and got an HTTP response.
enum PushOutcome {
    /// 2xx — everything ingested.
    Accepted,
    /// 4xx — Loki processed the request and permanently refused some or
    /// all of it (out-of-order entry, bad payload). Retrying the same
    /// batch can never succeed; the caller must drop it and move on.
    Rejected {
        status: reqwest::StatusCode,
        body: String,
    },
}

/// POST a payload to Loki. `Err` means transient (network error or 5xx)
/// — safe and correct to retry. See `PushOutcome` for the permanent cases.
async fn push(
    client: &reqwest::Client,
    config: &ShipperConfig,
    payload: &serde_json::Value,
) -> Result<PushOutcome, String> {
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use std::io::Write;

    let body = serde_json::to_vec(payload)
        .map_err(|e| format!("serialize payload: {}", e))?;

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&body)
        .map_err(|e| format!("gzip write: {}", e))?;
    let gzipped = encoder
        .finish()
        .map_err(|e| format!("gzip finish: {}", e))?;

    let resp = client
        .post(&config.url)
        .basic_auth(&config.user, Some(&config.password))
        .header("Content-Type", "application/json")
        .header("Content-Encoding", "gzip")
        .body(gzipped)
        .send()
        .await
        .map_err(|e| format!("send: {}", e))?;

    let status = resp.status();
    // 401/403 (credentials rotated/misconfigured) and 429 (rate limit)
    // are recoverable without losing data — keep retrying those rather
    // than discarding logs. Other 4xx (400 out-of-order/too-new, 413
    // oversized, …) are verdicts on THIS batch and will never change.
    let retryable_4xx = matches!(status.as_u16(), 401 | 403 | 429);
    if status.is_success() {
        Ok(PushOutcome::Accepted)
    } else if status.is_client_error() && !retryable_4xx {
        let body = resp.text().await.unwrap_or_default();
        Ok(PushOutcome::Rejected { status, body })
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("Loki returned {}: {}", status, text))
    }
}

// =============================================================================
// Tests — pure logic only; HTTP not covered here.
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ----- timestamp parsing -----

    #[test]
    fn parses_main_log_timestamp() {
        let line = "[2026-06-03][14:22:18][INFO][vet_clinic::mod] msg here";
        let ns = parse_main_log_ts(line).unwrap();
        // 2026-06-03T14:22:18Z as unix nanos
        let parsed: i64 = ns.parse().unwrap();
        let dt = chrono::DateTime::from_timestamp(parsed / 1_000_000_000, 0).unwrap();
        assert_eq!(dt.format("%Y-%m-%dT%H:%M:%SZ").to_string(), "2026-06-03T14:22:18Z");
    }

    #[test]
    fn main_log_ts_rejects_malformed() {
        assert!(parse_main_log_ts("").is_none());
        assert!(parse_main_log_ts("no brackets").is_none());
        assert!(parse_main_log_ts("[not-a-date][14:22:18][INFO] x").is_none());
    }

    #[test]
    fn parses_main_log_level() {
        let line = "[2026-06-03][14:22:18][INFO][vet_clinic::mod] msg";
        assert_eq!(parse_main_log_level(line), Some("INFO"));

        let line = "[2026-06-03][14:22:18][ERROR][vet_clinic::mod] msg";
        assert_eq!(parse_main_log_level(line), Some("ERROR"));
    }

    #[test]
    fn main_log_level_rejects_malformed() {
        assert!(parse_main_log_level("").is_none());
        assert!(parse_main_log_level("not bracketed").is_none());
    }

    #[test]
    fn parses_raw_serial_timestamp() {
        let line = "[2026-06-03 14:22:18.123] [1 bytes] HEX: 41 | ASCII: A";
        let ns = parse_raw_serial_ts(line).unwrap();
        // 2026-06-03T14:22:18.123Z as unix nanos
        let parsed: i64 = ns.parse().unwrap();
        // 18s + 0.123s after the minute boundary
        let dt = chrono::DateTime::from_timestamp(
            parsed / 1_000_000_000,
            (parsed % 1_000_000_000) as u32,
        ).unwrap();
        assert_eq!(dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(), "2026-06-03T14:22:18.123Z");
    }

    // ----- date-suffix stripping -----

    #[test]
    fn strips_date_suffix_when_present() {
        assert_eq!(strip_date_suffix("vet-clinic-2026-06-03"), "vet-clinic");
        assert_eq!(strip_date_suffix("raw_COM5-2026-06-03"), "raw_COM5");
    }

    #[test]
    fn leaves_undated_names_alone() {
        assert_eq!(strip_date_suffix("vet-clinic"), "vet-clinic");
        assert_eq!(strip_date_suffix("raw_COM5"), "raw_COM5");
    }

    #[test]
    fn rejects_invalid_dates() {
        // 13-99 is not a valid date — keep the original name.
        assert_eq!(strip_date_suffix("file-2026-13-99"), "file-2026-13-99");
    }

    #[test]
    fn strips_basename_extension() {
        assert_eq!(basename_without_ext("Arkivet.log"), "Arkivet");
        assert_eq!(basename_without_ext("raw_COM5-2026-06-03.log"), "raw_COM5-2026-06-03");
        assert_eq!(basename_without_ext("no_extension"), "no_extension");
    }

    #[test]
    fn parses_date_suffix() {
        assert_eq!(
            date_suffix("raw_COM5-2026-06-03"),
            chrono::NaiveDate::from_ymd_opt(2026, 6, 3),
        );
        assert_eq!(date_suffix("Arkivet"), None);
        assert_eq!(date_suffix("file-2026-13-99"), None);
    }

    // ----- timestamp clamping -----

    #[test]
    fn clamps_future_timestamps_to_now() {
        assert_eq!(clamp_to_now("2000".to_string(), 1000), "1000");
        assert_eq!(clamp_to_now("500".to_string(), 1000), "500");
        assert_eq!(clamp_to_now("1000".to_string(), 1000), "1000");
        // Unparseable passes through untouched.
        assert_eq!(clamp_to_now("garbage".to_string(), 1000), "garbage");
    }

    // ----- per-stream oldest-first file selection -----

    fn cursor(label: &str, date: Option<(i32, u32, u32)>, offset: u64, size: u64) -> FileCursor {
        let name = match date {
            Some((y, m, d)) => format!("{}-{:04}-{:02}-{:02}.log", label, y, m, d),
            None => format!("{}.log", label),
        };
        FileCursor {
            path: PathBuf::from(format!("/logs/{}", name)),
            path_key: format!("/logs/{}", name),
            offset,
            size,
            label: label.to_string(),
            date: date.and_then(|(y, m, d)| chrono::NaiveDate::from_ymd_opt(y, m, d)),
        }
    }

    #[test]
    fn selects_oldest_undrained_file_per_label() {
        let mut cursors = vec![
            cursor("raw_COM12", Some((2026, 7, 8)), 0, 100), // newest, has data
            cursor("raw_COM12", Some((2026, 6, 20)), 0, 100), // oldest, has data
            cursor("raw_COM12", Some((2026, 7, 1)), 0, 100), // middle, has data
            cursor("Arkivet", None, 0, 50),                  // other label
        ];
        select_shippable(&mut cursors);
        // Exactly one file per label; for raw_COM12 it must be the oldest.
        assert_eq!(cursors.len(), 2);
        assert_eq!(cursors[0].label, "Arkivet");
        assert_eq!(cursors[1].label, "raw_COM12");
        assert_eq!(cursors[1].date, chrono::NaiveDate::from_ymd_opt(2026, 6, 20));
    }

    #[test]
    fn drained_files_do_not_block_newer_ones() {
        let mut cursors = vec![
            cursor("raw_COM12", Some((2026, 6, 20)), 100, 100), // oldest, fully drained
            cursor("raw_COM12", Some((2026, 7, 8)), 10, 100),   // newest, has data
        ];
        select_shippable(&mut cursors);
        assert_eq!(cursors.len(), 1);
        assert_eq!(cursors[0].date, chrono::NaiveDate::from_ymd_opt(2026, 7, 8));
    }

    #[test]
    fn selects_nothing_when_all_drained() {
        let mut cursors = vec![
            cursor("raw_COM12", Some((2026, 7, 8)), 100, 100),
            cursor("Arkivet", None, 50, 50),
        ];
        select_shippable(&mut cursors);
        assert!(cursors.is_empty());
    }

    // ----- line splitting -----

    #[test]
    fn split_returns_complete_lines_only() {
        let bytes = b"line one\nline two\npartial without newline";
        let (consumed, lines) = split_complete_lines(bytes);
        assert_eq!(consumed, 18); // "line one\nline two\n".len()
        assert_eq!(lines, vec!["line one", "line two"]);
    }

    #[test]
    fn split_returns_nothing_when_no_newline() {
        let bytes = b"no newline yet";
        let (consumed, lines) = split_complete_lines(bytes);
        assert_eq!(consumed, 0);
        assert!(lines.is_empty());
    }

    #[test]
    fn split_handles_only_complete_lines() {
        let bytes = b"a\nb\nc\n";
        let (consumed, lines) = split_complete_lines(bytes);
        assert_eq!(consumed, 6);
        assert_eq!(lines, vec!["a", "b", "c"]);
    }

    // ----- state file -----

    #[test]
    fn state_roundtrips_through_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("state.json");

        let mut state = ShipperState::default();
        state.offsets.insert("/path/to/Arkivet.log".to_string(), 12345);
        state.offsets.insert("/path/to/raw_COM5-2026-06-03.log".to_string(), 678);

        save_state(&path, &state).unwrap();
        let loaded = load_state(&path);
        assert_eq!(loaded.offsets, state.offsets);
    }

    #[test]
    fn missing_state_file_yields_default() {
        let loaded = load_state(Path::new("/definitely/does/not/exist.json"));
        assert!(loaded.offsets.is_empty());
    }

    #[test]
    fn cleanup_drops_disappeared_files() {
        let mut state = ShipperState::default();
        state.offsets.insert("/keep.log".to_string(), 100);
        state.offsets.insert("/gone.log".to_string(), 200);
        let present = vec![PathBuf::from("/keep.log")];
        cleanup_state(&mut state, &present);
        assert_eq!(state.offsets.len(), 1);
        assert!(state.offsets.contains_key("/keep.log"));
        assert!(!state.offsets.contains_key("/gone.log"));
    }

    // ----- URL redaction -----

    #[test]
    fn redacts_url_path() {
        assert_eq!(
            redact_url("https://loki.stage.sagdegames.com/loki/api/v1/push"),
            "https://loki.stage.sagdegames.com/…",
        );
    }

    #[test]
    fn redacts_url_without_path() {
        assert_eq!(
            redact_url("https://loki.stage.sagdegames.com"),
            "https://loki.stage.sagdegames.com/…",
        );
    }
}
