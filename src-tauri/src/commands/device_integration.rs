use crate::database::DatabasePool;
use crate::models::device_integration::{
    DeviceIntegration, CreateDeviceIntegrationInput, UpdateDeviceIntegrationInput, ConnectionType
};
use crate::services::device_integration::DeviceIntegrationService;
use crate::services::device_input::{start_listen, stop_listen};
use tauri::{State, AppHandle};

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
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
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

    Ok(integration)
}

#[tauri::command]
pub async fn update_device_integration(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
    id: i64,
    input: UpdateDeviceIntegrationInput,
) -> Result<DeviceIntegration, String> {
    // Get old integration to check if we need to stop old listener
    let old_integration = DeviceIntegrationService::get_by_id(&pool, id).await?;

    // Stop old listener if it was a serial port integration
    if old_integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = old_integration.serial_port_name {
            stop_listen(port_name, &old_integration.device_type.to_db_string());
        }
    }

    let integration = DeviceIntegrationService::update(&pool, id, input).await?;

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

    Ok(integration)
}

#[tauri::command]
pub async fn delete_device_integration(
    pool: State<'_, DatabasePool>,
    id: i64,
) -> Result<(), String> {
    // Get integration to stop listener if needed
    let integration = DeviceIntegrationService::get_by_id(&pool, id).await?;

    // Stop listener if it was a serial port integration
    if integration.connection_type == ConnectionType::SerialPort {
        if let Some(ref port_name) = integration.serial_port_name {
            stop_listen(port_name, &integration.device_type.to_db_string());
        }
    }

    DeviceIntegrationService::delete(&pool, id).await
}

#[tauri::command]
pub async fn toggle_device_integration_enabled(
    app_handle: AppHandle,
    pool: State<'_, DatabasePool>,
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

    Ok(integration)
}
