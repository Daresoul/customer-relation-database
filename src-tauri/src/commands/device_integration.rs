use crate::database::DatabasePool;
use crate::models::device_integration::{
    DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput
};
use crate::services::device_integration::DeviceIntegrationService;
use tauri::State;

#[tauri::command]
pub async fn get_device_integrations(
    pool: State<'_, DatabasePool>,
) -> Result<Vec<DeviceIntegration>, String> {
    DeviceIntegrationService::get_all(&pool).await
}

#[tauri::command]
pub async fn get_device_integration(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<DeviceIntegration, String> {
    DeviceIntegrationService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_device_integration(
    pool: State<'_, DatabasePool>,
    input: CreateDeviceIntegrationInput,
) -> Result<DeviceIntegration, String> {
    DeviceIntegrationService::create(&pool, input).await
}

#[tauri::command]
pub async fn update_device_integration(
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateDeviceIntegrationInput,
) -> Result<DeviceIntegration, String> {
    DeviceIntegrationService::update(&pool, id, input).await
}

#[tauri::command]
pub async fn delete_device_integration(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<(), String> {
    DeviceIntegrationService::delete(&pool, id).await
}

#[tauri::command]
pub async fn toggle_device_integration_enabled(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<DeviceIntegration, String> {
    DeviceIntegrationService::toggle_enabled(&pool, id).await
}
