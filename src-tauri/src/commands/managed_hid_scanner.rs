//! Tauri commands for managing the HID-scanner suppression list.
//!
//! Each mutation also calls [`crate::services::raw_input_capture::reload_managed_ids`]
//! so the running Raw Input capture picks up the change without restart.

use crate::database::SeaOrmPool;
use crate::models::managed_hid_scanner::{
    CreateManagedHidScannerInput, ManagedHidScanner, UpdateManagedHidScannerInput,
};
use crate::services::managed_hid_scanner::ManagedHidScannerService;
use crate::services::raw_input_capture;
use tauri::State;

#[tauri::command]
pub async fn get_managed_hid_scanners(
    pool: State<'_, SeaOrmPool>,
) -> Result<Vec<ManagedHidScanner>, String> {
    ManagedHidScannerService::list_all(&pool).await
}

#[tauri::command]
pub async fn create_managed_hid_scanner(
    pool: State<'_, SeaOrmPool>,
    input: CreateManagedHidScannerInput,
) -> Result<ManagedHidScanner, String> {
    let created = ManagedHidScannerService::create(&pool, input).await?;
    raw_input_capture::reload_managed_ids(&pool);
    Ok(created)
}

#[tauri::command]
pub async fn update_managed_hid_scanner(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateManagedHidScannerInput,
) -> Result<ManagedHidScanner, String> {
    let updated = ManagedHidScannerService::update(&pool, id, input).await?;
    raw_input_capture::reload_managed_ids(&pool);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_managed_hid_scanner(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    ManagedHidScannerService::delete(&pool, id).await?;
    raw_input_capture::reload_managed_ids(&pool);
    Ok(())
}
