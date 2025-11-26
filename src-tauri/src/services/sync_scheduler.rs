// T038: Periodic sync scheduler - checks Google Calendar for cancellations every 1 minute (with immediate check on startup)
#[allow(unused_imports)]
use crate::database::connection::DatabasePool;
use crate::models::google_calendar::GoogleCalendarSettings;
#[allow(unused_imports)]
use crate::models::appointments::AppointmentStatus;
use crate::services::oauth::get_valid_access_token;
use chrono::{Utc, Duration};
use std::sync::Arc;
use tokio::sync::Mutex;
use sqlx::SqlitePool;

pub struct SyncScheduler;

impl SyncScheduler {
    /// Start the periodic sync scheduler
    pub fn start(pool: Arc<Mutex<SqlitePool>>) {
        tokio::spawn(async move {
            // Run initial sync immediately on startup
            println!("Running initial sync on startup...");
            if let Err(e) = Self::sync_from_google(pool.clone()).await {
                eprintln!("Initial sync error: {}", e);
            } else {
                println!("Initial sync completed successfully");
            }

            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60)); // 1 minute

            loop {
                interval.tick().await;

                if let Err(e) = Self::sync_from_google(pool.clone()).await {
                    eprintln!("Periodic sync error: {}", e);
                }
            }
        });
    }

    /// Sync from Google Calendar - check for cancelled events
    async fn sync_from_google(pool: Arc<Mutex<SqlitePool>>) -> Result<(), String> {
        println!("[DEBUG] sync_from_google: Acquiring pool lock...");
        let pool_guard = pool.lock().await;
        println!("[DEBUG] sync_from_google: Pool lock acquired");

        // Check if sync is enabled
        println!("[DEBUG] sync_from_google: Checking if sync is enabled...");
        let settings: Option<GoogleCalendarSettings> = sqlx::query_as(
            "SELECT * FROM google_calendar_settings WHERE user_id = 'default' AND sync_enabled = 1"
        )
        .fetch_optional(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to check sync settings: {}", e))?;
        println!("[DEBUG] sync_from_google: Query completed");

        let settings = match settings {
            Some(s) => {
                println!("[DEBUG] sync_from_google: Sync is enabled");
                s
            },
            None => {
                println!("[DEBUG] sync_from_google: Sync not enabled, returning early");
                return Ok(())
            }, // Sync not enabled
        };

        let calendar_id = match settings.calendar_id {
            Some(id) => id,
            None => return Err("No calendar ID configured".to_string()),
        };

        // Get valid access token (will refresh if needed)
        let access_token = get_valid_access_token(&*pool_guard).await?;

        // Create sync log
        let sync_log_result = sqlx::query(
            "INSERT INTO sync_logs (direction, sync_type, status, started_at)
             VALUES ('from_google', 'incremental', 'in_progress', CURRENT_TIMESTAMP)"
        )
        .execute(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to create sync log: {}", e))?;

        let sync_log_id = sync_log_result.last_insert_rowid();

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
            let _ = sqlx::query(
                "UPDATE sync_logs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
            )
            .bind(&error_text)
            .bind(sync_log_id)
            .execute(&*pool_guard)
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
                let _ = sqlx::query(
                    "UPDATE sync_logs SET status = 'success', items_synced = 0, items_failed = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
                )
                .bind(sync_log_id)
                .execute(&*pool_guard)
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
            let mapping: Option<(i64,)> = sqlx::query_as(
                "SELECT appointment_id FROM calendar_event_mappings WHERE event_id = ?"
            )
            .bind(event_id)
            .fetch_optional(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to check mapping: {}", e))?;

            if let Some((appointment_id,)) = mapping {
                // Check if event is cancelled in Google Calendar
                if status == "cancelled" {
                    // Update appointment status to cancelled
                    let update_result = sqlx::query(
                        "UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                         WHERE id = ? AND status != 'cancelled'"
                    )
                    .bind(appointment_id)
                    .execute(&*pool_guard)
                    .await;

                    match update_result {
                        Ok(result) => {
                            if result.rows_affected() > 0 {
                                items_synced += 1;
                                println!("Synced cancellation for appointment {} from Google Calendar", appointment_id);
                            }
                        }
                        Err(e) => {
                            items_failed += 1;
                            eprintln!("Failed to update appointment {}: {}", appointment_id, e);
                        }
                    }
                }
            }
        }

        // Mark sync as complete
        sqlx::query(
            "UPDATE sync_logs SET status = 'success', items_synced = ?, items_failed = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(items_synced)
        .bind(items_failed)
        .bind(sync_log_id)
        .execute(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to update sync log: {}", e))?;

        // Update last_sync timestamp
        sqlx::query(
            "UPDATE google_calendar_settings SET last_sync = CURRENT_TIMESTAMP WHERE user_id = 'default'"
        )
        .execute(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to update last sync: {}", e))?;

        println!("Periodic sync completed: {} synced, {} failed", items_synced, items_failed);

        Ok(())
    }
}
