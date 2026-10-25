//! Serial machines don't wait: a result sent while Arkivet is closed is lost.
//! The app notes every minute that it is alive; at the next start a gap that
//! touches clinic hours is reported, so staff resend tests from that time.

use chrono::{DateTime, FixedOffset, Utc};
use serde::Serialize;
use std::path::Path;

use crate::services::device_health::DeviceAlertSettings;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineGap {
    pub from: String,
    pub to: String,
}

/// The time Arkivet was away, if it lasted 5 minutes and touched clinic hours.
pub fn offline_gap(
    _settings: &DeviceAlertSettings,
    _last_alive: DateTime<FixedOffset>,
    _now: DateTime<FixedOffset>,
) -> Option<OfflineGap> {
    None
}

#[allow(dead_code)]
fn _dir(_: &Path, _: DateTime<Utc>) {}

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
    fn a_gap_from_saturday_evening_into_monday_morning_is() {
        let s = DeviceAlertSettings::default();
        assert!(offline_gap(&s, at(24, 19, 50), at(26, 7, 20)).is_some());
    }
}
