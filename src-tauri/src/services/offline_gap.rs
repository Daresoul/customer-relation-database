//! Serial machines don't wait: a result sent while Arkivet is closed is lost.
//! The app notes every minute that it is alive; at the next start a gap that
//! touches clinic hours is reported, so staff resend tests from that time.

use chrono::{DateTime, FixedOffset, Utc};
use serde::Serialize;
use std::path::Path;

use crate::services::device_health::{is_clinic_hours, DeviceAlertSettings};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineGap {
    pub from: String,
    pub to: String,
}

/// The time Arkivet was away, if it lasted 5 minutes and touched clinic hours.
pub fn offline_gap(
    settings: &DeviceAlertSettings,
    last_alive: DateTime<FixedOffset>,
    now: DateTime<FixedOffset>,
) -> Option<OfflineGap> {
    if now - last_alive < chrono::Duration::minutes(5) {
        return None;
    }
    // Look at the gap in 5-minute steps; a week is the most worth telling about.
    let end = now.min(last_alive + chrono::Duration::days(7));
    let mut t = last_alive;
    while t <= end {
        if is_clinic_hours(settings, t) {
            return Some(OfflineGap { from: last_alive.to_rfc3339(), to: now.to_rfc3339() });
        }
        t += chrono::Duration::minutes(5);
    }
    None
}

/// The gap found at start, handed to the window once.
pub struct OfflineGapState(pub std::sync::Mutex<Option<OfflineGap>>);

/// Only serial machines lose results while the app is closed (folder results wait).
pub async fn startup_gap(db: &sea_orm::DatabaseConnection, last_alive: Option<DateTime<Utc>>) -> Option<OfflineGap> {
    use crate::models::device_integration::ConnectionType;
    let last_alive = last_alive?;
    let integrations = crate::services::device_integration::DeviceIntegrationService::get_all(db).await.ok()?;
    if !integrations.iter().any(|i| i.enabled && i.connection_type == ConnectionType::SerialPort) {
        return None;
    }
    let settings = crate::services::device_health::load_alert_settings(db).await.unwrap_or_default();
    let now = chrono::Local::now().fixed_offset();
    offline_gap(&settings, last_alive.with_timezone(now.offset()), now)
}

const ALIVE_FILE: &str = "last_alive";

/// Called every minute and at a clean exit.
pub fn note_alive(dir: &Path, now: DateTime<Utc>) {
    if let Err(e) = std::fs::write(dir.join(ALIVE_FILE), now.to_rfc3339()) {
        log::debug!("Could not note that the app is alive: {e}");
    }
}

pub fn last_alive(dir: &Path) -> Option<DateTime<Utc>> {
    let text = std::fs::read_to_string(dir.join(ALIVE_FILE)).ok()?;
    DateTime::parse_from_rfc3339(text.trim()).ok().map(|t| t.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(d: u32, h: u32, m: u32) -> DateTime<FixedOffset> {
        // 2026-10-19 is a Monday.
        FixedOffset::east_opt(2 * 3600).unwrap().with_ymd_and_hms(2026, 10, d, h, m, 0).unwrap()
    }

    #[test]
    fn a_lunchtime_gap_is_reported() {
        let s = DeviceAlertSettings::default();
        let gap = offline_gap(&s, at(19, 12, 10), at(19, 12, 40)).expect("in clinic hours");
        assert_eq!(gap, OfflineGap { from: at(19, 12, 10).to_rfc3339(), to: at(19, 12, 40).to_rfc3339() });
    }

    #[test]
    fn a_night_or_a_short_restart_is_not() {
        let s = DeviceAlertSettings::default();
        assert_eq!(offline_gap(&s, at(19, 20, 30), at(20, 6, 50)), None, "closed overnight");
        assert_eq!(offline_gap(&s, at(19, 12, 10), at(19, 12, 13)), None, "a restart");
    }

    #[test]
    fn the_last_alive_time_is_kept_in_the_app_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(last_alive(dir.path()), None);
        let now = Utc.with_ymd_and_hms(2026, 10, 19, 10, 0, 0).unwrap();
        note_alive(dir.path(), now);
        assert_eq!(last_alive(dir.path()), Some(now));
    }

    #[test]
    fn a_gap_from_saturday_evening_into_monday_morning_is() {
        let s = DeviceAlertSettings::default();
        assert!(offline_gap(&s, at(24, 19, 50), at(26, 7, 20)).is_some());
    }
}
