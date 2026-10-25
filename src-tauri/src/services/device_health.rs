//! Lab machine health outside the window: the tray tooltip and icon, OS
//! notifications when a machine is down or quiet during clinic hours, and the
//! data behind the device details drawer. Read-only: nothing here talks to a port.

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, OnceLock};

use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait};

use crate::models::device_integration::{ConnectionType, DeviceIntegration};
use crate::services::device_events::{DeviceErrorKind, DeviceEventKind};
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

/// The clinic's date setting (DD/MM/YYYY …) as a chrono day-and-month pattern.
pub fn day_month_pattern(date_format: &str) -> &'static str {
    match date_format {
        "DD.MM.YYYY" => "%d.%m",
        "MM/DD/YYYY" => "%m/%d",
        "YYYY-MM-DD" => "%m-%d",
        _ => "%d/%m",
    }
}

/// "10:42" today, "17/10 18:05" on an earlier day (day and month as the clinic writes them).
fn when(at: DateTime<FixedOffset>, now: DateTime<FixedOffset>, day_month: &str) -> String {
    let at = at.with_timezone(now.offset());
    if at.date_naive() == now.date_naive() {
        at.format("%H:%M").to_string()
    } else {
        format!("{} {}", at.format(day_month), at.format("%H:%M"))
    }
}

pub fn problem_line(problem: &DeviceProblem, now: DateTime<FixedOffset>, lang: Lang, day_month: &str) -> String {
    let name = &problem.name;
    match (&problem.kind, lang) {
        (ProblemKind::NoConnection { since }, Lang::En) => format!("{name}: no connection since {}", when(*since, now, day_month)),
        (ProblemKind::NoConnection { since }, Lang::Mk) => format!("{name}: нема врска од {}", when(*since, now, day_month)),
        (ProblemKind::Quiet { last_result: Some(at) }, Lang::En) => format!("{name}: no results since {}", when(*at, now, day_month)),
        (ProblemKind::Quiet { last_result: Some(at) }, Lang::Mk) => format!("{name}: нема резултати од {}", when(*at, now, day_month)),
        (ProblemKind::Quiet { last_result: None }, Lang::En) => format!("{name}: no results today"),
        (ProblemKind::Quiet { last_result: None }, Lang::Mk) => format!("{name}: нема резултати денес"),
    }
}

/// Windows cuts tray tooltips at 127 characters.
pub const TOOLTIP_MAX_CHARS: usize = 127;
/// What the Windows 11 tray actually shows of the tooltip.
pub const TOOLTIP_FIRST_LINE_CHARS: usize = 63;

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
    day_month: &str,
) -> TraySummary {
    if problems.is_empty() {
        let tooltip = match (device_count, lang) {
            (0, _) => "Arkivet".to_string(),
            (_, Lang::En) => "Arkivet — All devices OK".to_string(),
            (_, Lang::Mk) => "Arkivet — Сите уреди работат".to_string(),
        };
        return TraySummary { warning: false, tooltip };
    }
    // Windows 11 shows only the first ~64 characters, so the summary goes first.
    let mut tooltip = if let [only] = problems {
        format!("Arkivet — {}", problem_line(only, now, lang, day_month))
    } else {
        let mut t = match lang {
            Lang::En => format!("Arkivet — {} machines need attention", problems.len()),
            Lang::Mk => format!("Arkivet — {} апарати бараат внимание", problems.len()),
        };
        for p in problems {
            t.push('\n');
            t.push_str(&problem_line(p, now, lang, day_month));
        }
        t
    };
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

pub fn alert_text(alert: &Alert, now: DateTime<FixedOffset>, lang: Lang, day_month: &str) -> NotificationText {
    let (title, body) = match (alert, lang) {
        (Alert::Down(p), Lang::En) => (
            "Lab machine not connected",
            format!("{}. Check that it is on and the cable is plugged in, then press Reconnect in Arkivet.", problem_line(p, now, lang, day_month)),
        ),
        (Alert::Down(p), Lang::Mk) => (
            "Лабораторискиот уред не е поврзан",
            format!("{}. Проверете дали е вклучен и дали кабелот е приклучен, па притиснете Повторно поврзи во Arkivet.", problem_line(p, now, lang, day_month)),
        ),
        (Alert::Quiet(p), Lang::En) => (
            "Lab machine is quiet",
            format!("{}. If tests were run, check that it is on and connected.", problem_line(p, now, lang, day_month)),
        ),
        (Alert::Quiet(p), Lang::Mk) => (
            "Лабораторискиот уред не праќа резултати",
            format!("{}. Ако се правени тестови, проверете дали е вклучен и поврзан.", problem_line(p, now, lang, day_month)),
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

// ---- Stored settings -------------------------------------------------------

pub async fn load_alert_settings(db: &DatabaseConnection) -> Result<DeviceAlertSettings, String> {
    let fail = |e: sea_orm::DbErr| format!("Failed to read the device alert settings: {e}");
    let mut settings = DeviceAlertSettings::default();
    let row = db
        .query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT notify_enabled, down_after_minutes, clinic_open, clinic_close, clinic_days \
             FROM device_alert_settings WHERE id = 1",
        ))
        .await
        .map_err(fail)?;
    if let Some(row) = row {
        settings.notify_enabled = row.try_get::<i64>("", "notify_enabled").map_err(fail)? != 0;
        settings.down_after_minutes = row.try_get::<i64>("", "down_after_minutes").map_err(fail)? as u32;
        settings.clinic_open = row.try_get("", "clinic_open").map_err(fail)?;
        settings.clinic_close = row.try_get("", "clinic_close").map_err(fail)?;
        let days: String = row.try_get("", "clinic_days").map_err(fail)?;
        settings.clinic_days = days.split(',').filter_map(|d| d.trim().parse().ok()).collect();
    }
    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT q.integration_id, q.after_hours FROM device_quiet_alerts q \
             JOIN device_integrations d ON d.id = q.integration_id \
             WHERE d.deleted_at IS NULL ORDER BY q.integration_id",
        ))
        .await
        .map_err(fail)?;
    for row in rows {
        settings.quiet_alerts.push(QuietAlert {
            integration_id: row.try_get("", "integration_id").map_err(fail)?,
            after_hours: row.try_get::<i64>("", "after_hours").map_err(fail)? as u32,
        });
    }
    Ok(settings)
}

