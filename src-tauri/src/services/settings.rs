use crate::entities::app_settings::{self, Entity as AppSettingsEntity};
use crate::entities::currency::{self, Entity as CurrencyEntity};
use crate::models::dto::MaybeNull;
use crate::models::{Currency, SettingsResponse, UpdateSettingsRequest};
use crate::models::settings::{ClinicProfile, CreateTaxRateInput, TaxRate, UpdateClinicProfileInput, UpdateTaxRateInput};
use chrono::Utc;
use sea_orm::*;

pub struct SettingsService;

/// The clinic writes dates day first, with dots (31.01.2024).
pub const DEFAULT_DATE_FORMAT: &str = "DD.MM.YYYY";

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
                    date_format: Set(DEFAULT_DATE_FORMAT.to_string()),
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

        if let MaybeNull::Value(currency_id) = request.currency_id {
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
                    date_format: Set(DEFAULT_DATE_FORMAT.to_string()),
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

        match request.currency_id {
            MaybeNull::Value(currency_id) => settings_model.currency_id = Set(Some(currency_id)),
            MaybeNull::Null => settings_model.currency_id = Set(None),
            MaybeNull::Undefined => {}
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

    // ==================== CLINIC PROFILE ====================

    pub async fn get_clinic_profile(db: &DatabaseConnection) -> Result<ClinicProfile, String> {
        Self::clinic_profile_in(db).await
    }

    pub async fn clinic_profile_in<C: ConnectionTrait>(db: &C) -> Result<ClinicProfile, String> {
        let row = db
            .query_one(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT name, address, city, phone, email, tax_number, registration_number, \
                 bank_account, bank_name, logo_path, prices_include_vat FROM clinic_profile WHERE id = 1",
            ))
            .await
            .map_err(|e| format!("Failed to read the clinic profile: {}", e))?;
        let Some(row) = row else {
            return Ok(ClinicProfile::default());
        };
        let text = |col: &str| row.try_get::<Option<String>>("", col).ok().flatten();
        Ok(ClinicProfile {
            name: text("name"),
            address: text("address"),
            city: text("city"),
            phone: text("phone"),
            email: text("email"),
            tax_number: text("tax_number"),
            registration_number: text("registration_number"),
            bank_account: text("bank_account"),
            bank_name: text("bank_name"),
            logo_path: text("logo_path"),
            prices_include_vat: row.try_get::<i64>("", "prices_include_vat").map(|v| v != 0).unwrap_or(true),
        })
    }

    pub async fn update_clinic_profile(
        db: &DatabaseConnection,
        input: UpdateClinicProfileInput,
    ) -> Result<ClinicProfile, String> {
        fn clean(value: Option<String>) -> sea_orm::Value {
            value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).into()
        }
        db.execute(Statement::from_string(DbBackend::Sqlite, "INSERT OR IGNORE INTO clinic_profile (id) VALUES (1)"))
            .await
            .map_err(|e| format!("Failed to save the clinic profile: {}", e))?;
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE clinic_profile SET name = ?, address = ?, city = ?, phone = ?, email = ?, \
             tax_number = ?, registration_number = ?, bank_account = ?, bank_name = ?, \
             prices_include_vat = COALESCE(?, prices_include_vat), updated_at = CURRENT_TIMESTAMP \
             WHERE id = 1",
            [
                clean(input.name),
                clean(input.address),
                clean(input.city),
                clean(input.phone),
                clean(input.email),
                clean(input.tax_number),
                clean(input.registration_number),
                clean(input.bank_account),
                clean(input.bank_name),
                input.prices_include_vat.into(),
            ],
        ))
        .await
        .map_err(|e| format!("Failed to save the clinic profile: {}", e))?;
        Self::get_clinic_profile(db).await
    }

    /// Copies a PNG or JPG of at most 2 MB into `logo_dir` and makes it the
    /// clinic's logo. The previous logo file is removed.
    pub async fn set_clinic_logo(
        db: &DatabaseConnection,
        logo_dir: &std::path::Path,
        source: &std::path::Path,
    ) -> Result<ClinicProfile, String> {
        const MAX_LOGO_BYTES: u64 = 2 * 1024 * 1024;
        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        let ext = match ext.as_str() {
            "png" => "png",
            "jpg" | "jpeg" => "jpg",
            _ => return Err("The logo must be a PNG or JPG image".to_string()),
        };
        let size = std::fs::metadata(source)
            .map_err(|e| format!("Failed to read the logo: {}", e))?
            .len();
        if size > MAX_LOGO_BYTES {
            return Err("The logo must be 2 MB or smaller".to_string());
        }
        let bytes = std::fs::read(source).map_err(|e| format!("Failed to read the logo: {}", e))?;
        let is_png = bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        let is_jpg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
        if (ext == "png" && !is_png) || (ext == "jpg" && !is_jpg) {
            return Err("The file is not a PNG or JPG image".to_string());
        }

        std::fs::create_dir_all(logo_dir).map_err(|e| format!("Failed to store the logo: {}", e))?;
        let dest = logo_dir.join(format!("logo-{}.{}", Utc::now().timestamp_millis(), ext));
        std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to store the logo: {}", e))?;

        let old = Self::get_clinic_profile(db).await?.logo_path;
        let dest_str = dest.to_string_lossy().to_string();
        if let Err(e) = Self::store_logo_path(db, Some(dest_str.clone())).await {
            let _ = std::fs::remove_file(&dest);
            return Err(e);
        }
        if let Some(old) = old.filter(|old| *old != dest_str) {
            Self::remove_logo_file(&old);
        }
        Self::get_clinic_profile(db).await
    }

    pub async fn remove_clinic_logo(db: &DatabaseConnection) -> Result<ClinicProfile, String> {
        let old = Self::get_clinic_profile(db).await?.logo_path;
        Self::store_logo_path(db, None).await?;
        if let Some(old) = old {
            Self::remove_logo_file(&old);
        }
        Self::get_clinic_profile(db).await
    }

    /// The logo as a `data:` URL for the settings preview.
    pub fn clinic_logo_data_url(profile: &ClinicProfile) -> Option<String> {
        const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let path = profile.logo_path.as_ref()?;
        let bytes = std::fs::read(path).ok()?;
        let mime = if path.to_ascii_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" };
        let mut out = String::with_capacity(bytes.len() * 4 / 3 + 32);
        out.push_str("data:");
        out.push_str(mime);
        out.push_str(";base64,");
        for chunk in bytes.chunks(3) {
            let n = (chunk[0] as u32) << 16
                | (*chunk.get(1).unwrap_or(&0) as u32) << 8
                | *chunk.get(2).unwrap_or(&0) as u32;
            out.push(ALPHABET[(n >> 18) as usize & 63] as char);
            out.push(ALPHABET[(n >> 12) as usize & 63] as char);
            out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
            out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
        }
        Some(out)
    }

    async fn store_logo_path(db: &DatabaseConnection, path: Option<String>) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE clinic_profile SET logo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            [path.into()],
        ))
        .await
        .map_err(|e| format!("Failed to save the logo: {}", e))?;
        Ok(())
    }

    fn remove_logo_file(path: &str) {
        if let Err(e) = std::fs::remove_file(path) {
            log::warn!("Old clinic logo {} could not be removed: {}", path, e);
        }
    }

    // ==================== VAT RATES ====================

    fn row_to_tax_rate(row: &QueryResult) -> TaxRate {
        TaxRate {
            id: row.try_get("", "id").unwrap_or_default(),
            name: row.try_get("", "name").unwrap_or_default(),
            percent: row.try_get::<f64>("", "percent").unwrap_or_default(),
            is_default: row.try_get::<i64>("", "is_default").map(|v| v != 0).unwrap_or(false),
            is_active: row.try_get::<i64>("", "is_active").map(|v| v != 0).unwrap_or(true),
            display_order: row.try_get("", "display_order").unwrap_or_default(),
        }
    }

    pub async fn list_tax_rates(db: &DatabaseConnection, active_only: bool) -> Result<Vec<TaxRate>, String> {
        let sql = if active_only {
            "SELECT id, name, percent, is_default, is_active, display_order FROM tax_rates \
             WHERE is_active = 1 ORDER BY display_order, id"
        } else {
            "SELECT id, name, percent, is_default, is_active, display_order FROM tax_rates \
             ORDER BY display_order, id"
        };
        let rows = db
            .query_all(Statement::from_string(DbBackend::Sqlite, sql))
            .await
            .map_err(|e| format!("Failed to read VAT rates: {}", e))?;
        Ok(rows.iter().map(Self::row_to_tax_rate).collect())
    }

    pub async fn find_tax_rate<C: ConnectionTrait>(db: &C, id: i64) -> Result<Option<TaxRate>, String> {
        let row = db
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, name, percent, is_default, is_active, display_order FROM tax_rates WHERE id = ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to read the VAT rate: {}", e))?;
        Ok(row.as_ref().map(Self::row_to_tax_rate))
    }

    fn validate_tax_rate(name: &str, percent: f64) -> Result<(), String> {
        if name.trim().is_empty() {
            return Err("A VAT rate needs a name".to_string());
        }
        if !(0.0..=100.0).contains(&percent) || percent.is_nan() {
            return Err("A VAT rate must be between 0 and 100 percent".to_string());
        }
        Ok(())
    }

    pub async fn create_tax_rate(db: &DatabaseConnection, input: CreateTaxRateInput) -> Result<TaxRate, String> {
        Self::validate_tax_rate(&input.name, input.percent)?;
        let txn = db.begin().await.map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        let is_default = input.is_default.unwrap_or(false);
        if is_default {
            txn.execute(Statement::from_string(DbBackend::Sqlite, "UPDATE tax_rates SET is_default = 0"))
                .await
                .map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        }
        let result = txn
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO tax_rates (name, percent, is_default, display_order) \
                 VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM tax_rates))",
                [input.name.trim().into(), input.percent.into(), (is_default as i64).into()],
            ))
            .await
            .map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        txn.commit().await.map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        Self::find_tax_rate(db, result.last_insert_id() as i64)
            .await?
            .ok_or_else(|| "The VAT rate was not saved".to_string())
    }

    pub async fn update_tax_rate(db: &DatabaseConnection, id: i64, input: UpdateTaxRateInput) -> Result<TaxRate, String> {
        let current = Self::find_tax_rate(db, id).await?.ok_or_else(|| "VAT rate not found".to_string())?;
        let name = input.name.map(|n| n.trim().to_string()).unwrap_or(current.name);
        let percent = input.percent.unwrap_or(current.percent);
        Self::validate_tax_rate(&name, percent)?;
        let is_active = input.is_active.unwrap_or(current.is_active);
        let is_default = is_active && input.is_default.unwrap_or(current.is_default);

        let txn = db.begin().await.map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        if is_default {
            txn.execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE tax_rates SET is_default = 0 WHERE id != ?",
                [id.into()],
            ))
            .await
            .map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        }
        txn.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE tax_rates SET name = ?, percent = ?, is_default = ?, is_active = ?, \
             updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [name.into(), percent.into(), (is_default as i64).into(), (is_active as i64).into(), id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        txn.commit().await.map_err(|e| format!("Failed to save the VAT rate: {}", e))?;
        Self::find_tax_rate(db, id).await?.ok_or_else(|| "VAT rate not found".to_string())
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
