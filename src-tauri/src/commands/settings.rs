use crate::models::dto::MaybeNull;
use crate::models::{SettingsResponse, UpdateSettingsRequest};
use crate::services::settings::SettingsService;
use crate::database::SeaOrmPool;
use tauri::State;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsInput {
    // Accept default snake_case keys from frontend ApiService; allow camelCase as alias
    pub language: Option<String>,
    /// Missing: unchanged; null: no currency.
    #[serde(alias = "currencyId", default)]
    pub currency_id: MaybeNull<i64>,
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

use crate::models::settings::{ClinicProfile, CreateTaxRateInput, TaxRate, UpdateClinicProfileInput, UpdateTaxRateInput};
use crate::services::java_pdf_service::JavaPdfService;
use crate::services::money::{InvoiceTotals, MoneyLine};

/// The profile, after making it the letterhead of jobs sent without one.
fn current_letterhead(profile: ClinicProfile) -> ClinicProfile {
    JavaPdfService::set_letterhead(Some(profile.clone()));
    profile
}

fn clinic_logo_dir(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path_resolver()
        .app_data_dir()
        .map(|dir| dir.join("clinic"))
        .ok_or_else(|| "The app data folder could not be found".to_string())
}

#[tauri::command]
pub async fn get_clinic_profile(pool: State<'_, SeaOrmPool>) -> Result<ClinicProfile, String> {
    SettingsService::get_clinic_profile(&pool).await.map(current_letterhead)
}

#[tauri::command]
pub async fn update_clinic_profile(
    pool: State<'_, SeaOrmPool>,
    input: UpdateClinicProfileInput,
) -> Result<ClinicProfile, String> {
    SettingsService::update_clinic_profile(&pool, input).await.map(current_letterhead)
}

/// `path`: the PNG or JPG the user picked.
#[tauri::command]
pub async fn set_clinic_logo(
    app_handle: tauri::AppHandle,
    pool: State<'_, SeaOrmPool>,
    path: String,
) -> Result<ClinicProfile, String> {
    let dir = clinic_logo_dir(&app_handle)?;
    SettingsService::set_clinic_logo(&pool, &dir, std::path::Path::new(&path))
        .await
        .map(current_letterhead)
}

#[tauri::command]
pub async fn remove_clinic_logo(pool: State<'_, SeaOrmPool>) -> Result<ClinicProfile, String> {
    SettingsService::remove_clinic_logo(&pool).await.map(current_letterhead)
}

/// The logo as a `data:` URL, or null when there is none.
#[tauri::command]
pub async fn get_clinic_logo(pool: State<'_, SeaOrmPool>) -> Result<Option<String>, String> {
    let profile = SettingsService::get_clinic_profile(&pool).await?;
    Ok(SettingsService::clinic_logo_data_url(&profile))
}

#[tauri::command]
pub async fn get_tax_rates(
    pool: State<'_, SeaOrmPool>,
    active_only: Option<bool>,
) -> Result<Vec<TaxRate>, String> {
    SettingsService::list_tax_rates(&pool, active_only.unwrap_or(false)).await
}

#[tauri::command]
pub async fn create_tax_rate(pool: State<'_, SeaOrmPool>, input: CreateTaxRateInput) -> Result<TaxRate, String> {
    SettingsService::create_tax_rate(&pool, input).await
}

#[tauri::command]
pub async fn update_tax_rate(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateTaxRateInput,
) -> Result<TaxRate, String> {
    SettingsService::update_tax_rate(&pool, id, input).await
}

/// A saved record's invoice totals, as on its invoice PDF.
#[tauri::command]
pub async fn get_record_invoice_totals(
    pool: State<'_, SeaOrmPool>,
    record_id: i64,
) -> Result<InvoiceTotals, String> {
    crate::services::medical_record::MedicalRecordService::invoice_totals_for_record(&pool, record_id).await
}

/// Totals for lines on screen, worked out exactly as on the invoice PDF.
#[tauri::command]
pub async fn calculate_invoice_totals(
    pool: State<'_, SeaOrmPool>,
    lines: Vec<MoneyLine>,
    discount_percent: Option<f64>,
) -> Result<InvoiceTotals, String> {
    let profile = SettingsService::get_clinic_profile(&pool).await?;
    Ok(crate::services::money::invoice_totals(&lines, discount_percent, profile.prices_include_vat))
}
