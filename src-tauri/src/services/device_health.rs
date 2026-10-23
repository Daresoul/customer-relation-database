//! Lab machine health outside the window: the tray tooltip and icon, OS
//! notifications when a machine is down or quiet during clinic hours, and the
//! data behind the device details drawer. Read-only: nothing here talks to a port.

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

use crate::services::device_input::{ConnectionState, DeviceConnectionStatus};
use crate::services::file_watcher::{FileWatcherState, FileWatcherStatus};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    En,
    Mk,
}

impl Lang {
    pub fn from_code(code: &str) -> Lang {
        if code == "mk" { Lang::Mk } else { Lang::En }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuietAlert {
    pub integration_id: i64,
    pub after_hours: u32,
}

/// When to notify about lab machines. Clinic days run 1 = Monday … 7 = Sunday.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAlertSettings {
    pub notify_enabled: bool,
    pub down_after_minutes: u32,
    pub clinic_open: String,
    pub clinic_close: String,
    pub clinic_days: Vec<u8>,
    pub quiet_alerts: Vec<QuietAlert>,
}

impl Default for DeviceAlertSettings {
    fn default() -> Self {
        DeviceAlertSettings {
            notify_enabled: true,
            down_after_minutes: 10,
            clinic_open: "07:00".to_string(),
            clinic_close: "20:00".to_string(),
            clinic_days: vec![1, 2, 3, 4, 5, 6],
            quiet_alerts: Vec::new(),
        }
    }
}

impl DeviceAlertSettings {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=24 * 60).contains(&self.down_after_minutes) {
            return Err("Minutes before a notification must be between 1 and 1440".to_string());
        }
        let open = parse_time(&self.clinic_open).ok_or("Opening time must look like 07:00")?;
        let close = parse_time(&self.clinic_close).ok_or("Closing time must look like 20:00")?;
        if open >= close {
            return Err("Opening time must be before closing time".to_string());
        }
        if self.clinic_days.iter().any(|d| !(1..=7).contains(d)) {
            return Err("Clinic days run from 1 (Monday) to 7 (Sunday)".to_string());
        }
        if self.quiet_alerts.iter().any(|q| !(1..=72).contains(&q.after_hours)) {
            return Err("Quiet hours must be between 1 and 72".to_string());
        }
        Ok(())
    }

    fn hours(&self) -> Option<(NaiveTime, NaiveTime)> {
        Some((parse_time(&self.clinic_open)?, parse_time(&self.clinic_close)?))
    }

    fn quiet_hours_for(&self, integration_id: i64) -> Option<u32> {
        self.quiet_alerts.iter().find(|q| q.integration_id == integration_id).map(|q| q.after_hours)
    }
}

fn parse_time(text: &str) -> Option<NaiveTime> {
    NaiveTime::parse_from_str(text.trim(), "%H:%M").ok()
}

pub fn is_clinic_hours(settings: &DeviceAlertSettings, at: DateTime<FixedOffset>) -> bool {
    let day = at.weekday().number_from_monday() as u8;
    let Some((open, close)) = settings.hours() else { return false };
    settings.clinic_days.contains(&day) && at.time() >= open && at.time() < close
}

