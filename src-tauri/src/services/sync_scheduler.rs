// T038: Periodic sync scheduler - checks Google Calendar for cancellations every 1 minute (with immediate check on startup)
use crate::services::oauth::get_valid_access_token;
use chrono::{Utc, Duration};
use std::sync::Arc;
use sea_orm::{DatabaseConnection, ConnectionTrait, Statement, DbBackend};

pub struct SyncScheduler;

impl SyncScheduler {
    /// Start the periodic sync scheduler
    pub fn start(db: Arc<DatabaseConnection>) {
        tokio::spawn(async move {
            // Run initial sync immediately on startup
            log::info!("Running initial sync on startup...");
            if let Err(e) = Self::sync_from_google(db.clone()).await {
                log::error!("Initial sync error: {}", e);
            } else {
                log::info!("Initial sync completed successfully");
            }

            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60)); // 1 minute

            loop {
                interval.tick().await;

                if let Err(e) = Self::sync_from_google(db.clone()).await {
                    log::error!("Periodic sync error: {}", e);
                }
            }
        });
    }

    /// Sync from Google Calendar - check for cancelled events
    async fn sync_from_google(db: Arc<DatabaseConnection>) -> Result<(), String> {
        log::debug!("sync_from_google: Starting sync...");

        // Check if sync is enabled
        log::debug!("sync_from_google: Checking if sync is enabled...");
        let settings_row = db.query_one(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT calendar_id, sync_enabled, access_token, refresh_token FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1".to_string()
        ))
        .await
        .map_err(|e| format!("Failed to check sync settings: {}", e))?;
        log::debug!("sync_from_google: Query completed");

        let settings_row = match settings_row {
            Some(r) => {
                log::debug!("sync_from_google: Sync is enabled");
                r
            },
            None => {
                log::debug!("sync_from_google: Sync not enabled, returning early");
                return Ok(())
            }, // Sync not enabled
        };

        let calendar_id: String = settings_row.try_get("", "calendar_id")
            .map_err(|_| "No calendar ID configured".to_string())?;

        // Get valid access token (will refresh if needed)
        let access_token = get_valid_access_token(&db).await?;

        // Create sync log
        let sync_log_result = db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "INSERT INTO sync_logs (direction, sync_type, status, started_at) VALUES ('from_google', 'incremental', 'in_progress', CURRENT_TIMESTAMP)".to_string()
        ))
        .await
        .map_err(|e| format!("Failed to create sync log: {}", e))?;

        let sync_log_id = sync_log_result.last_insert_id() as i64;

        // Get events from last 7 days to now
        let time_min = (Utc::now() - Duration::days(7)).to_rfc3339();
        let time_max = Utc::now().to_rfc3339();

        // Fetch events from Google Calendar
        let client = reqwest::Client::new();
        let response = client
            .get(format!("https://www.googleapis.com/calendar/v3/calendars/{}/events", calendar_id))
            .header("Authorization", format!("Bearer {}", access_token))
            .query(&[
                ("timeMin", time_min.as_str()),
                ("timeMax", time_max.as_str()),
                ("showDeleted", "true"),
                ("singleEvents", "true"),
            ])
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Google Calendar events: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());

            // Mark sync as failed
            let _ = db.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE sync_logs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                [error_text.clone().into(), sync_log_id.into()]
            ))
            .await;

            return Err(format!("Google Calendar API error: {}", error_text));
        }

        let events: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse events: {}", e))?;

        let items = match events["items"].as_array() {
            Some(items) => items,
            None => {
                // No events, mark sync as success
                let _ = db.execute(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "UPDATE sync_logs SET status = 'success', items_synced = 0, items_failed = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [sync_log_id.into()]
                ))
                .await;
                return Ok(());
            }
        };

        let mut items_synced = 0;
        let mut items_failed = 0;

        // Process each event
        for event in items {
            let event_id = match event["id"].as_str() {
                Some(id) => id,
                None => continue,
            };

            let status = event["status"].as_str().unwrap_or("confirmed");

            // Check if we have a mapping for this event
            let mapping = db.query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT appointment_id FROM calendar_event_mappings WHERE event_id = ?",
                [event_id.to_string().into()]
            ))
            .await
            .map_err(|e| format!("Failed to check mapping: {}", e))?;

            if let Some(row) = mapping {
                let appointment_id: i64 = row.try_get("", "appointment_id")
                    .map_err(|e| format!("Failed to get appointment_id: {}", e))?;

                // Check if event is cancelled in Google Calendar
                if status == "cancelled" {
                    // Update appointment status to cancelled
                    let update_result = db.execute(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'cancelled'",
                        [appointment_id.into()]
                    ))
                    .await;

                    match update_result {
                        Ok(result) => {
                            if result.rows_affected() > 0 {
                                items_synced += 1;
                                log::info!("Synced cancellation for appointment {} from Google Calendar", appointment_id);
                            }
                        }
                        Err(e) => {
                            items_failed += 1;
                            log::error!("Failed to update appointment {}: {}", appointment_id, e);
                        }
                    }
                }
            }
        }

        // Mark sync as complete
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE sync_logs SET status = 'success', items_synced = ?, items_failed = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            [items_synced.into(), items_failed.into(), sync_log_id.into()]
        ))
        .await
        .map_err(|e| format!("Failed to update sync log: {}", e))?;

        // Update last_sync timestamp
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            "UPDATE google_calendar_settings SET last_sync = CURRENT_TIMESTAMP WHERE user_id = 'default'".to_string()
        ))
        .await
        .map_err(|e| format!("Failed to update last sync: {}", e))?;

        log::info!("Periodic sync completed: {} synced, {} failed", items_synced, items_failed);

        Ok(())
    }
}