pub async fn save_alert_settings(
    db: &DatabaseConnection,
    settings: &DeviceAlertSettings,
) -> Result<DeviceAlertSettings, String> {
    settings.validate()?;
    let fail = |e: sea_orm::DbErr| format!("Failed to save the device alert settings: {e}");
    let mut days = settings.clinic_days.clone();
    days.sort_unstable();
    days.dedup();
    let days = days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(",");

    let txn = db.begin().await.map_err(fail)?;
    txn.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "INSERT OR REPLACE INTO device_alert_settings \
         (id, notify_enabled, down_after_minutes, clinic_open, clinic_close, clinic_days, updated_at) \
         VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
        [
            (settings.notify_enabled as i64).into(),
            (settings.down_after_minutes as i64).into(),
            settings.clinic_open.trim().into(),
            settings.clinic_close.trim().into(),
            days.into(),
        ],
    ))
    .await
    .map_err(fail)?;
    txn.execute(Statement::from_string(DbBackend::Sqlite, "DELETE FROM device_quiet_alerts"))
        .await
        .map_err(fail)?;
    for q in &settings.quiet_alerts {
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT OR REPLACE INTO device_quiet_alerts (integration_id, after_hours) VALUES (?, ?)",
            [q.integration_id.into(), (q.after_hours as i64).into()],
        ))
        .await
        .map_err(fail)?;
    }
    txn.commit().await.map_err(fail)?;
    load_alert_settings(db).await
}

// ---- What each machine did this session --------------------------------------

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDetails {
    pub bytes_last_minute: usize,
    pub errors_today: usize,
    pub last_raw: Option<RawMessage>,
    /// Oldest first.
    pub log: Vec<LogEntry>,
    /// When the current outage began; none while it works.
    pub down_since: Option<String>,
    pub outages_today: u32,
    pub down_minutes_today: i64,
    pub drops_last_hour: u32,
}

#[derive(Default)]
struct DeviceRuntime {
    bytes: ByteWindow,
    last_raw: Option<RawMessage>,
    log: VecDeque<LogEntry>,
    last_health: Option<Health>,
    day: OutageDay,
    last_noise_note: Option<DateTime<Utc>>,
}

/// Today's outages of one machine, by the clinic's local day.
#[derive(Default)]
struct OutageDay {
    day: Option<chrono::NaiveDate>,
    outages: u32,
    events: u32,
    down_secs: i64,
    down_since: Option<DateTime<Utc>>,
}

fn local_day(at: DateTime<Utc>) -> chrono::NaiveDate {
    at.with_timezone(&chrono::Local).date_naive()
}

fn local_midnight(at: DateTime<Utc>) -> DateTime<Utc> {
    local_day(at)
        .and_hms_opt(0, 0, 0)
        .and_then(|m| m.and_local_timezone(chrono::Local).earliest())
        .map(|m| m.with_timezone(&Utc))
        .unwrap_or(at)
}

impl OutageDay {
    fn roll(&mut self, at: DateTime<Utc>) {
        let today = local_day(at);
        if self.day != Some(today) {
            self.day = Some(today);
            // An outage still going on at midnight is today's too.
            self.outages = u32::from(self.down_since.is_some());
            self.events = 0;
            self.down_secs = 0;
        }
    }

    fn went_down(&mut self, at: DateTime<Utc>) {
        self.roll(at);
        if self.down_since.is_none() {
            self.down_since = Some(at);
            self.outages += 1;
        }
    }

