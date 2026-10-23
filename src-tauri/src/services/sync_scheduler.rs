// T038: Periodic sync scheduler - checks Google Calendar for cancellations every 1 minute (with immediate check on startup)
use crate::services::google_calendar::{calendar_ready_for_sync, mark_needs_reauth, record_sync_outcome};
use crate::services::oauth::{get_valid_access_token, REAUTH_REQUIRED};
use chrono::{DateTime, Duration, Utc};
use std::sync::Arc;
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};

pub struct SyncScheduler;

/// Delete sync log rows older than 30 days; returns how many went.
pub async fn prune_sync_logs(db: &DatabaseConnection, now: DateTime<Utc>) -> Result<u64, String> {
    let cutoff = (now - Duration::days(30)).format("%Y-%m-%d %H:%M:%S").to_string();
    db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM sync_logs WHERE started_at < ?",
        [cutoff.into()],
    ))
    .await
    .map(|r| r.rows_affected())
    .map_err(|e| format!("Failed to prune sync logs: {}", e))
}

/// Query for the Google events the cancellation pull reads: every event
/// changed in the last week, whenever it takes place. A time window
/// (timeMin/timeMax) would miss a cancelled appointment in the future.
pub fn cancellation_query(now: DateTime<Utc>) -> Vec<(&'static str, String)> {
    vec![
        ("updatedMin", (now - Duration::days(7)).to_rfc3339()),
        ("showDeleted", "true".to_string()),
        ("singleEvents", "true".to_string()),
        ("maxResults", "2500".to_string()),
    ]
}

impl SyncScheduler {
    /// Start the periodic sync scheduler
    pub fn start(db: Arc<DatabaseConnection>) {
        tokio::spawn(async move {
            log::info!("Running initial sync on startup...");
            match prune_sync_logs(&db, Utc::now()).await {
                Ok(n) if n > 0 => log::info!("Pruned {} sync log rows older than 30 days", n),
                Ok(_) => {}
                Err(e) => log::warn!("{}", e),
            }
            Self::run_once(&db).await;

            // After sleep, run once instead of firing every missed minute.
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                interval.tick().await;
                Self::run_once(&db).await;
            }
        });
    }

    /// One pass; a failure is kept for Settings to show, not only logged.
    async fn run_once(db: &DatabaseConnection) {
        if let Err(e) = Self::sync_from_google(db).await {
            log::error!("Google Calendar sync error: {}", e);
            if let Err(record_err) = record_sync_outcome(db, Some(&e)).await {
                log::error!("Failed to record sync error: {}", record_err);
            }
        }
    }

    /// Sync from Google Calendar - check for cancelled events
    async fn sync_from_google(db: &DatabaseConnection) -> Result<(), String> {
        let Some(calendar_id) = calendar_ready_for_sync(db).await? else {
            return Ok(()); // sync off, or waiting for the user to reconnect
        };

        // Get valid access token (will refresh if needed; flags a refused login)
        let access_token = get_valid_access_token(db).await?;

        // Create sync log
        let sync_log_result = db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "INSERT INTO sync_logs (direction, sync_type, status, started_at) VALUES ('from_google', 'incremental', 'in_progress', CURRENT_TIMESTAMP)".to_string()
        ))
        .await
        .map_err(|e| format!("Failed to create sync log: {}", e))?;

        let sync_log_id = sync_log_result.last_insert_id() as i64;

        match Self::pull_cancellations(db, &calendar_id, &access_token).await {
            Ok((items_synced, items_failed)) => {
                let status = if items_failed > 0 { "partial" } else { "success" };
                db.execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE sync_logs SET status = ?, items_synced = ?, items_failed = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [status.into(), items_synced.into(), items_failed.into(), sync_log_id.into()]
                ))
                .await
                .map_err(|e| format!("Failed to update sync log: {}", e))?;

                let failure = (items_failed > 0).then(|| format!("{} appointments failed to update", items_failed));
                record_sync_outcome(db, failure.as_deref()).await?;
                log::debug!("Periodic sync completed: {} synced, {} failed", items_synced, items_failed);
                Ok(())
            }
            Err(e) => {
                // Never leave the log row stuck at in_progress.
                let _ = db.execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE sync_logs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [e.clone().into(), sync_log_id.into()]
                ))
                .await;
                if e.starts_with(REAUTH_REQUIRED) {
                    mark_needs_reauth(db, &e).await?;
                }
                Err(e)
            }
        }
    }

    /// Applies Google-side cancellations to appointments; returns (synced, failed).
    async fn pull_cancellations(
        db: &DatabaseConnection,
        calendar_id: &str,
        access_token: &str,
    ) -> Result<(i32, i32), String> {
        let client = reqwest::Client::new();
        let response = client
            .get(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events", calendar_id))
            .header("Authorization", format!("Bearer {}", access_token))
            .query(&cancellation_query(Utc::now()))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Google Calendar events: {}", e))?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("{}: {}", REAUTH_REQUIRED, error_text));
        }
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Google Calendar API error: {}", error_text));
        }

        let events: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse events: {}", e))?;

        let Some(items) = events["items"].as_array() else {
            return Ok((0, 0));
        };

        let mut items_synced = 0;
        let mut items_failed = 0;

        for event in items {
            let Some(event_id) = event["id"].as_str() else {
                continue;
            };
            if event["status"].as_str().unwrap_or("confirmed") != "cancelled" {
                continue;
            }

            let mapping = db.query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT appointment_id FROM calendar_event_mappings WHERE event_id = ?",
                [event_id.to_string().into()]
            ))
            .await
            .map_err(|e| format!("Failed to check mapping: {}", e))?;

            let Some(row) = mapping else {
                continue;
            };
            let appointment_id: i64 = row.try_get("", "appointment_id")
                .map_err(|e| format!("Failed to get appointment_id: {}", e))?;

            let update_result = db.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'cancelled'",
                [appointment_id.into()]
            ))
            .await;

            match update_result {
                Ok(result) if result.rows_affected() > 0 => {
                    items_synced += 1;
                    log::info!("Synced cancellation for appointment {} from Google Calendar", appointment_id);
                }
                Ok(_) => {}
                Err(e) => {
                    items_failed += 1;
                    log::error!("Failed to update appointment {}: {}", appointment_id, e);
                }
            }
        }

        Ok((items_synced, items_failed))
    }
}
