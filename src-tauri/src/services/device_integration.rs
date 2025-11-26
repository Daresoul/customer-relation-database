use crate::database::DatabasePool;
use crate::models::device_integration::{
    DeviceIntegration, DeviceIntegrationRow, CreateDeviceIntegrationInput,
    UpdateDeviceIntegrationInput
};
use sqlx::Row;
use chrono::Utc;

pub struct DeviceIntegrationService;

impl DeviceIntegrationService {
    /// Get all device integrations
    pub async fn get_all(pool: &DatabasePool) -> Result<Vec<DeviceIntegration>, String> {
        let pool_guard = pool.lock().await;

        let rows: Vec<DeviceIntegrationRow> = sqlx::query_as::<_, DeviceIntegrationRow>(
            "SELECT * FROM device_integrations WHERE deleted_at IS NULL ORDER BY name"
        )
        .fetch_all(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to fetch device integrations: {}", e))?;

        let integrations: Result<Vec<DeviceIntegration>, String> = rows
            .into_iter()
            .map(|row| DeviceIntegration::from_row(row))
            .collect();

        integrations
    }

    /// Get device integration by ID
    pub async fn get_by_id(pool: &DatabasePool, id: i64) -> Result<DeviceIntegration, String> {
        let pool_guard = pool.lock().await;

        let row: DeviceIntegrationRow = sqlx::query_as::<_, DeviceIntegrationRow>(
            "SELECT * FROM device_integrations WHERE id = ? AND deleted_at IS NULL"
        )
        .bind(id)
        .fetch_one(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to fetch device integration: {}", e))?;

        DeviceIntegration::from_row(row)
    }

    /// Create a new device integration
    pub async fn create(
        pool: &DatabasePool,
        input: CreateDeviceIntegrationInput,
    ) -> Result<DeviceIntegration, String> {
        let id = {
            let pool_guard = pool.lock().await;

            let result = sqlx::query(
                r#"
                INSERT INTO device_integrations (
                    name, device_type, connection_type,
                    watch_directory, file_pattern,
                    serial_port_name, serial_baud_rate,
                    tcp_host, tcp_port,
                    enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                "#
            )
            .bind(&input.name)
            .bind(input.device_type.to_db_string())
            .bind(input.connection_type.to_db_string())
            .bind(&input.watch_directory)
            .bind(&input.file_pattern)
            .bind(&input.serial_port_name)
            .bind(input.serial_baud_rate)
            .bind(&input.tcp_host)
            .bind(input.tcp_port)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to create device integration: {}", e))?;

            result.last_insert_rowid()
        }; // Release lock here

        Self::get_by_id(pool, id).await
    }

    /// Update an existing device integration
    pub async fn update(
        pool: &DatabasePool,
        id: i64,
        input: UpdateDeviceIntegrationInput,
    ) -> Result<DeviceIntegration, String> {
        // Get current values first (before acquiring lock for update)
        let current = Self::get_by_id(pool, id).await?;

        // Use new values if provided, otherwise use current values
        let name = input.name.unwrap_or(current.name);
        let connection_type = input.connection_type.unwrap_or(current.connection_type);
        let watch_directory = input.watch_directory.or(current.watch_directory);
        let file_pattern = input.file_pattern.or(current.file_pattern);
        let serial_port_name = input.serial_port_name.or(current.serial_port_name);
        let serial_baud_rate = input.serial_baud_rate.or(current.serial_baud_rate);
        let tcp_host = input.tcp_host.or(current.tcp_host);
        let tcp_port = input.tcp_port.or(current.tcp_port);
        let enabled = input.enabled.unwrap_or(current.enabled);

        // Now acquire lock for the update
        {
            let pool_guard = pool.lock().await;

            sqlx::query(
                r#"
                UPDATE device_integrations SET
                    name = ?,
                    connection_type = ?,
                    watch_directory = ?,
                    file_pattern = ?,
                    serial_port_name = ?,
                    serial_baud_rate = ?,
                    tcp_host = ?,
                    tcp_port = ?,
                    enabled = ?,
                    updated_at = ?
                WHERE id = ?
                "#
            )
            .bind(&name)
            .bind(connection_type.to_db_string())
            .bind(&watch_directory)
            .bind(&file_pattern)
            .bind(&serial_port_name)
            .bind(serial_baud_rate)
            .bind(&tcp_host)
            .bind(tcp_port)
            .bind(enabled)
            .bind(Utc::now().to_rfc3339())
            .bind(id)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to update device integration: {}", e))?;
        } // Release lock here

        // Fetch and return the updated integration
        Self::get_by_id(pool, id).await
    }

    /// Delete a device integration (soft delete)
    pub async fn delete(pool: &DatabasePool, id: i64) -> Result<(), String> {
        let pool_guard = pool.lock().await;

        sqlx::query(
            "UPDATE device_integrations SET deleted_at = ? WHERE id = ?"
        )
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to delete device integration: {}", e))?;

        Ok(())
    }

    /// Toggle enabled status
    pub async fn toggle_enabled(pool: &DatabasePool, id: i64) -> Result<DeviceIntegration, String> {
        {
            let pool_guard = pool.lock().await;

            // Get current enabled status
            let current_enabled: bool = sqlx::query(
                "SELECT enabled FROM device_integrations WHERE id = ? AND deleted_at IS NULL"
            )
            .bind(id)
            .fetch_one(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .get(0);

            // Toggle the status
            sqlx::query(
                "UPDATE device_integrations SET enabled = ? WHERE id = ?"
            )
            .bind(!current_enabled)
            .bind(id)
            .execute(&*pool_guard)
            .await
            .map_err(|e| format!("Failed to toggle enabled status: {}", e))?;
        } // Release lock here

        Self::get_by_id(pool, id).await
    }

    /// Update last_connected_at timestamp
    #[allow(dead_code)]
    pub async fn update_last_connected(pool: &DatabasePool, id: i64) -> Result<(), String> {
        let pool_guard = pool.lock().await;

        sqlx::query(
            "UPDATE device_integrations SET last_connected_at = ? WHERE id = ?"
        )
        .bind(Utc::now().to_rfc3339())
        .bind(id)
        .execute(&*pool_guard)
        .await
        .map_err(|e| format!("Failed to update last_connected_at: {}", e))?;

        Ok(())
    }
}