    fn came_back(&mut self, at: DateTime<Utc>) {
        self.roll(at);
        if let Some(since) = self.down_since.take() {
            self.down_secs += (at - since.max(local_midnight(at))).num_seconds().max(0);
        }
    }

    fn event(&mut self, at: DateTime<Utc>) {
        self.roll(at);
        self.events += 1;
    }

    /// (outages, problem events, seconds without connection) for the day of `now`.
    fn today(&self, now: DateTime<Utc>) -> (u32, u32, i64) {
        let ongoing = self.down_since.map_or(0, |since| (now - since.max(local_midnight(now))).num_seconds().max(0));
        if self.day == Some(local_day(now)) {
            (self.outages, self.events, self.down_secs + ongoing)
        } else {
            (u32::from(self.down_since.is_some()), 0, ongoing)
        }
    }
}

static RUNTIME: OnceLock<Mutex<HashMap<i64, DeviceRuntime>>> = OnceLock::new();

fn with_runtime<R>(integration_id: i64, f: impl FnOnce(&mut DeviceRuntime) -> R) -> R {
    let mut all = RUNTIME
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    f(all.entry(integration_id).or_default())
}

fn snake_case<T: Serialize>(value: &T) -> Option<String> {
    serde_json::to_value(value).ok()?.as_str().map(str::to_string)
}

pub fn note_bytes(integration_id: i64, bytes: usize) {
    with_runtime(integration_id, |rt| rt.bytes.add(Utc::now(), bytes));
}

pub fn note_raw_message(integration_id: i64, raw: &[u8]) {
    let message = raw_message(raw, &Utc::now().to_rfc3339());
    with_runtime(integration_id, |rt| rt.last_raw = Some(message));
}

/// A connection state change. Only the step into "down" counts as an error, so
/// a port retrying every minute is one error, not sixty.
pub fn record_status(integration_id: i64, label: &str, error_kind: Option<DeviceErrorKind>, health: Health) {
    record_status_at(integration_id, label, error_kind, health, Utc::now());
}

pub(crate) fn record_status_at(
    integration_id: i64,
    label: &str,
    error_kind: Option<DeviceErrorKind>,
    health: Health,
    at: DateTime<Utc>,
) {
    with_runtime(integration_id, |rt| {
        let was_down = rt.day.down_since.is_some();
        let is_error = health == Health::Down && rt.last_health != Some(Health::Down);
        if health != Health::Starting {
            rt.last_health = Some(health);
        }
        match health {
            Health::Down => rt.day.went_down(at),
            Health::Working | Health::Off => rt.day.came_back(at),
            Health::Starting => {}
        }
        let kind = error_kind.as_ref().and_then(snake_case);
        // While down, the retries ("Connecting", the same error again) are not news;
        // a different cause is.
        let repeat = was_down && health == Health::Down
            && (kind.is_none() || rt.log.back().and_then(|e| e.error_kind.as_ref()) == kind.as_ref());
        if !repeat {
            push_log(&mut rt.log, LogEntry { at: at.to_rfc3339(), label: label.to_string(), error_kind: kind, is_error });
        }
    });
    kick_monitor();
}

/// Data that is not a result (wrong speed or machine type), at most once per ten minutes.
pub fn note_unrecognized(integration_id: i64, bytes: usize) {
    note_unrecognized_at(integration_id, bytes, Utc::now());
}

pub(crate) fn note_unrecognized_at(integration_id: i64, bytes: usize, at: DateTime<Utc>) {
    with_runtime(integration_id, |rt| {
        if rt.last_noise_note.is_some_and(|last| at - last < Duration::minutes(10)) {
            return;
        }
        rt.last_noise_note = Some(at);
        log::warn!("Integration {integration_id}: {bytes} bytes that are not a result (wrong speed or machine type?)");
        push_log(&mut rt.log, LogEntry { at: at.to_rfc3339(), label: "unrecognized_data".into(), error_kind: None, is_error: false });
    });
}

pub fn record_event(integration_id: i64, kind: DeviceEventKind) {
    let label = snake_case(&kind).unwrap_or_else(|| format!("{kind:?}"));
    with_runtime(integration_id, |rt| {
        let at = Utc::now();
        rt.day.event(at);
        push_log(&mut rt.log, LogEntry { at: at.to_rfc3339(), label, error_kind: None, is_error: true });
    });
}

pub fn device_details(integration_id: i64, now: DateTime<FixedOffset>) -> DeviceDetails {
    with_runtime(integration_id, |rt| {
        let (outages, events, down_secs) = rt.day.today(now.with_timezone(&Utc));
        DeviceDetails {
            bytes_last_minute: rt.bytes.in_last_minute(Utc::now()),
            errors_today: (outages + events) as usize,
            last_raw: rt.last_raw.clone(),
            log: rt.log.iter().cloned().collect(),
            down_since: rt.day.down_since.map(|at| at.to_rfc3339()),
            outages_today: outages,
            down_minutes_today: down_secs / 60,
            drops_last_hour: 0,
        }
    })
}

