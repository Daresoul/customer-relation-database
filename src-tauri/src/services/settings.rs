use crate::entities::app_settings::{self, Entity as AppSettingsEntity};
use crate::entities::currency::{self, Entity as CurrencyEntity};
use crate::models::{Currency, SettingsResponse, UpdateSettingsRequest};
use chrono::Utc;
use sea_orm::*;

pub struct SettingsService;

impl SettingsService {
    /// Convert a SeaORM currency model to the API Currency model
    fn currency_to_api_model(model: currency::Model) -> Currency {
        Currency {
            id: model.id,
            code: model.code,
            name: model.name,
            symbol: model.symbol,
        }
    }

    /// Convert a SeaORM app_settings model to the API AppSettings model
    fn settings_to_api_model(model: app_settings::Model) -> crate::models::AppSettings {
        crate::models::AppSettings {
            id: model.id,
            user_id: model.user_id,
            language: model.language,
            currency_id: model.currency_id,
            theme: model.theme,
            date_format: model.date_format,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }

    pub async fn get_settings(db: &DatabaseConnection, user_id: &str) -> Result<SettingsResponse, String> {
        // Get settings for user
        let settings_model = AppSettingsEntity::find()
            .filter(app_settings::Column::UserId.eq(user_id))
            .one(db)
            .await
            .map_err(|e| format!("Failed to get settings: {}", e))?;

        // If no settings exist, create default ones
        let settings_model = match settings_model {
            Some(model) => model,
            None => {
                // Create default settings
                let now = Utc::now();
                let new_settings = app_settings::ActiveModel {
                    user_id: Set(user_id.to_string()),
                    language: Set("en".to_string()),
                    currency_id: Set(None),
                    theme: Set("light".to_string()),
                    date_format: Set("MM/DD/YYYY".to_string()),
                    created_at: Set(now),
                    updated_at: Set(now),
                    ..Default::default()
                };

                let result = AppSettingsEntity::insert(new_settings)
                    .exec(db)
                    .await
                    .map_err(|e| format!("Failed to create default settings: {}", e))?;

                // Fetch the newly created settings
                AppSettingsEntity::find_by_id(result.last_insert_id)
                    .one(db)
                    .await
                    .map_err(|e| format!("Failed to fetch created settings: {}", e))?
                    .ok_or_else(|| "Failed to find created settings".to_string())?
            }
        };

        let settings = Self::settings_to_api_model(settings_model.clone());

        // Get currency if set
        let currency = if let Some(currency_id) = settings_model.currency_id {
            CurrencyEntity::find_by_id(currency_id)
                .one(db)
                .await
                .map_err(|e| format!("Failed to get currency: {}", e))?
                .map(Self::currency_to_api_model)
        } else {
            None
        };

        Ok(SettingsResponse { settings, currency })
    }

    pub async fn update_settings(
        db: &DatabaseConnection,
        user_id: &str,
        request: UpdateSettingsRequest,
    ) -> Result<SettingsResponse, String> {
        // Validate inputs
        if let Some(ref language) = request.language {
            if language != "en" && language != "mk" {
                return Err(format!("Invalid language: {}. Must be 'en' or 'mk'", language));
            }
        }

        if let Some(currency_id) = request.currency_id {
            // Validate currency exists
            let currency_exists = CurrencyEntity::find_by_id(currency_id)
                .one(db)
                .await
                .map_err(|e| format!("Failed to validate currency: {}", e))?;

            if currency_exists.is_none() {
                return Err(format!("Invalid currency_id: {}", currency_id));
            }
        }

        if let Some(ref theme) = request.theme {
            if theme != "light" && theme != "dark" {
                return Err(format!("Invalid theme: {}. Must be 'light' or 'dark'", theme));
            }
        }

        // Get current settings first
        let current = AppSettingsEntity::find()
            .filter(app_settings::Column::UserId.eq(user_id))
            .one(db)
            .await
            .map_err(|e| format!("Failed to get current settings: {}", e))?;

        let current = match current {
            Some(model) => model,
            None => {
                // Create default settings first
                let now = Utc::now();
                let new_settings = app_settings::ActiveModel {
                    user_id: Set(user_id.to_string()),
                    language: Set("en".to_string()),
                    currency_id: Set(None),
                    theme: Set("light".to_string()),
                    date_format: Set("MM/DD/YYYY".to_string()),
                    created_at: Set(now),
                    updated_at: Set(now),
                    ..Default::default()
                };

                let result = AppSettingsEntity::insert(new_settings)
                    .exec(db)
                    .await
                    .map_err(|e| format!("Failed to create settings: {}", e))?;

                AppSettingsEntity::find_by_id(result.last_insert_id)
                    .one(db)
                    .await
                    .map_err(|e| format!("Failed to fetch created settings: {}", e))?
                    .ok_or_else(|| "Failed to find created settings".to_string())?
            }
        };

        // Update the settings model
        let now = Utc::now();
        let mut settings_model: app_settings::ActiveModel = current.into();

        if let Some(language) = request.language {
            settings_model.language = Set(language);
        }

        if let Some(currency_id) = request.currency_id {
            log::debug!("Updating currency_id to: {}", currency_id);
            settings_model.currency_id = Set(Some(currency_id));
        }

        if let Some(theme) = request.theme {
            settings_model.theme = Set(theme);
        }

        if let Some(date_format) = request.date_format {
            settings_model.date_format = Set(date_format);
        }

        settings_model.updated_at = Set(now);

        settings_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update settings: {}", e))?;

        // Return updated settings
        Self::get_settings(db, user_id).await
    }

    #[allow(dead_code)]
    pub async fn get_currencies(db: &DatabaseConnection) -> Result<Vec<Currency>, String> {
        let currencies = CurrencyEntity::find()
            .order_by_asc(currency::Column::Code)
            .all(db)
            .await
            .map_err(|e| format!("Failed to get currencies: {}", e))?;

        Ok(currencies.into_iter().map(Self::currency_to_api_model).collect())
    }
}
