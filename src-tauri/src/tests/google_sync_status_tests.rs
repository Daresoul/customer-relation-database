//! Google Calendar connection status: an expired or revoked login must read as
//! "reconnect", sync failures must be visible, and events use the local zone.

use crate::services::google_calendar as gc;
use crate::services::oauth::get_valid_access_token;
use crate::test_utils::create_test_db_with_migrations;
use sea_orm::{ConnectionTrait, DbBackend, Statement};

async fn connect(db: &sea_orm::DatabaseConnection, refresh_token: Option<&str>, expires_at: &str) {
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE google_calendar_settings SET access_token = 'tok', refresh_token = ?, \
         calendar_id = 'cal', sync_enabled = 1, token_expires_at = ? WHERE user_id = 'default'",
        [refresh_token.map(|s| s.to_string()).into(), expires_at.to_string().into()],
    ))
    .await
    .unwrap();
}

#[tokio::test]
async fn a_connected_account_reads_as_connected() {
    let db = create_test_db_with_migrations().await;
    connect(&db, Some("refresh"), "2999-01-01T00:00:00Z").await;

    let status = gc::load_sync_status(&db).await.unwrap();

    assert!(status.connected);
    assert!(!status.needs_reauth);
    assert_eq!(status.last_sync_error, None);
}

#[tokio::test]
async fn a_rejected_login_reads_as_needs_reconnect_not_connected() {
    let db = create_test_db_with_migrations().await;
    connect(&db, Some("refresh"), "2999-01-01T00:00:00Z").await;

    gc::mark_needs_reauth(&db, "invalid_grant").await.unwrap();
    let status = gc::load_sync_status(&db).await.unwrap();

    assert!(!status.connected);
    assert!(status.needs_reauth);
    assert_eq!(status.last_sync_error.as_deref(), Some("invalid_grant"));
}

#[tokio::test]
async fn reconnecting_clears_the_flag() {
    let db = create_test_db_with_migrations().await;
    connect(&db, Some("refresh"), "2999-01-01T00:00:00Z").await;
    gc::mark_needs_reauth(&db, "invalid_grant").await.unwrap();

    gc::clear_needs_reauth(&db).await.unwrap();
    let status = gc::load_sync_status(&db).await.unwrap();

    assert!(status.connected);
    assert!(!status.needs_reauth);
    assert_eq!(status.last_sync_error, None);
}

#[tokio::test]
async fn an_expired_token_that_cannot_be_refreshed_flags_reconnect() {
    let db = create_test_db_with_migrations().await;
    connect(&db, None, "2000-01-01T00:00:00Z").await;

    assert!(get_valid_access_token(&db).await.is_err());
    let status = gc::load_sync_status(&db).await.unwrap();

    assert!(status.needs_reauth);
    assert!(!status.connected);
}

#[tokio::test]
async fn sync_errors_are_kept_until_a_sync_succeeds() {
    let db = create_test_db_with_migrations().await;
    connect(&db, Some("refresh"), "2999-01-01T00:00:00Z").await;

    gc::record_sync_outcome(&db, Some("Google Calendar API error 500")).await.unwrap();
    assert_eq!(
        gc::load_sync_status(&db).await.unwrap().last_sync_error.as_deref(),
        Some("Google Calendar API error 500")
    );

    gc::record_sync_outcome(&db, None).await.unwrap();
    let status = gc::load_sync_status(&db).await.unwrap();
    assert_eq!(status.last_sync_error, None);
    assert!(status.last_sync.is_some());
}

#[tokio::test]
async fn the_scheduler_leaves_an_account_alone_until_it_is_reconnected() {
    let db = create_test_db_with_migrations().await;
    connect(&db, Some("refresh"), "2999-01-01T00:00:00Z").await;
    assert_eq!(gc::calendar_ready_for_sync(&db).await.unwrap().as_deref(), Some("cal"));

    gc::mark_needs_reauth(&db, "invalid_grant").await.unwrap();

    assert_eq!(gc::calendar_ready_for_sync(&db).await.unwrap(), None);
}

#[test]
fn events_use_the_local_time_zone() {
    let zone = gc::local_time_zone();
    assert!(!zone.is_empty());
    for source in [
        include_str!("../commands/google_calendar.rs"),
        include_str!("../commands/appointments.rs"),
    ] {
        assert!(!source.contains("America/New_York"));
    }
}

// A client who cancels next week's visit in Google must be seen: the pull asks
// for events changed lately, not for events that took place in the last week.
#[test]
fn the_cancellation_pull_asks_for_recent_changes_including_future_events() {
    use crate::services::sync_scheduler::cancellation_query;
    use chrono::{TimeZone, Utc};

    let now = Utc.with_ymd_and_hms(2026, 10, 23, 9, 0, 0).unwrap();
    let query = cancellation_query(now);
    let get = |k: &str| query.iter().find(|(key, _)| *key == k).map(|(_, v)| v.clone());

    assert_eq!(get("updatedMin").as_deref(), Some("2026-10-16T09:00:00+00:00"));
    assert_eq!(get("timeMax"), None, "a time window would hide future appointments");
    assert_eq!(get("timeMin"), None);
    assert_eq!(get("showDeleted").as_deref(), Some("true"));
}

// lifecycle.md #13: one sync_logs row a minute, never cleaned up.
#[tokio::test]
async fn sync_log_rows_older_than_30_days_are_pruned() {
    use crate::services::sync_scheduler::prune_sync_logs;
    let db = create_test_db_with_migrations().await;
    for started in ["2026-08-01 10:00:00", "2026-09-30 10:00:00", "2026-10-22 10:00:00"] {
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            format!("INSERT INTO sync_logs (direction, sync_type, status, started_at) VALUES ('from_google', 'incremental', 'success', '{started}')"),
        ))
        .await
        .unwrap();
    }
    let now = chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, 2026, 10, 23, 9, 0, 0).unwrap();

    let removed = prune_sync_logs(&db, now).await.unwrap();

    let left: Vec<String> = db
        .query_all(Statement::from_string(DbBackend::Sqlite, "SELECT started_at FROM sync_logs ORDER BY started_at".to_string()))
        .await
        .unwrap()
        .iter()
        .map(|r| r.try_get::<String>("", "started_at").unwrap())
        .collect();
    assert_eq!(removed, 1);
    assert_eq!(left, vec!["2026-09-30 10:00:00", "2026-10-22 10:00:00"]);
}