static KICK: OnceLock<tokio::sync::Notify> = OnceLock::new();

fn kick() -> &'static tokio::sync::Notify {
    KICK.get_or_init(tokio::sync::Notify::new)
}

/// Ask the monitor to look again soon, e.g. after a status change.
pub fn kick_monitor() {
    kick().notify_one();
}

/// Enabled machines with their current health, for the tray and the notifier.
pub fn snapshots(
    integrations: &[DeviceIntegration],
    serial: &[DeviceConnectionStatus],
    folders: &[FileWatcherStatus],
    stored_last_results: &HashMap<i64, String>,
) -> Vec<DeviceSnapshot> {
    integrations
        .iter()
        .filter(|i| i.enabled)
        .filter_map(|i| {
            let (health, last) = match i.connection_type {
                ConnectionType::SerialPort => serial
                    .iter()
                    .filter(|s| s.integration_id == i.id)
                    .max_by_key(|s| Some(&s.port_name) == i.serial_port_name.as_ref())
                    .map(|s| (serial_health(s), s.last_result_at.clone()))
                    .unwrap_or((Health::Starting, None)),
                ConnectionType::FileWatch => folders
                    .iter()
                    .find(|f| f.integration_id == i.id)
                    .map(|f| (folder_health(f), f.last_result_at.clone()))
                    .unwrap_or((Health::Starting, None)),
                ConnectionType::Hl7Tcp => return None,
            };
            let last = last
                .or_else(|| stored_last_results.get(&i.id).cloned())
                .and_then(|at| DateTime::parse_from_rfc3339(&at).ok());
            Some(DeviceSnapshot { integration_id: i.id, name: i.name.clone(), health, last_result_at: last })
        })
        .collect()
}

// ---- Tray and notifications ------------------------------------------------

const TRAY_ICON: &[u8] = include_bytes!("../../icons/32x32.png");
const TRAY_WARNING_ICON: &[u8] = include_bytes!("../../icons/tray-warning.png");

fn tray_icon(png: &[u8]) -> Option<tauri::Icon> {
    let image = image::load_from_memory(png).ok()?.into_rgba8();
    let (width, height) = image.dimensions();
    Some(tauri::Icon::Rgba { rgba: image.into_raw(), width, height })
}

