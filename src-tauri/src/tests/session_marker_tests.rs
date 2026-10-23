//! A crash, a power cut and a Quit looked the same in Grafana
//! (lifecycle.md #12). A marker file is written at start and removed on a
//! clean exit; still there at the next start means the last session ended
//! unexpectedly.

use crate::services::session_marker::{begin_session, end_session, PreviousSession};
use chrono::{TimeZone, Utc};

fn at(hour: u32) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 23, hour, 0, 0).unwrap()
}

#[test]
fn first_start_finds_nothing_and_leaves_a_marker() {
    let dir = tempfile::tempdir().unwrap();

    assert_eq!(begin_session(dir.path(), "0.8.0", at(8)), PreviousSession::EndedCleanly);

    assert!(std::fs::read_dir(dir.path()).unwrap().count() == 1, "marker written");
}

#[test]
fn a_start_after_a_clean_exit_finds_nothing() {
    let dir = tempfile::tempdir().unwrap();
    begin_session(dir.path(), "0.8.0", at(8));
    end_session(dir.path());

    assert_eq!(begin_session(dir.path(), "0.8.0", at(9)), PreviousSession::EndedCleanly);
}

#[test]
fn a_start_after_a_crash_reports_the_session_that_did_not_end() {
    let dir = tempfile::tempdir().unwrap();
    begin_session(dir.path(), "0.8.0", at(8));

    assert_eq!(
        begin_session(dir.path(), "0.8.0", at(9)),
        PreviousSession::EndedUnexpectedly {
            version: "0.8.0".into(),
            started_at: at(8).to_rfc3339(),
        }
    );
    end_session(dir.path());
    assert_eq!(begin_session(dir.path(), "0.8.0", at(10)), PreviousSession::EndedCleanly);
}

#[test]
fn a_start_on_a_new_version_reads_as_an_update_not_a_crash() {
    let dir = tempfile::tempdir().unwrap();
    begin_session(dir.path(), "0.8.0", at(8));

    assert_eq!(
        begin_session(dir.path(), "0.8.1", at(9)),
        PreviousSession::EndedForUpdate { from_version: "0.8.0".into() }
    );
}

#[test]
fn an_unreadable_marker_still_counts_as_an_unexpected_end() {
    let dir = tempfile::tempdir().unwrap();
    begin_session(dir.path(), "0.8.0", at(8));
    for entry in std::fs::read_dir(dir.path()).unwrap() {
        std::fs::write(entry.unwrap().path(), "garbage").unwrap();
    }

    assert!(matches!(
        begin_session(dir.path(), "0.8.0", at(9)),
        PreviousSession::EndedUnexpectedly { .. }
    ));
}

#[test]
fn ending_without_a_marker_is_harmless() {
    let dir = tempfile::tempdir().unwrap();
    end_session(dir.path());
    end_session(&dir.path().join("missing"));
}
