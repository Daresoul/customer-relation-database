use crate::models::{Currency, SettingsResponse, UpdateSettingsRequest};
use crate::database::DatabasePool;
use sqlx::Row;

pub struct SettingsService;

impl SettingsService {
    pub async fn get_settings(pool: &DatabasePool, user_id: &str) -> Result<SettingsResponse, String> {
        let pool = pool.lock().await;

        // Get settings for user
        let settings_row = sqlx::query(
            r#"
            SELECT id, user_id, language, currency_id, theme, date_format, created_at, updated_at
            FROM app_settings
            WHERE user_id = ?1
            "#
        )
        .bind(user_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| format!("Failed to get settings: {}", e))?;

        // If no settings exist, create default ones
        let settings_row = match settings_row {
            Some(row) => row,
            None => {
                // Create default settings
                sqlx::query(
                    r#"
                    INSERT INTO app_settings (user_id, language, theme, date_format)
                    VALUES (?1, 'en', 'light', 'MM/DD/YYYY')
                    "#
                )
                .bind(user_id)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to create default settings: {}", e))?;

                // Fetch the newly created settings
                sqlx::query(
                    r#"
                    SELECT id, user_id, language, currency_id, theme, date_format, created_at, updated_at
                    FROM app_settings
                    WHERE user_id = ?1
                    "#
                )
                .bind(user_id)
                .fetch_one(&*pool)
                .await
                .map_err(|e| format!("Failed to fetch created settings: {}", e))?
            }
        };

        // Extract values from row
        let settings = crate::models::AppSettings {
            id: settings_row.try_get("id").map_err(|e| format!("Failed to get id: {}", e))?,
            user_id: settings_row.try_get("user_id").map_err(|e| format!("Failed to get user_id: {}", e))?,
            language: settings_row.try_get("language").map_err(|e| format!("Failed to get language: {}", e))?,
            currency_id: settings_row.try_get("currency_id").map_err(|e| format!("Failed to get currency_id: {}", e))?,
            theme: settings_row.try_get("theme").map_err(|e| format!("Failed to get theme: {}", e))?,
            date_format: settings_row.try_get("date_format").map_err(|e| format!("Failed to get date_format: {}", e))?,
            created_at: settings_row.try_get("created_at").map_err(|e| format!("Failed to get created_at: {}", e))?,
            updated_at: settings_row.try_get("updated_at").map_err(|e| format!("Failed to get updated_at: {}", e))?,
        };

        // Get currency if set
        let currency = if let Some(currency_id) = settings.currency_id {
            let currency_row = sqlx::query(
                r#"
                SELECT id, code, name, symbol
                FROM currencies
                WHERE id = ?1
                "#
            )
            .bind(currency_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| format!("Failed to get currency: {}", e))?;

            currency_row.map(|row| Currency {
                id: row.try_get("id").unwrap_or_default(),
                code: row.try_get("code").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                symbol: row.try_get("symbol").ok(),
            })
        } else {
            None
        };

        Ok(SettingsResponse { settings, currency })
    }

    pub async fn update_settings(
        pool: &DatabasePool,
        user_id: &str,
        request: UpdateSettingsRequest,
    ) -> Result<SettingsResponse, String> {
        let pool_guard = pool.lock().await;

        // Validate inputs
        if let Some(ref language) = request.language {
            if language != "en" && language != "mk" {
                return Err(format!("Invalid language: {}. Must be 'en' or 'mk'", language));
            }
        }

        if let Some(currency_id) = request.currency_id {
            // Validate currency exists
            let count: (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM currencies WHERE id = ?1"
            )
            .bind(currency_id)
            .fetch_one(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to validate currency: {}", e))?;

            if count.0 == 0 {
                return Err(format!("Invalid currency_id: {}", currency_id));
            }
        }

        if let Some(ref theme) = request.theme {
            if theme != "light" && theme != "dark" {
                return Err(format!("Invalid theme: {}. Must be 'light' or 'dark'", theme));
            }
        }

        // Get current settings first
        let current = sqlx::query(
            "SELECT * FROM app_settings WHERE user_id = ?1"
        )
        .bind(user_id)
        .fetch_optional(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to get current settings: {}", e))?;

        if current.is_none() {
            // Create default settings first
            sqlx::query(
                r#"
                INSERT INTO app_settings (user_id, language, theme, date_format)
                VALUES (?1, 'en', 'light', 'MM/DD/YYYY')
                "#
            )
            .bind(user_id)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to create settings: {}", e))?;
        }

        // Update each field if provided
        if let Some(ref language) = request.language {
            sqlx::query("UPDATE app_settings SET language = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2")
                .bind(language)
                .bind(user_id)
                .execute(&*pool_guard)
                .await
                .map_err(|e| format!("Failed to update language: {}", e))?;
        }

        if let Some(currency_id) = request.currency_id {
            println!("DEBUG: Updating currency_id to: {}", currency_id);
            let result = sqlx::query("UPDATE app_settings SET currency_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2")
                .bind(currency_id)
                .bind(user_id)
                .execute(&*pool_guard)
                .await
                .map_err(|e| format!("Failed to update currency: {}", e))?;
            println!("DEBUG: Currency update affected {} rows", result.rows_affected());
        }

        if let Some(ref theme) = request.theme {
            sqlx::query("UPDATE app_settings SET theme = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2")
                .bind(theme)
                .bind(user_id)
                .execute(&*pool_guard)
                .await
                .map_err(|e| format!("Failed to update theme: {}", e))?;
        }

        if let Some(ref date_format) = request.date_format {
            sqlx::query("UPDATE app_settings SET date_format = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2")
                .bind(date_format)
                .bind(user_id)
                .execute(&*pool_guard)
                .await
                .map_err(|e| format!("Failed to update date format: {}", e))?;
        }

        // Drop the pool guard before calling get_settings
        drop(pool_guard);

        // Return updated settings
        Self::get_settings(pool, user_id).await
    }

    pub async fn get_currencies(pool: &DatabasePool) -> Result<Vec<Currency>, String> {
        let pool = pool.lock().await;

        let rows = sqlx::query(
            r#"
            SELECT id, code, name, symbol
            FROM currencies
            ORDER BY code
            "#
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to get currencies: {}", e))?;

        let currencies = rows
            .iter()
            .map(|row| Currency {
                id: row.try_get("id").unwrap_or_default(),
                code: row.try_get("code").unwrap_or_default(),
                name: row.try_get("name").unwrap_or_default(),
                symbol: row.try_get("symbol").ok(),
            })
            .collect();

        Ok(currencies)
    }
}