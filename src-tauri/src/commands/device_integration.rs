use crate::database::SeaOrmPool;
use crate::models::device_integration::{
    DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput, ConnectionType
};
use crate::services::device_integration::DeviceIntegrationService;
use crate::services::device_input::{start_listen, stop_listen};
use crate::services::file_watcher::reload_file_watchers;
use tauri::{State, AppHandle};

#[tauri::command]
pub async fn get_device_integrations(
    pool: State<'_, SeaOrmPool>,
) -> Result<Vec<DeviceIntegration>, String> {
    DeviceIntegrationService::get_all(&pool).await
}

#[tauri::command]
pub async fn get_device_integration(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<DeviceIntegration, String> {
    DeviceIntegrationService::get_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_device_integration(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    input: CreateDeviceIntegrationInput,
) -> Result<DeviceIntegration, String> {
    let integration = DeviceIntegrationService::create(&pool, input).await?;

    // Auto-start listener if it's a serial port integration (new integrations are enabled by default)
    if integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = integration.serial_port_name {
            let _ = start_listen(
                app_handle,
                port_name.clone(),
                integration.device_type.to_db_string().to_string(),
                integration.id,
            );
        }
    }

    reload_file_watchers().await;
    Ok(integration)
}

#[tauri::command]
pub async fn update_device_integration(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateDeviceIntegrationInput,
) -> Result<DeviceIntegration, String> {
    let integration = save_then_stop_old_listener(&pool, id, input, stop_serial_listener).await?;

    // Start new listener if enabled and it's a serial port integration
    if integration.enabled && integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = integration.serial_port_name {
            let _ = start_listen(
                app_handle,
                port_name.clone(),
                integration.device_type.to_db_string().to_string(),
                integration.id,
            );
        }
    }

    reload_file_watchers().await;
    Ok(integration)
}

fn stop_serial_listener(integration: &DeviceIntegration) {
    if integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = integration.serial_port_name {
            stop_listen(port_name, &integration.device_type.to_db_string());
        }
    }
}

/// Save an integration's new settings, then stop the listener of its old
/// ones. A failed save leaves the running listener as it was.
pub(crate) async fn save_then_stop_old_listener(
    db: &sea_orm::DatabaseConnection,
    id: i64,
    input: UpdateDeviceIntegrationInput,
    stop: impl FnOnce(&DeviceIntegration),
) -> Result<DeviceIntegration, String> {
    let old_integration = DeviceIntegrationService::get_by_id(db, id).await?;
    let integration = DeviceIntegrationService::update(db, id, input).await?;
    stop(&old_integration);
    Ok(integration)
}

#[tauri::command]
pub async fn delete_device_integration(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    let integration = DeviceIntegrationService::get_by_id(&pool, id).await?;
    // Delete first: a failed delete keeps the device listening.
    DeviceIntegrationService::delete(&pool, id).await?;
    stop_serial_listener(&integration);
    reload_file_watchers().await;
    Ok(())
}

#[tauri::command]
pub async fn toggle_device_integration_enabled(
    app_handle: AppHandle,
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<DeviceIntegration, String> {
    let integration = DeviceIntegrationService::toggle_enabled(&pool, id).await?;

    // Start or stop listener based on enabled state
    if integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = integration.serial_port_name {
            if integration.enabled {
                // Start listener
                let _ = start_listen(
                    app_handle,
                    port_name.clone(),
                    integration.device_type.to_db_string().to_string(),
                    integration.id,
                );
            } else {
                // Stop listener
                stop_listen(port_name, &integration.device_type.to_db_string());
            }
        }
    }

    reload_file_watchers().await;
    Ok(integration)
}