/// Checks machine health in the background: at start, after each status
/// change (a burst settles for 2 s first) and every 30 s, so grace periods and
/// clinic hours tick over without a status change.
pub fn start_monitor(app: tauri::AppHandle, db: crate::database::SeaOrmPool) {
    tauri::async_runtime::spawn(async move {
        let mut tracker = HealthTracker::default();
        let mut shown: Option<TraySummary> = None;
        loop {
            check_once(&app, &db, &mut tracker, &mut shown).await;
            let _ = tokio::time::timeout(std::time::Duration::from_secs(30), kick().notified()).await;
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });
}

async fn check_once(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    tracker: &mut HealthTracker,
    shown: &mut Option<TraySummary>,
) {
    use crate::services::device_events::last_result;
    use crate::services::device_integration::DeviceIntegrationService;

    let settings = load_alert_settings(db).await.unwrap_or_else(|e| {
        log::warn!("Device alerts: using defaults, settings not readable: {e}");
        DeviceAlertSettings::default()
    });
    let app_settings = crate::services::settings::SettingsService::get_settings(db, "default").await.ok();
    let lang = app_settings.as_ref().map(|s| Lang::from_code(&s.settings.language)).unwrap_or(Lang::En);
    let day_month = day_month_pattern(app_settings.as_ref().map(|s| s.settings.date_format.as_str()).unwrap_or(""));
    let integrations = DeviceIntegrationService::get_all(db).await.unwrap_or_default();
    let stored = DeviceIntegrationService::last_result_times(db).await.unwrap_or_default();

    let mut serial = crate::services::device_input::get_all_connection_statuses();
    for s in &mut serial {
        s.last_result_at = last_result(s.integration_id).or(s.last_result_at.take());
    }
    let mut folders = crate::services::file_watcher::get_all_file_watcher_statuses();
    for f in &mut folders {
        f.last_result_at = last_result(f.integration_id).or(f.last_result_at.take());
    }

    let devices = snapshots(&integrations, &serial, &folders, &stored);
    let now = chrono::Local::now().fixed_offset();
    let observed = tracker.observe(now, &devices, &settings);

    let summary = tray_summary(&observed.problems, devices.len(), now, lang, day_month);
    if shown.as_ref() != Some(&summary) {
        show_in_tray(app, &summary, lang);
        *shown = Some(summary);
    }
    for alert in &observed.alerts {
        let text = alert_text(alert, now, lang, day_month);
        log::info!("Device alert: {} | {}", text.title, text.body);
        let identifier = app.config().tauri.bundle.identifier.clone();
        if let Err(e) = tauri::api::notification::Notification::new(identifier)
            .title(&text.title)
            .body(&text.body)
            .show()
        {
            log::warn!("Could not show the device notification: {e}");
        }
    }
}

/// The tray menu's items (id, title) in the app language.
pub fn tray_menu_titles(lang: Lang) -> [(&'static str, &'static str); 3] {
    match lang {
        Lang::En => [("show", "Show"), ("hide", "Hide"), ("quit", "Quit")],
        Lang::Mk => [("show", "Прикажи"), ("hide", "Сокриј"), ("quit", "Излез")],
    }
}

fn show_in_tray(app: &tauri::AppHandle, summary: &TraySummary, lang: Lang) {
    let tray = app.tray_handle();
    for (id, title) in tray_menu_titles(lang) {
        let _ = tray.get_item(id).set_title(title);
    }
    if let Err(e) = tray.set_tooltip(&summary.tooltip) {
        log::debug!("Tray tooltip not set: {e}");
    }
    let icon = tray_icon(if summary.warning { TRAY_WARNING_ICON } else { TRAY_ICON });
    if let Some(icon) = icon {
        if let Err(e) = tray.set_icon(icon) {
            log::warn!("Tray icon not set: {e}");
        }
    }
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
    fn earlier_days_follow_the_clinics_date_setting() {
        assert_eq!(day_month_pattern("DD/MM/YYYY"), "%d/%m");
        assert_eq!(day_month_pattern("DD.MM.YYYY"), "%d.%m");
        assert_eq!(day_month_pattern("MM/DD/YYYY"), "%m/%d");
        assert_eq!(day_month_pattern("YYYY-MM-DD"), "%m-%d");
        assert_eq!(day_month_pattern(""), "%d/%m");
        let now = local(2026, 10, 19, 11, 0);
        let quiet = DeviceProblem { integration_id: 1, name: "Exigo".into(), kind: ProblemKind::Quiet { last_result: Some(local(2026, 10, 17, 18, 5)) } };
        assert_eq!(problem_line(&quiet, now, Lang::En, day_month_pattern("DD/MM/YYYY")), "Exigo: no results since 17/10 18:05");
    }

    #[test]
    fn the_tray_menu_speaks_the_app_language() {
        assert_eq!(tray_menu_titles(Lang::Mk), [("show", "Прикажи"), ("hide", "Сокриј"), ("quit", "Излез")]);
        assert_eq!(tray_menu_titles(Lang::En), [("show", "Show"), ("hide", "Hide"), ("quit", "Quit")]);
    }

    #[test]
    fn tray_says_all_ok_or_names_the_problem_in_the_app_language() {
        let now = monday(11, 0);
        assert_eq!(tray_summary(&[], 2, now, Lang::En, "%d.%m."), TraySummary { warning: false, tooltip: "Arkivet — All devices OK".into() });
        assert_eq!(tray_summary(&[], 2, now, Lang::Mk, "%d.%m.").tooltip, "Arkivet — Сите уреди работат");
        assert_eq!(tray_summary(&[], 0, now, Lang::En, "%d.%m."), TraySummary { warning: false, tooltip: "Arkivet".into() });

        let down = DeviceProblem {
            integration_id: 1,
            name: "Blood analyzer".into(),
            kind: ProblemKind::NoConnection { since: monday(10, 42) },
        };
        let s = tray_summary(&[down.clone()], 2, now, Lang::En, "%d.%m.");
        assert!(s.warning);
        assert_eq!(s.tooltip, "Arkivet — Blood analyzer: no connection since 10:42");
        assert_eq!(tray_summary(&[down], 2, now, Lang::Mk, "%d.%m.").tooltip, "Arkivet — Blood analyzer: нема врска од 10:42");
    }

    #[test]
    fn problem_lines_show_the_date_when_it_was_not_today() {
        let now = monday(11, 0);
        let quiet = |last| DeviceProblem { integration_id: 1, name: "Exigo".into(), kind: ProblemKind::Quiet { last_result: last } };
        assert_eq!(problem_line(&quiet(Some(monday(9, 10))), now, Lang::En, "%d.%m."), "Exigo: no results since 09:10");
        assert_eq!(problem_line(&quiet(Some(local(2026, 10, 17, 18, 5))), now, Lang::En, "%d.%m."), "Exigo: no results since 17.10. 18:05");
        assert_eq!(problem_line(&quiet(None), now, Lang::En, "%d.%m."), "Exigo: no results today");
        assert_eq!(problem_line(&quiet(None), now, Lang::Mk, "%d.%m."), "Exigo: нема резултати денес");
        assert_eq!(problem_line(&quiet(Some(monday(9, 10))), now, Lang::Mk, "%d.%m."), "Exigo: нема резултати од 09:10");
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
        let s = tray_summary(&problems, 6, monday(11, 0), Lang::Mk, "%d.%m.");
        assert!(s.tooltip.chars().count() <= TOOLTIP_MAX_CHARS);
        assert!(s.tooltip.ends_with('…'));
        // Windows 11 shows only about the first 64 characters: they hold the summary.
        let first = s.tooltip.lines().next().unwrap();
        assert_eq!(first, "Arkivet — 6 апарати бараат внимание");
        assert!(first.chars().count() <= TOOLTIP_FIRST_LINE_CHARS);
    }

    #[test]
    fn notification_texts_say_what_happened_and_what_to_do() {
        let now = monday(11, 0);
        let down = DeviceProblem {
            integration_id: 1,
            name: "Blood analyzer".into(),
            kind: ProblemKind::NoConnection { since: monday(10, 42) },
        };
        let en = alert_text(&Alert::Down(down.clone()), now, Lang::En, "%d.%m.");
        assert_eq!(en.title, "Lab machine not connected");
        assert!(en.body.starts_with("Blood analyzer: no connection since 10:42."));
        let mk = alert_text(&Alert::Down(down), now, Lang::Mk, "%d.%m.");
        assert!(mk.body.starts_with("Blood analyzer: нема врска од 10:42."));

        let back = alert_text(&Alert::BackOnline { integration_id: 1, name: "Blood analyzer".into() }, now, Lang::En, "%d.%m.");
        assert_eq!(back.title, "Lab machine back online");
        assert!(back.body.contains("Blood analyzer"));
        let quiet = DeviceProblem { integration_id: 1, name: "Exigo".into(), kind: ProblemKind::Quiet { last_result: None } };
        assert!(alert_text(&Alert::Quiet(quiet), now, Lang::Mk, "%d.%m.").body.starts_with("Exigo: нема резултати денес."));
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
    fn the_log_keeps_the_latest_entries() {
        let mut log = VecDeque::new();
        for i in 0..(LOG_KEEP + 5) {
            push_log(&mut log, entry(&format!("2026-10-19T0{}:00:00+02:00", i % 9), "Connected", false));
        }
        assert_eq!(log.len(), LOG_KEEP);
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

    async fn add_integration(db: &DatabaseConnection, name: &str) -> i64 {
        use sea_orm::{ConnectionTrait, DbBackend, Statement};
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO device_integrations (name, device_type, connection_type, watch_directory, file_pattern, enabled) \
             VALUES (?, 'exigo_eos_vet', 'file_watch', '/lab', '*.xml', 1)",
            [name.into()],
        ))
        .await
        .unwrap()
        .last_insert_id() as i64
    }

    #[tokio::test]
    async fn alert_settings_start_at_the_defaults() {
        let test_db = crate::test_utils::create_test_db_with_migrations().await;
        assert_eq!(load_alert_settings(&test_db.db).await.unwrap(), DeviceAlertSettings::default());
    }

    #[tokio::test]
    async fn alert_settings_are_saved_with_quiet_alerts_per_device() {
        let test_db = crate::test_utils::create_test_db_with_migrations().await;
        let db = &test_db.db;
        let exigo = add_integration(db, "Exigo").await;
        let wanted = DeviceAlertSettings {
            notify_enabled: false,
            down_after_minutes: 15,
            clinic_open: "08:00".into(),
            clinic_close: "18:30".into(),
            clinic_days: vec![1, 2, 3, 4, 5],
            quiet_alerts: vec![QuietAlert { integration_id: exigo, after_hours: 3 }],
        };
        assert_eq!(save_alert_settings(db, &wanted).await.unwrap(), wanted);
        assert_eq!(load_alert_settings(db).await.unwrap(), wanted);

        let fewer = DeviceAlertSettings { quiet_alerts: vec![], ..wanted };
        save_alert_settings(db, &fewer).await.unwrap();
        assert_eq!(load_alert_settings(db).await.unwrap(), fewer, "turning the quiet alert off removes it");
    }

    #[tokio::test]
    async fn invalid_alert_settings_are_refused_and_deleted_devices_ignored() {
        let test_db = crate::test_utils::create_test_db_with_migrations().await;
        let db = &test_db.db;
        let bad = DeviceAlertSettings { clinic_open: "21:00".into(), ..DeviceAlertSettings::default() };
        assert!(save_alert_settings(db, &bad).await.is_err());
        assert_eq!(load_alert_settings(db).await.unwrap(), DeviceAlertSettings::default());

        let gone = add_integration(db, "Old analyzer").await;
        let with_gone = DeviceAlertSettings {
            quiet_alerts: vec![QuietAlert { integration_id: gone, after_hours: 2 }],
            ..DeviceAlertSettings::default()
        };
        save_alert_settings(db, &with_gone).await.unwrap();
        crate::services::device_integration::DeviceIntegrationService::delete(db, gone).await.unwrap();
        assert!(load_alert_settings(db).await.unwrap().quiet_alerts.is_empty());
    }

    // Machine status #5: "Проблеми: 0 денес" after 180 failed retries, and the
    // recent list repeating "Connecting / Error" pairs.
    #[test]
    fn a_port_retrying_for_half_an_hour_is_one_outage_of_thirty_minutes() {
        let id = 9_100_010;
        let at = |h: u32, m: u32, sec: u32| Utc.with_ymd_and_hms(2026, 10, 19, h, m, sec).unwrap();
        record_status_at(id, "Connected", None, Health::Working, at(9, 0, 0));
        record_status_at(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down, at(9, 10, 0));
        for n in 0..120 {
            let s = 15 * n;
            record_status_at(id, "Connecting", None, Health::Down, at(9, 10 + s / 60, s % 60));
            record_status_at(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down, at(9, 10 + s / 60, s % 60));
        }
        record_status_at(id, "Connected", None, Health::Working, at(9, 40, 0));

        let d = device_details(id, at(10, 0, 0).fixed_offset());
        assert_eq!(d.outages_today, 1);
        assert_eq!(d.down_minutes_today, 30);
        assert_eq!(d.down_since, None);
        assert_eq!(d.log.iter().map(|e| e.label.as_str()).collect::<Vec<_>>(), ["Connected", "Error", "Connected"]);

        record_status_at(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down, at(10, 0, 0));
        let d = device_details(id, at(10, 15, 0).fixed_offset());
        assert_eq!(d.outages_today, 2);
        assert_eq!(d.down_minutes_today, 45, "the outage still going on counts too");
        assert_eq!(d.down_since.as_deref(), Some(at(10, 0, 0).to_rfc3339().as_str()));
    }

    // A machine on the wrong speed or type: data arrives, none of it a result.
    #[test]
    fn data_that_is_not_a_result_shows_in_the_history_once_per_ten_minutes() {
        let id = 9_100_012;
        let at = |m: u32| Utc.with_ymd_and_hms(2026, 10, 19, 9, m, 0).unwrap();
        note_unrecognized_at(id, 1200, at(0));
        note_unrecognized_at(id, 1500, at(5));
        let d = device_details(id, at(6).fixed_offset());
        assert_eq!(d.log.iter().filter(|e| e.label == "unrecognized_data").count(), 1);
        note_unrecognized_at(id, 1100, at(11));
        let d = device_details(id, at(12).fixed_offset());
        assert_eq!(d.log.iter().filter(|e| e.label == "unrecognized_data").count(), 2);
        assert_eq!(d.errors_today, 0, "not an outage");
    }

    // A USB adapter that Windows powers down drops again and again for a moment.
    #[test]
    fn drops_in_the_last_hour_are_counted() {
        let id = 9_100_013;
        let at = |h: u32, m: u32| Utc.with_ymd_and_hms(2026, 10, 19, h, m, 0).unwrap();
        for m in [0, 10, 20, 30] {
            record_status_at(id, "Error", Some(DeviceErrorKind::Disconnected), Health::Down, at(9, m));
            record_status_at(id, "Connected", None, Health::Working, at(9, m + 1));
        }
        assert_eq!(device_details(id, at(9, 45).fixed_offset()).drops_last_hour, 4);
        assert_eq!(device_details(id, at(11, 0).fixed_offset()).drops_last_hour, 0);
    }

    #[test]
    fn todays_outage_figures_start_again_each_day() {
        let id = 9_100_011;
        let at = |d: u32, h: u32, m: u32| Utc.with_ymd_and_hms(2026, 10, d, h, m, 0).unwrap();
        record_status_at(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down, at(19, 9, 0));
        record_status_at(id, "Connected", None, Health::Working, at(19, 9, 20));
        let d = device_details(id, at(20, 8, 0).fixed_offset());
        assert_eq!((d.outages_today, d.down_minutes_today), (0, 0));
    }

    #[test]
    fn details_count_bytes_keep_the_last_message_and_count_each_outage_once() {
        let id = 9_100_001;
        note_bytes(id, 120);
        note_bytes(id, 30);
        note_raw_message(id, b"MSH|1\rPID|Max\r");
        record_status(id, "Connected", None, Health::Working);
        record_status(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down);
        record_status(id, "Connecting", None, Health::Down);
        record_status(id, "Error", Some(DeviceErrorKind::PortMissing), Health::Down);
        record_status(id, "Connected", None, Health::Working);
        record_status(id, "Error", Some(DeviceErrorKind::Disconnected), Health::Down);
        record_event(id, DeviceEventKind::CutOff);

        let now = Utc::now().fixed_offset();
        let d = device_details(id, now);
        assert_eq!(d.bytes_last_minute, 150);
        assert_eq!(d.last_raw.as_ref().map(|m| m.text.as_str()), Some("MSH|1\nPID|Max\n"));
        assert_eq!(d.errors_today, 3, "two outages and one cut-off result");
        // The retry in between (Connecting, Error again) is not repeated.
        assert_eq!(d.log.len(), 5);
        assert_eq!(d.log[1].error_kind.as_deref(), Some("port_missing"));
        assert_eq!(d.log[4].label, "cut_off");

        let empty = device_details(9_100_002, now);
        assert_eq!(empty, DeviceDetails::default());
    }

    #[test]
    fn both_tray_icons_decode_to_the_same_size() {
        for png in [TRAY_ICON, TRAY_WARNING_ICON] {
            match tray_icon(png) {
                Some(tauri::Icon::Rgba { width, height, rgba }) => {
                    assert_eq!((width, height), (32, 32));
                    assert_eq!(rgba.len(), 32 * 32 * 4);
                }
                _ => panic!("tray icon must decode"),
            }
        }
    }

    struct NullSink;
    impl crate::services::device_events::DeviceSink for NullSink {
        fn result_ready(&self, _: &serde_json::Value, _: &crate::services::device_parser::DeviceData) {}
        fn device_event(&self, _: &crate::services::device_events::DeviceEvent) {}
        fn result_recorded(&self, _: i64) {}
    }

    #[tokio::test]
    async fn delivered_bytes_and_device_events_show_in_the_details() {
        use crate::services::device_events::{deliver_result, report_cut_off, ResultSource};
        let test_db = crate::test_utils::create_test_db_with_migrations().await;
        let dir = tempfile::tempdir().unwrap();
        let id = 9_200_001;
        let source = ResultSource {
            integration_id: id,
            device_name: "COM9".into(),
            device_type: "mnchip_pointcare_chemistry".into(),
            connection_method: "serial_port".into(),
        };

        deliver_result(&test_db.db, dir.path(), &NullSink, &source, "x.hl7", b"not a message").await;
        let d = device_details(id, Utc::now().fixed_offset());
        assert_eq!(d.last_raw.map(|m| m.text), Some("not a message".to_string()));
        assert_eq!(d.errors_today, 1);
        assert_eq!(d.log.last().map(|e| e.label.as_str()), Some("parse_failed"));

        report_cut_off(&test_db.db, dir.path(), &NullSink, &source, b"MSH|partial").await;
        let d = device_details(id, Utc::now().fixed_offset());
        assert_eq!(d.last_raw.map(|m| m.text), Some("MSH|partial".to_string()));
        assert_eq!(d.errors_today, 2);
    }

    fn integration(id: i64, name: &str, connection: crate::models::device_integration::ConnectionType, enabled: bool) -> DeviceIntegration {
        use crate::models::device_integration::DeviceType;
        DeviceIntegration {
            id,
            name: name.into(),
            device_type: DeviceType::ExigoEosVet,
            connection_type: connection,
            watch_directory: None,
            file_pattern: None,
            serial_port_name: Some("COM3".into()),
            serial_baud_rate: None,
            tcp_host: None,
            tcp_port: None,
            enabled,
            last_connected_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    #[test]
    fn snapshots_cover_enabled_machines_with_their_names_and_last_results() {
        use crate::models::device_integration::ConnectionType;
        let integrations = vec![
            integration(1, "PointCare", ConnectionType::SerialPort, true),
            integration(2, "Exigo", ConnectionType::FileWatch, true),
            integration(3, "Spare", ConnectionType::SerialPort, false),
            integration(4, "New analyzer", ConnectionType::SerialPort, true),
        ];
        let mut port = serial(ConnectionState::Error, 2);
        port.last_result_at = Some("2026-10-19T08:55:00+00:00".into());
        let folder = FileWatcherStatus {
            integration_id: 2,
            name: "exigo".into(),
            watch_directory: "/lab".into(),
            status: FileWatcherState::Watching,
            last_error: None,
            error_kind: None,
            files_processed: 0,
            last_result_at: None,
        };
        let stored = HashMap::from([(2, "2026-10-18T17:00:00+00:00".to_string())]);

        let snaps = snapshots(&integrations, &[port], &[folder], &stored);
        let ids: Vec<i64> = snaps.iter().map(|s| s.integration_id).collect();
        assert_eq!(ids, vec![1, 2, 4]);
        assert_eq!(snaps[0].name, "PointCare");
        assert_eq!(snaps[0].health, Health::Down);
        assert_eq!(snaps[0].last_result_at, DateTime::parse_from_rfc3339("2026-10-19T08:55:00+00:00").ok());
        assert_eq!(snaps[1].health, Health::Working);
        assert_eq!(snaps[1].last_result_at, DateTime::parse_from_rfc3339("2026-10-18T17:00:00+00:00").ok());
        assert_eq!(snaps[2].health, Health::Starting, "no status yet");
    }
}
