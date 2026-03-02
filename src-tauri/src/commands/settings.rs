use crate::models::{SettingsResponse, UpdateSettingsRequest};
use crate::services::settings::SettingsService;
use crate::database::SeaOrmPool;
use tauri::State;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsInput {
    // Accept default snake_case keys from frontend ApiService; allow camelCase as alias
    pub language: Option<String>,
    #[serde(alias = "currencyId")]
    pub currency_id: Option<i64>,
    pub theme: Option<String>,
    #[serde(alias = "dateFormat")]
    pub date_format: Option<String>,
}

#[tauri::command]
pub async fn get_app_settings(
    pool: State<'_, SeaOrmPool>,
) -> Result<SettingsResponse, String> {
    SettingsService::get_settings(&pool, "default").await
}

#[tauri::command]
pub async fn update_app_settings(
    pool: State<'_, SeaOrmPool>,
    updates: UpdateSettingsInput,
) -> Result<SettingsResponse, String> {
    log::debug!("update_app_settings called with: {:?}", updates);

    let request = UpdateSettingsRequest {
        language: updates.language,
        currency_id: updates.currency_id,
        theme: updates.theme,
        date_format: updates.date_format,
    };

    let result = SettingsService::update_settings(&pool, "default", request).await;

    match &result {
        Ok(response) => {
            log::debug!("Settings updated successfully. Currency ID: {:?}", response.settings.currency_id);
        },
        Err(e) => {
            log::error!("Settings update failed: {}", e);
        }
    }

    result
}

// Note: get_currencies is already defined in medical.rs and used throughout the app