/// Today's opening time, in the same offset as `at`.
fn opening_on(settings: &DeviceAlertSettings, at: DateTime<FixedOffset>) -> Option<DateTime<FixedOffset>> {
    let (open, _) = settings.hours()?;
    at.date_naive().and_time(open).and_local_timezone(*at.offset()).single()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Health {
    Working,
    /// First connection attempt after start; not a problem yet.
    Starting,
    Down,
    /// Disabled or stopped on purpose.
    Off,
}

pub fn serial_health(status: &DeviceConnectionStatus) -> Health {
    match status.status {
        ConnectionState::Connected => Health::Working,
        ConnectionState::Connecting if status.retry_count == 0 && status.error_kind.is_none() => Health::Starting,
        ConnectionState::Connecting | ConnectionState::Error | ConnectionState::Disconnected => Health::Down,
    }
}

pub fn folder_health(status: &FileWatcherStatus) -> Health {
    match status.status {
        FileWatcherState::Watching => Health::Working,
        FileWatcherState::Error => Health::Down,
        FileWatcherState::Stopped => Health::Off,
    }
}

#[derive(Clone, Debug)]
pub struct DeviceSnapshot {
    pub integration_id: i64,
    pub name: String,
    pub health: Health,
    pub last_result_at: Option<DateTime<FixedOffset>>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ProblemKind {
    NoConnection { since: DateTime<FixedOffset> },
    Quiet { last_result: Option<DateTime<FixedOffset>> },
}

#[derive(Clone, Debug, PartialEq)]
pub struct DeviceProblem {
    pub integration_id: i64,
    pub name: String,
    pub kind: ProblemKind,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Alert {
    Down(DeviceProblem),
    Quiet(DeviceProblem),
    BackOnline { integration_id: i64, name: String },
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Observation {
    pub problems: Vec<DeviceProblem>,
    pub alerts: Vec<Alert>,
}

/// A machine shows as a problem only after it has been down this long, so a
/// reconnect or a slow start doesn't flash the tray.
pub const GRACE_SECS: i64 = 60;

#[derive(Default)]
struct Track {
    bad_since: Option<DateTime<FixedOffset>>,
    down_notified: bool,
    /// The last result time the quiet alert was sent for; a newer result ends the incident.
    quiet_notified_for: Option<Option<DateTime<FixedOffset>>>,
}

/// Remembers when each machine went down and which incidents were already
/// notified, across checks.
#[derive(Default)]
pub struct HealthTracker {
    tracks: HashMap<i64, Track>,
}

impl HealthTracker {
    pub fn observe(
        &mut self,
        now: DateTime<FixedOffset>,
        devices: &[DeviceSnapshot],
        settings: &DeviceAlertSettings,
    ) -> Observation {
        let mut out = Observation::default();
        let in_hours = is_clinic_hours(settings, now);
        self.tracks.retain(|id, _| devices.iter().any(|d| d.integration_id == *id));

        for d in devices {
            let track = self.tracks.entry(d.integration_id).or_default();
            let problem = |kind| DeviceProblem { integration_id: d.integration_id, name: d.name.clone(), kind };
            // A retry after an outage restarts at attempt 0; it is still the same outage.
            let down = d.health == Health::Down || (d.health == Health::Starting && track.bad_since.is_some());

            if down {
                let since = *track.bad_since.get_or_insert(now);
                let down_for = now - since;
                if down_for < Duration::seconds(GRACE_SECS) {
                    continue;
                }
                let p = problem(ProblemKind::NoConnection { since });
                out.problems.push(p.clone());
                let due = down_for >= Duration::minutes(settings.down_after_minutes as i64);
                if settings.notify_enabled && in_hours && due && !track.down_notified {
                    track.down_notified = true;
                    out.alerts.push(Alert::Down(p));
                }
                continue;
            }

            match d.health {
                Health::Off => *track = Track::default(),
                Health::Working => {
                    if track.down_notified {
                        out.alerts.push(Alert::BackOnline { integration_id: d.integration_id, name: d.name.clone() });
                    }
                    track.bad_since = None;
                    track.down_notified = false;
                    if track.quiet_notified_for.is_some_and(|at| at != d.last_result_at) {
                        track.quiet_notified_for = None;
                    }

                    let Some(hours) = settings.quiet_hours_for(d.integration_id) else { continue };
                    if !in_hours {
                        continue;
                    }
                    let quiet_from = match (d.last_result_at, opening_on(settings, now)) {
                        (Some(last), Some(open)) => last.max(open),
                        (last, open) => last.or(open).unwrap_or(now),
                    };
                    if now - quiet_from < Duration::hours(hours as i64) {
                        continue;
                    }
                    let p = problem(ProblemKind::Quiet { last_result: d.last_result_at });
                    out.problems.push(p.clone());
                    if settings.notify_enabled && track.quiet_notified_for.is_none() {
                        track.quiet_notified_for = Some(d.last_result_at);
                        out.alerts.push(Alert::Quiet(p));
                    }
                }
                Health::Starting | Health::Down => {}
            }
        }
        out
    }
}

/// "10:42" today, "17.10. 18:05" on an earlier day.
fn when(at: DateTime<FixedOffset>, now: DateTime<FixedOffset>) -> String {
    let at = at.with_timezone(now.offset());
    if at.date_naive() == now.date_naive() {
        at.format("%H:%M").to_string()
    } else {
        at.format("%d.%m. %H:%M").to_string()
    }
}

pub fn problem_line(problem: &DeviceProblem, now: DateTime<FixedOffset>, lang: Lang) -> String {
    let name = &problem.name;
    match (&problem.kind, lang) {
        (ProblemKind::NoConnection { since }, Lang::En) => format!("{name}: no connection since {}", when(*since, now)),
        (ProblemKind::NoConnection { since }, Lang::Mk) => format!("{name}: нема врска од {}", when(*since, now)),
        (ProblemKind::Quiet { last_result: Some(at) }, Lang::En) => format!("{name}: no results since {}", when(*at, now)),
        (ProblemKind::Quiet { last_result: Some(at) }, Lang::Mk) => format!("{name}: нема резултати од {}", when(*at, now)),
        (ProblemKind::Quiet { last_result: None }, Lang::En) => format!("{name}: no results today"),
        (ProblemKind::Quiet { last_result: None }, Lang::Mk) => format!("{name}: нема резултати денес"),
    }
}

/// Windows cuts tray tooltips at 127 characters.
pub const TOOLTIP_MAX_CHARS: usize = 127;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TraySummary {
    pub warning: bool,
    pub tooltip: String,
}

pub fn tray_summary(
    problems: &[DeviceProblem],
    device_count: usize,
    now: DateTime<FixedOffset>,
    lang: Lang,
) -> TraySummary {
    if problems.is_empty() {
        let tooltip = match (device_count, lang) {
            (0, _) => "Arkivet".to_string(),
            (_, Lang::En) => "Arkivet — All devices OK".to_string(),
            (_, Lang::Mk) => "Arkivet — Сите уреди работат".to_string(),
        };
        return TraySummary { warning: false, tooltip };
    }
    let mut tooltip = String::from("Arkivet");
    for p in problems {
        tooltip.push('\n');
        tooltip.push_str(&problem_line(p, now, lang));
    }
    if tooltip.chars().count() > TOOLTIP_MAX_CHARS {
        tooltip = tooltip.chars().take(TOOLTIP_MAX_CHARS - 1).collect::<String>() + "…";
    }
    TraySummary { warning: true, tooltip }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationText {
    pub title: String,
    pub body: String,
}

pub fn alert_text(alert: &Alert, now: DateTime<FixedOffset>, lang: Lang) -> NotificationText {
    let (title, body) = match (alert, lang) {
        (Alert::Down(p), Lang::En) => (
            "Lab machine not connected",
            format!("{}. Check that it is on and the cable is plugged in, then press Reconnect in Arkivet.", problem_line(p, now, lang)),
        ),
        (Alert::Down(p), Lang::Mk) => (
            "Лабораторискиот уред не е поврзан",
            format!("{}. Проверете дали е вклучен и дали кабелот е приклучен, па притиснете Повторно поврзи во Arkivet.", problem_line(p, now, lang)),
        ),
        (Alert::Quiet(p), Lang::En) => (
            "Lab machine is quiet",
            format!("{}. If tests were run, check that it is on and connected.", problem_line(p, now, lang)),
        ),
        (Alert::Quiet(p), Lang::Mk) => (
            "Лабораторискиот уред не праќа резултати",
            format!("{}. Ако се правени тестови, проверете дали е вклучен и поврзан.", problem_line(p, now, lang)),
        ),
        (Alert::BackOnline { name, .. }, Lang::En) => ("Lab machine back online", format!("{name} is connected again.")),
        (Alert::BackOnline { name, .. }, Lang::Mk) => ("Лабораторискиот уред повторно работи", format!("{name} е повторно поврзан.")),
    };
    NotificationText { title: title.to_string(), body }
}

/// Bytes received per machine, for the "N bytes in the last minute" counter.
#[derive(Default, Debug)]
pub struct ByteWindow {
    samples: VecDeque<(DateTime<Utc>, usize)>,
}

impl ByteWindow {
    pub fn add(&mut self, at: DateTime<Utc>, bytes: usize) {
        while self.samples.front().is_some_and(|(t, _)| at - *t > Duration::seconds(60)) {
            self.samples.pop_front();
        }
        self.samples.push_back((at, bytes));
    }

    pub fn in_last_minute(&self, now: DateTime<Utc>) -> usize {
        self.samples.iter().filter(|(t, _)| now - *t <= Duration::seconds(60)).map(|(_, n)| n).sum()
    }
}

/// Bytes kept from the last message, enough to recognise a format.
pub const RAW_KEEP_BYTES: usize = 2048;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawMessage {
    pub at: String,
    pub byte_count: usize,
    pub text: String,
    pub hex: String,
    pub truncated: bool,
}

pub fn raw_message(bytes: &[u8], at: &str) -> RawMessage {
    let kept = &bytes[..bytes.len().min(RAW_KEEP_BYTES)];
    let mut text = String::new();
    let mut after_cr = false;
    for c in String::from_utf8_lossy(kept).chars() {
        match c {
            // CR, LF and CR LF all read as one line break.
            '\n' if after_cr => {}
            '\r' | '\n' => text.push('\n'),
            '\t' => text.push(c),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => text.push_str(&format!("<{:02X}>", c as u32)),
            c => text.push(c),
        }
        after_cr = c == '\r';
    }
    let hex = kept
        .chunks(16)
        .map(|line| line.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n");
    RawMessage {
        at: at.to_string(),
        byte_count: bytes.len(),
        text,
        hex,
        truncated: bytes.len() > kept.len(),
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub at: String,
    /// A connection state ("Connected", "Error") or a device event kind ("cut_off").
    pub label: String,
    pub error_kind: Option<String>,
    pub is_error: bool,
}

pub const LOG_KEEP: usize = 50;

pub fn push_log(log: &mut VecDeque<LogEntry>, entry: LogEntry) {
    log.push_back(entry);
    while log.len() > LOG_KEEP {
        log.pop_front();
    }
}

pub fn errors_today(log: &VecDeque<LogEntry>, now: DateTime<FixedOffset>) -> usize {
    log.iter()
        .filter(|e| e.is_error)
        .filter_map(|e| DateTime::parse_from_rfc3339(&e.at).ok())
        .filter(|at| at.with_timezone(now.offset()).date_naive() == now.date_naive())
        .count()
}

/// The device's settings that are safe to paste into a support chat.
#[derive(Clone, Debug, Default)]
pub struct DeviceConfigSummary {
    pub name: String,
    pub device_type: String,
    pub connection_type: String,
    pub enabled: bool,
    pub port: Option<String>,
    pub baud_rate: Option<i64>,
    pub folder: Option<String>,
    pub file_pattern: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DiagnosticsInput {
    pub app_version: String,
    pub os: String,
    pub generated_at: DateTime<FixedOffset>,
    pub device: DeviceConfigSummary,
    pub state: String,
    pub last_error: Option<String>,
    pub last_result_at: Option<String>,
    pub last_byte_at: Option<String>,
    pub bytes_last_minute: usize,
    pub errors_today: usize,
    pub log: Vec<LogEntry>,
}

/// Plain text for "Copy diagnostics". Never includes message contents, so no
/// patient names end up in an email or chat.
pub fn diagnostics_text(input: &DiagnosticsInput) -> String {
    let d = &input.device;
    let mut lines = vec![
        "Arkivet diagnostics".to_string(),
        format!("Generated: {}", input.generated_at.to_rfc3339()),
        format!("App version: {}", input.app_version),
        format!("OS: {}", input.os),
        String::new(),
        format!("Device: {} ({})", d.name, d.device_type),
        format!("Connection: {}", d.connection_type),
        format!("Enabled: {}", if d.enabled { "yes" } else { "no" }),
    ];
    if let Some(port) = &d.port {
        lines.push(format!("Port: {port}"));
    }
    if let Some(baud) = d.baud_rate {
        lines.push(format!("Baud rate: {baud}"));
    }
    if let Some(folder) = &d.folder {
        lines.push(format!("Folder: {folder}"));
    }
    if let Some(pattern) = &d.file_pattern {
        lines.push(format!("File pattern: {pattern}"));
    }
    let or_never = |v: &Option<String>| v.clone().unwrap_or_else(|| "never".to_string());
    lines.extend([
        String::new(),
        format!("State: {}", input.state),
        format!("Last error: {}", input.last_error.as_deref().unwrap_or("none")),
        format!("Last result: {}", or_never(&input.last_result_at)),
        format!("Last data: {}", or_never(&input.last_byte_at)),
        format!("Bytes in the last minute: {}", input.bytes_last_minute),
        format!("Errors today: {}", input.errors_today),
        String::new(),
        "Recent status changes and errors (newest first):".to_string(),
    ]);
    if input.log.is_empty() {
        lines.push("  none".to_string());
    }
    for e in input.log.iter().rev() {
        let kind = e.error_kind.as_deref().map(|k| format!(" ({k})")).unwrap_or_default();
        lines.push(format!("  {}  {}{}", e.at, e.label, kind));
    }
    lines.join("\n") + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn local(y: i32, m: u32, d: u32, h: u32, min: u32) -> DateTime<FixedOffset> {
        FixedOffset::east_opt(2 * 3600).unwrap().with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
    }

    // 2026-10-19 is a Monday.
    fn monday(h: u32, min: u32) -> DateTime<FixedOffset> {
        local(2026, 10, 19, h, min)
    }

    fn device(id: i64, name: &str, health: Health) -> DeviceSnapshot {
        DeviceSnapshot { integration_id: id, name: name.to_string(), health, last_result_at: None }
    }

    fn serial(status: ConnectionState, retry_count: u32) -> DeviceConnectionStatus {
        DeviceConnectionStatus {
            integration_id: 1,
            port_name: "COM3".into(),
            device_type: "mnchip_pointcare_chemistry".into(),
            status,
            last_connected: None,
            last_error: None,
            error_kind: None,
            retry_count,
            next_retry: None,
            last_result_at: None,
            last_byte_at: None,
        }
    }

    #[test]
    fn defaults_are_ten_minutes_and_seven_to_eight_monday_to_saturday() {
        let s = DeviceAlertSettings::default();
        assert!(s.notify_enabled);
        assert_eq!(s.down_after_minutes, 10);
        assert_eq!(s.clinic_open, "07:00");
        assert_eq!(s.clinic_close, "20:00");
        assert_eq!(s.clinic_days, vec![1, 2, 3, 4, 5, 6]);
        assert!(s.quiet_alerts.is_empty());
        assert!(s.validate().is_ok());
    }

    #[test]
    fn settings_validation_rejects_nonsense() {
        let ok = DeviceAlertSettings::default();
        assert!(DeviceAlertSettings { clinic_open: "20:00".into(), clinic_close: "07:00".into(), ..ok.clone() }.validate().is_err());
        assert!(DeviceAlertSettings { clinic_open: "7am".into(), ..ok.clone() }.validate().is_err());
        assert!(DeviceAlertSettings { down_after_minutes: 0, ..ok.clone() }.validate().is_err());
        assert!(DeviceAlertSettings { clinic_days: vec![0], ..ok.clone() }.validate().is_err());
        assert!(DeviceAlertSettings { quiet_alerts: vec![QuietAlert { integration_id: 1, after_hours: 0 }], ..ok.clone() }.validate().is_err());
        assert!(DeviceAlertSettings { quiet_alerts: vec![QuietAlert { integration_id: 1, after_hours: 4 }], ..ok }.validate().is_ok());
    }

    #[test]
    fn clinic_hours_are_open_to_close_on_clinic_days() {
        let s = DeviceAlertSettings::default();
        assert!(is_clinic_hours(&s, monday(7, 0)));
        assert!(is_clinic_hours(&s, monday(19, 59)));
        assert!(!is_clinic_hours(&s, monday(6, 59)));
        assert!(!is_clinic_hours(&s, monday(20, 0)));
        assert!(is_clinic_hours(&s, local(2026, 10, 24, 10, 0)), "Saturday");
        assert!(!is_clinic_hours(&s, local(2026, 10, 25, 10, 0)), "Sunday");
    }

    #[test]
    fn language_falls_back_to_english() {
        assert_eq!(Lang::from_code("mk"), Lang::Mk);
        assert_eq!(Lang::from_code("en"), Lang::En);
        assert_eq!(Lang::from_code(""), Lang::En);
    }

    #[test]
    fn a_retrying_port_counts_as_down_but_the_first_attempt_does_not() {
        assert_eq!(serial_health(&serial(ConnectionState::Connected, 0)), Health::Working);
        assert_eq!(serial_health(&serial(ConnectionState::Connecting, 0)), Health::Starting);
        assert_eq!(serial_health(&serial(ConnectionState::Connecting, 3)), Health::Down);
        assert_eq!(serial_health(&serial(ConnectionState::Error, 1)), Health::Down);
        assert_eq!(serial_health(&serial(ConnectionState::Disconnected, 0)), Health::Down);
    }

    #[test]
    fn folder_health_follows_the_watcher() {
        let mut s = FileWatcherStatus {
            integration_id: 2,
            name: "Exigo".into(),
            watch_directory: "/lab".into(),
            status: FileWatcherState::Watching,
            last_error: None,
            error_kind: None,
            files_processed: 0,
            last_result_at: None,
        };
        assert_eq!(folder_health(&s), Health::Working);
        s.status = FileWatcherState::Error;
        assert_eq!(folder_health(&s), Health::Down);
        s.status = FileWatcherState::Stopped;
        assert_eq!(folder_health(&s), Health::Off);
    }

    #[test]
    fn a_machine_is_a_problem_only_after_the_grace_period() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        let down = [device(1, "Blood analyzer", Health::Down)];
        assert!(tracker.observe(monday(10, 42), &down, &s).problems.is_empty());
        let later = tracker.observe(monday(10, 43), &down, &s);
        assert_eq!(
            later.problems,
            vec![DeviceProblem {
                integration_id: 1,
                name: "Blood analyzer".into(),
                kind: ProblemKind::NoConnection { since: monday(10, 42) },
            }]
        );
    }

    #[test]
    fn down_for_n_minutes_in_clinic_hours_notifies_once_then_back_online_once() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        let down = [device(1, "Blood analyzer", Health::Down)];
        let up = [device(1, "Blood analyzer", Health::Working)];

        assert!(tracker.observe(monday(10, 42), &down, &s).alerts.is_empty());
        assert!(tracker.observe(monday(10, 51), &down, &s).alerts.is_empty());
        let alerts = tracker.observe(monday(10, 52), &down, &s).alerts;
        assert_eq!(alerts.len(), 1);
        assert!(matches!(&alerts[0], Alert::Down(p) if p.kind == ProblemKind::NoConnection { since: monday(10, 42) }));
        assert!(tracker.observe(monday(11, 30), &down, &s).alerts.is_empty(), "one notification per incident");

        let back = tracker.observe(monday(11, 31), &up, &s);
        assert_eq!(back.alerts, vec![Alert::BackOnline { integration_id: 1, name: "Blood analyzer".into() }]);
        assert!(back.problems.is_empty());
        assert!(tracker.observe(monday(11, 32), &up, &s).alerts.is_empty());
    }

    #[test]
    fn a_short_outage_back_before_the_threshold_sends_nothing() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        tracker.observe(monday(10, 0), &[device(1, "PointCare", Health::Down)], &s);
        let back = tracker.observe(monday(10, 5), &[device(1, "PointCare", Health::Working)], &s);
        assert!(back.alerts.is_empty());
    }

    #[test]
    fn no_notification_outside_clinic_hours_but_one_when_the_clinic_opens() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        let down = [device(1, "Blood analyzer", Health::Down)];
        assert!(tracker.observe(local(2026, 10, 18, 22, 0), &down, &s).alerts.is_empty(), "Sunday night");
        assert!(tracker.observe(local(2026, 10, 19, 6, 30), &down, &s).alerts.is_empty());
        let open = tracker.observe(monday(7, 0), &down, &s).alerts;
        assert!(matches!(&open[0], Alert::Down(p) if p.kind == ProblemKind::NoConnection { since: local(2026, 10, 18, 22, 0) }));
    }

    #[test]
    fn notifications_off_still_show_the_problem_in_the_tray() {
        let s = DeviceAlertSettings { notify_enabled: false, ..DeviceAlertSettings::default() };
        let mut tracker = HealthTracker::default();
        let down = [device(1, "Blood analyzer", Health::Down)];
        tracker.observe(monday(10, 0), &down, &s);
        let later = tracker.observe(monday(10, 30), &down, &s);
        assert!(later.alerts.is_empty());
        assert_eq!(later.problems.len(), 1);
    }

    #[test]
    fn flapping_between_connecting_and_error_keeps_the_first_down_time() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        tracker.observe(monday(9, 12), &[device(1, "PointCare", Health::Down)], &s);
        tracker.observe(monday(9, 13), &[device(1, "PointCare", Health::Starting)], &s);
        let obs = tracker.observe(monday(9, 14), &[device(1, "PointCare", Health::Down)], &s);
        assert_eq!(obs.problems[0].kind, ProblemKind::NoConnection { since: monday(9, 12) });
    }

    #[test]
    fn a_disabled_machine_is_forgotten() {
        let s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        tracker.observe(monday(9, 0), &[device(1, "PointCare", Health::Down)], &s);
        tracker.observe(monday(9, 30), &[device(1, "PointCare", Health::Down)], &s);
        let off = tracker.observe(monday(9, 31), &[device(1, "PointCare", Health::Off)], &s);
        assert!(off.problems.is_empty() && off.alerts.is_empty());
        let again = tracker.observe(monday(9, 32), &[device(1, "PointCare", Health::Down)], &s);
        assert!(again.problems.is_empty(), "a new incident starts its own grace period");
    }

    #[test]
    fn quiet_alert_is_opt_in_per_device() {
        let mut s = DeviceAlertSettings::default();
        let mut tracker = HealthTracker::default();
        let mut quiet = device(1, "Exigo", Health::Working);
        quiet.last_result_at = Some(monday(8, 0));
        assert!(tracker.observe(monday(15, 0), &[quiet.clone()], &s).problems.is_empty(), "off by default");

        s.quiet_alerts = vec![QuietAlert { integration_id: 1, after_hours: 3 }];
        assert!(tracker.observe(monday(10, 59), &[quiet.clone()], &s).alerts.is_empty());
        let obs = tracker.observe(monday(11, 0), &[quiet.clone()], &s);
        let expected = DeviceProblem {
            integration_id: 1,
            name: "Exigo".into(),
            kind: ProblemKind::Quiet { last_result: Some(monday(8, 0)) },
        };
        assert_eq!(obs.problems, vec![expected.clone()]);
        assert_eq!(obs.alerts, vec![Alert::Quiet(expected)]);
        assert!(tracker.observe(monday(12, 0), &[quiet.clone()], &s).alerts.is_empty(), "once per incident");

        quiet.last_result_at = Some(monday(12, 30));
        let fresh = tracker.observe(monday(12, 31), &[quiet.clone()], &s);
        assert!(fresh.problems.is_empty() && fresh.alerts.is_empty());
        let again = tracker.observe(monday(15, 30), &[quiet], &s);
        assert_eq!(again.alerts.len(), 1, "a new quiet stretch is a new incident");
    }

    #[test]
    fn quiet_time_counts_from_opening_not_from_last_night() {
        let s = DeviceAlertSettings {
            quiet_alerts: vec![QuietAlert { integration_id: 1, after_hours: 2 }],
            ..DeviceAlertSettings::default()
        };
        let mut tracker = HealthTracker::default();
        let mut d = device(1, "Exigo", Health::Working);
        d.last_result_at = Some(local(2026, 10, 17, 18, 0));
        assert!(tracker.observe(monday(8, 59), &[d.clone()], &s).problems.is_empty());
        assert_eq!(tracker.observe(monday(9, 0), &[d.clone()], &s).problems.len(), 1);
        assert!(tracker.observe(monday(20, 30), &[d], &s).problems.is_empty(), "not after closing");
    }

    #[test]
    fn tray_says_all_ok_or_names_the_problem_in_the_app_language() {
        let now = monday(11, 0);
        assert_eq!(tray_summary(&[], 2, now, Lang::En), TraySummary { warning: false, tooltip: "Arkivet — All devices OK".into() });
        assert_eq!(tray_summary(&[], 2, now, Lang::Mk).tooltip, "Arkivet — Сите уреди работат");
        assert_eq!(tray_summary(&[], 0, now, Lang::En), TraySummary { warning: false, tooltip: "Arkivet".into() });

        let down = DeviceProblem {
            integration_id: 1,
            name: "Blood analyzer".into(),
            kind: ProblemKind::NoConnection { since: monday(10, 42) },
        };
        let s = tray_summary(&[down.clone()], 2, now, Lang::En);
        assert!(s.warning);
        assert_eq!(s.tooltip, "Arkivet\nBlood analyzer: no connection since 10:42");
        assert_eq!(tray_summary(&[down], 2, now, Lang::Mk).tooltip, "Arkivet\nBlood analyzer: нема врска од 10:42");
    }

    #[test]
    fn problem_lines_show_the_date_when_it_was_not_today() {
        let now = monday(11, 0);
        let quiet = |last| DeviceProblem { integration_id: 1, name: "Exigo".into(), kind: ProblemKind::Quiet { last_result: last } };
        assert_eq!(problem_line(&quiet(Some(monday(9, 10))), now, Lang::En), "Exigo: no results since 09:10");
        assert_eq!(problem_line(&quiet(Some(local(2026, 10, 17, 18, 5))), now, Lang::En), "Exigo: no results since 17.10. 18:05");
        assert_eq!(problem_line(&quiet(None), now, Lang::En), "Exigo: no results today");
        assert_eq!(problem_line(&quiet(None), now, Lang::Mk), "Exigo: нема резултати денес");
        assert_eq!(problem_line(&quiet(Some(monday(9, 10))), now, Lang::Mk), "Exigo: нема резултати од 09:10");
    }

    #[test]
    fn a_long_tooltip_is_cut_to_what_windows_shows() {
        let problems: Vec<DeviceProblem> = (0..6)
            .map(|i| DeviceProblem {
                integration_id: i,
                name: format!("Хематолошки анализатор {i}"),
                kind: ProblemKind::NoConnection { since: monday(10, 42) },
            })
            .collect();
        let s = tray_summary(&problems, 6, monday(11, 0), Lang::Mk);
        assert!(s.tooltip.chars().count() <= TOOLTIP_MAX_CHARS);
        assert!(s.tooltip.ends_with('…'));
    }

    #[test]
    fn notification_texts_say_what_happened_and_what_to_do() {
        let now = monday(11, 0);
        let down = DeviceProblem {
            integration_id: 1,
            name: "Blood analyzer".into(),
            kind: ProblemKind::NoConnection { since: monday(10, 42) },
        };
        let en = alert_text(&Alert::Down(down.clone()), now, Lang::En);
        assert_eq!(en.title, "Lab machine not connected");
        assert!(en.body.starts_with("Blood analyzer: no connection since 10:42."));
        let mk = alert_text(&Alert::Down(down), now, Lang::Mk);
        assert!(mk.body.starts_with("Blood analyzer: нема врска од 10:42."));

        let back = alert_text(&Alert::BackOnline { integration_id: 1, name: "Blood analyzer".into() }, now, Lang::En);
        assert_eq!(back.title, "Lab machine back online");
        assert!(back.body.contains("Blood analyzer"));
        let quiet = DeviceProblem { integration_id: 1, name: "Exigo".into(), kind: ProblemKind::Quiet { last_result: None } };
        assert!(alert_text(&Alert::Quiet(quiet), now, Lang::Mk).body.starts_with("Exigo: нема резултати денес."));
    }

    #[test]
    fn byte_counter_covers_the_last_minute_only() {
        let t0 = Utc.with_ymd_and_hms(2026, 10, 19, 8, 0, 0).unwrap();
        let mut w = ByteWindow::default();
        w.add(t0, 100);
        w.add(t0 + Duration::seconds(30), 50);
        assert_eq!(w.in_last_minute(t0 + Duration::seconds(45)), 150);
        assert_eq!(w.in_last_minute(t0 + Duration::seconds(75)), 50);
        assert_eq!(w.in_last_minute(t0 + Duration::seconds(200)), 0);
    }

    #[test]
    fn raw_message_is_readable_with_a_hex_view_and_capped() {
        let m = raw_message(b"\x0bMSH|^~\\&|PointCare\rPID|1\r\x1c\r", "2026-10-19T08:55:00Z");
        assert_eq!(m.byte_count, 28);
        assert_eq!(m.text, "<0B>MSH|^~\\&|PointCare\nPID|1\n<1C>\n");
        assert!(m.hex.starts_with("0B 4D 53 48"));
        assert!(!m.truncated);

        let big = vec![b'A'; RAW_KEEP_BYTES + 10];
        let m = raw_message(&big, "2026-10-19T08:55:00Z");
        assert!(m.truncated);
        assert_eq!(m.byte_count, RAW_KEEP_BYTES + 10);
        assert_eq!(m.text.len(), RAW_KEEP_BYTES);
    }

    fn entry(at: &str, label: &str, is_error: bool) -> LogEntry {
        LogEntry { at: at.into(), label: label.into(), error_kind: None, is_error }
    }

    #[test]
    fn the_log_keeps_the_latest_entries_and_counts_todays_errors() {
        let mut log = VecDeque::new();
        for i in 0..(LOG_KEEP + 5) {
            push_log(&mut log, entry(&format!("2026-10-19T0{}:00:00+02:00", i % 9), "Connected", false));
        }
        assert_eq!(log.len(), LOG_KEEP);

        let mut log = VecDeque::new();
        push_log(&mut log, entry("2026-10-18T19:00:00+02:00", "Error", true));
        push_log(&mut log, entry("2026-10-19T09:12:00+02:00", "Error", true));
        push_log(&mut log, entry("2026-10-19T09:13:00+02:00", "Connected", false));
        push_log(&mut log, entry("2026-10-19T08:31:00Z", "cut_off", true));
        assert_eq!(errors_today(&log, monday(11, 0)), 2);
    }

    #[test]
    fn diagnostics_list_version_config_and_recent_history() {
        let text = diagnostics_text(&DiagnosticsInput {
            app_version: "0.7.4".into(),
            os: "windows x86_64".into(),
            generated_at: monday(11, 0),
            device: DeviceConfigSummary {
                name: "PointCare".into(),
                device_type: "mnchip_pointcare_chemistry".into(),
                connection_type: "serial_port".into(),
                enabled: true,
                port: Some("COM3".into()),
                baud_rate: Some(115200),
                folder: None,
                file_pattern: None,
            },
            state: "Error (port_missing)".into(),
            last_error: Some("Failed to open port: The system cannot find the file specified.".into()),
            last_result_at: Some("2026-10-19T08:55:00+02:00".into()),
            last_byte_at: None,
            bytes_last_minute: 0,
            errors_today: 2,
            log: vec![
                LogEntry { at: "2026-10-19T09:12:00+02:00".into(), label: "Error".into(), error_kind: Some("port_missing".into()), is_error: true },
                entry("2026-10-19T10:31:00+02:00", "cut_off", true),
            ],
        });
        for expected in [
            "Arkivet diagnostics",
            "App version: 0.7.4",
            "OS: windows x86_64",
            "Device: PointCare (mnchip_pointcare_chemistry)",
            "Port: COM3",
            "Baud rate: 115200",
            "State: Error (port_missing)",
            "Last error: Failed to open port",
            "Last result: 2026-10-19T08:55:00+02:00",
            "Last data: never",
            "Errors today: 2",
            "2026-10-19T09:12:00+02:00  Error (port_missing)",
            "2026-10-19T10:31:00+02:00  cut_off",
        ] {
            assert!(text.contains(expected), "missing {expected:?} in:\n{text}");
        }
        assert!(!text.contains("Folder:"));
    }
}
