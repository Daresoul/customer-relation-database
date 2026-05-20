//! SettingsService CRUD + edge cases.

use crate::models::settings::UpdateSettingsRequest;
use crate::services::settings::SettingsService;
use crate::test_utils::create_test_db_with_migrations;

const USER: &str = "default";

#[tokio::test]
async fn get_settings_creates_default_row_on_first_call() {
    let db = create_test_db_with_migrations().await;
    let response = SettingsService::get_settings(&db, USER).await.unwrap();
    // First call should return some defaults — language/theme/dateFormat populated
    assert!(!response.settings.language.is_empty());
    assert!(!response.settings.theme.is_empty());
    assert!(!response.settings.date_format.is_empty());
    assert_eq!(response.settings.user_id, USER);
}

#[tokio::test]
async fn get_settings_twice_returns_same_id() {
    let db = create_test_db_with_migrations().await;
    let first = SettingsService::get_settings(&db, USER).await.unwrap();
    let second = SettingsService::get_settings(&db, USER).await.unwrap();
    assert_eq!(first.settings.id, second.settings.id, "second call should hit existing row");
}

#[tokio::test]
async fn update_settings_persists_language() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();

    let updated = SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: Some("mk".to_string()),
        currency_id: None,
        theme: None,
        date_format: None,
    }).await.unwrap();

    assert_eq!(updated.settings.language, "mk");
}

#[tokio::test]
async fn update_settings_persists_theme() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();

    let updated = SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: None,
        currency_id: None,
        theme: Some("dark".to_string()),
        date_format: None,
    }).await.unwrap();

    assert_eq!(updated.settings.theme, "dark");
}

#[tokio::test]
async fn update_settings_persists_date_format() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();

    let updated = SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: None,
        currency_id: None,
        theme: None,
        date_format: Some("YYYY-MM-DD".to_string()),
    }).await.unwrap();

    assert_eq!(updated.settings.date_format, "YYYY-MM-DD");
}

#[tokio::test]
async fn update_settings_with_valid_currency_persists() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();

    let updated = SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: None,
        currency_id: Some(1),
        theme: None,
        date_format: None,
    }).await.unwrap();
    assert_eq!(updated.settings.currency_id, Some(1));
    assert!(updated.currency.is_some(), "should hydrate currency");
}

#[tokio::test]
async fn update_settings_with_invalid_currency_id_fails_fk() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();

    let result = SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: None,
        currency_id: Some(99999),
        theme: None,
        date_format: None,
    }).await;
    assert!(result.is_err(), "should fail FK on currency_id");
}

#[tokio::test]
async fn update_settings_partial_keeps_unchanged_fields() {
    let db = create_test_db_with_migrations().await;
    let before = SettingsService::get_settings(&db, USER).await.unwrap();
    let before_lang = before.settings.language.clone();

    // Update only theme
    SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: None,
        currency_id: None,
        theme: Some("dark".to_string()),
        date_format: None,
    }).await.unwrap();

    let after = SettingsService::get_settings(&db, USER).await.unwrap();
    assert_eq!(after.settings.language, before_lang, "language untouched");
    assert_eq!(after.settings.theme, "dark");
}

#[tokio::test]
async fn settings_isolated_per_user_id() {
    let db = create_test_db_with_migrations().await;

    let user_a = SettingsService::get_settings(&db, "alice").await.unwrap();
    let user_b = SettingsService::get_settings(&db, "bob").await.unwrap();
    assert_ne!(user_a.settings.id, user_b.settings.id, "different user_id → different row");

    SettingsService::update_settings(&db, "alice", UpdateSettingsRequest {
        language: Some("en".to_string()),
        currency_id: None, theme: None, date_format: None,
    }).await.unwrap();
    SettingsService::update_settings(&db, "bob", UpdateSettingsRequest {
        language: Some("mk".to_string()),
        currency_id: None, theme: None, date_format: None,
    }).await.unwrap();

    let alice = SettingsService::get_settings(&db, "alice").await.unwrap();
    let bob = SettingsService::get_settings(&db, "bob").await.unwrap();
    assert_eq!(alice.settings.language, "en");
    assert_eq!(bob.settings.language, "mk");
}

#[tokio::test]
async fn round_trip_language_change_survives_restart() {
    let db = create_test_db_with_migrations().await;
    let _ = SettingsService::get_settings(&db, USER).await.unwrap();
    SettingsService::update_settings(&db, USER, UpdateSettingsRequest {
        language: Some("mk".to_string()),
        currency_id: None, theme: None, date_format: None,
    }).await.unwrap();

    // Fetch fresh — simulates a process restart
    let fresh = SettingsService::get_settings(&db, USER).await.unwrap();
    assert_eq!(fresh.settings.language, "mk");
}
