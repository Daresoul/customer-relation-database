//! Lab machine health outside the window: the tray tooltip and icon, OS
//! notifications when a machine is down or quiet during clinic hours, and the
//! data behind the device details drawer. Read-only: nothing here talks to a port.

use chrono::{DateTime, Duration, FixedOffset, Utc};
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
        todo!("{code}")
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
        todo!()
    }
}

impl DeviceAlertSettings {
    pub fn validate(&self) -> Result<(), String> {
        todo!()
    }

    fn quiet_hours_for(&self, integration_id: i64) -> Option<u32> {
        self.quiet_alerts.iter().find(|q| q.integration_id == integration_id).map(|q| q.after_hours)
    }
}

pub fn is_clinic_hours(settings: &DeviceAlertSettings, at: DateTime<FixedOffset>) -> bool {
    todo!("{settings:?} {at}")
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
    todo!("{status:?}")
}

pub fn folder_health(status: &FileWatcherStatus) -> Health {
    todo!("{status:?}")
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
        todo!("{now} {devices:?} {settings:?}")
    }
}

pub fn problem_line(problem: &DeviceProblem, now: DateTime<FixedOffset>, lang: Lang) -> String {
    todo!("{problem:?} {now} {lang:?}")
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
    todo!("{problems:?} {device_count} {now} {lang:?}")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotificationText {
    pub title: String,
    pub body: String,
}

pub fn alert_text(alert: &Alert, now: DateTime<FixedOffset>, lang: Lang) -> NotificationText {
    todo!("{alert:?} {now} {lang:?}")
}

/// Bytes received per machine, for the "N bytes in the last minute" counter.
#[derive(Default, Debug)]
pub struct ByteWindow {
    samples: VecDeque<(DateTime<Utc>, usize)>,
}

impl ByteWindow {
    pub fn add(&mut self, at: DateTime<Utc>, bytes: usize) {
        todo!("{at} {bytes} {:?}", self.samples)
    }

    pub fn in_last_minute(&self, now: DateTime<Utc>) -> usize {
        todo!("{now}")
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
    todo!("{bytes:?} {at}")
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
    todo!("{log:?} {entry:?}")
}

pub fn errors_today(log: &VecDeque<LogEntry>, now: DateTime<FixedOffset>) -> usize {
    todo!("{log:?} {now}")
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
    todo!("{input:?}")
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
