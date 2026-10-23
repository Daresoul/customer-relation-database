use crate::entities::device_integration::{self, Entity as DeviceIntegrationEntity};
use crate::models::device_integration::{
    DeviceIntegration, CreateDeviceIntegrationInput,
    UpdateDeviceIntegrationInput, DeviceType, ConnectionType
};
use crate::models::dto::MaybeNull;
use chrono::Utc;
use sea_orm::*;

pub struct DeviceIntegrationService;

impl DeviceIntegrationService {
    /// Convert a SeaORM device_integration model to the API DeviceIntegration model
    fn to_api_model(model: device_integration::Model) -> Result<DeviceIntegration, String> {
        Ok(DeviceIntegration {
            id: model.id,
            name: model.name,
            device_type: DeviceType::from_db_string(&model.device_type)?,
            connection_type: ConnectionType::from_db_string(&model.connection_type)?,
            watch_directory: model.watch_directory,
            file_pattern: model.file_pattern,
            serial_port_name: model.serial_port_name,
            serial_baud_rate: model.serial_baud_rate,
            tcp_host: model.tcp_host,
            tcp_port: model.tcp_port,
            enabled: model.enabled,
            last_connected_at: model.last_connected_at,
            created_at: model.created_at,
            updated_at: model.updated_at,
            deleted_at: model.deleted_at,
        })
    }

    /// Get all device integrations
    pub async fn get_all(db: &DatabaseConnection) -> Result<Vec<DeviceIntegration>, String> {
        let models = DeviceIntegrationEntity::find()
            .filter(device_integration::Column::DeletedAt.is_null())
            .order_by_asc(device_integration::Column::Name)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch device integrations: {}", e))?;

        models
            .into_iter()
            .map(Self::to_api_model)
            .collect()
    }

    /// Get device integration by ID
    pub async fn get_by_id(db: &DatabaseConnection, id: i64) -> Result<DeviceIntegration, String> {
        let model = DeviceIntegrationEntity::find_by_id(id)
            .filter(device_integration::Column::DeletedAt.is_null())
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .ok_or_else(|| "Device integration not found".to_string())?;

        Self::to_api_model(model)
    }

    /// Only one program can open a serial port, so a second enabled machine
    /// on the same port would never get a result. Refused with
    /// `port_in_use:<other machine's name>`, which the settings page shows.
    async fn ensure_port_free(
        db: &DatabaseConnection,
        own_id: Option<i64>,
        enabled: bool,
        connection_type: &ConnectionType,
        port: Option<&str>,
    ) -> Result<(), String> {
        if !enabled || *connection_type != ConnectionType::SerialPort {
            return Ok(());
        }
        let Some(port) = port.map(str::trim).filter(|p| !p.is_empty()) else {
            return Ok(());
        };
        let taken_by = Self::get_all(db).await?.into_iter().find(|other| {
            Some(other.id) != own_id
                && other.enabled
                && other.connection_type == ConnectionType::SerialPort
                && other.serial_port_name.as_deref().is_some_and(|p| p.trim().eq_ignore_ascii_case(port))
        });
        match taken_by {
            Some(other) => Err(format!("port_in_use:{}", other.name)),
            None => Ok(()),
        }
    }

    /// Create a new device integration
    pub async fn create(
        db: &DatabaseConnection,
        input: CreateDeviceIntegrationInput,
    ) -> Result<DeviceIntegration, String> {
        Self::ensure_port_free(db, None, true, &input.connection_type, input.serial_port_name.as_deref()).await?;
        let now = Utc::now();

        let new_integration = device_integration::ActiveModel {
            name: Set(input.name),
            device_type: Set(input.device_type.to_db_string().to_string()),
            connection_type: Set(input.connection_type.to_db_string().to_string()),
            watch_directory: Set(input.watch_directory),
            file_pattern: Set(input.file_pattern),
            serial_port_name: Set(input.serial_port_name),
            serial_baud_rate: Set(input.serial_baud_rate),
            tcp_host: Set(input.tcp_host),
            tcp_port: Set(input.tcp_port),
            enabled: Set(true),
            last_connected_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
            deleted_at: Set(None),
            ..Default::default()
        };

        let result = DeviceIntegrationEntity::insert(new_integration)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create device integration: {}", e))?;

        Self::get_by_id(db, result.last_insert_id).await
    }

    /// Update an existing device integration
    pub async fn update(
        db: &DatabaseConnection,
        id: i64,
        input: UpdateDeviceIntegrationInput,
    ) -> Result<DeviceIntegration, String> {
        // Get current values first
        let current = Self::get_by_id(db, id).await?;

        // Use new values if provided, otherwise use current values
        let name = input.name.unwrap_or(current.name);
        let connection_type = input.connection_type.unwrap_or(current.connection_type);

        // Handle MaybeNull fields - only update if not Undefined
        let watch_directory = match input.watch_directory {
            MaybeNull::Undefined => current.watch_directory,
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(v),
        };
        // file_pattern stays as Option (clearable)
        let file_pattern = input.file_pattern.or(current.file_pattern);

        let serial_port_name = match input.serial_port_name {
            MaybeNull::Undefined => current.serial_port_name,
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(v),
        };
        let serial_baud_rate = match input.serial_baud_rate {
            MaybeNull::Undefined => current.serial_baud_rate,
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(v),
        };
        let tcp_host = match input.tcp_host {
            MaybeNull::Undefined => current.tcp_host,
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(v),
        };
        let tcp_port = match input.tcp_port {
            MaybeNull::Undefined => current.tcp_port,
            MaybeNull::Null => None,
            MaybeNull::Value(v) => Some(v),
        };
        let enabled = input.enabled.unwrap_or(current.enabled);
        Self::ensure_port_free(db, Some(id), enabled, &connection_type, serial_port_name.as_deref()).await?;

        // Fetch the entity model for update
        let entity = DeviceIntegrationEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .ok_or_else(|| "Device integration not found".to_string())?;

        let now = Utc::now();
        let mut model: device_integration::ActiveModel = entity.into();

        model.name = Set(name);
        model.connection_type = Set(connection_type.to_db_string().to_string());
        model.watch_directory = Set(watch_directory);
        model.file_pattern = Set(file_pattern);
        model.serial_port_name = Set(serial_port_name);
        model.serial_baud_rate = Set(serial_baud_rate);
        model.tcp_host = Set(tcp_host);
        model.tcp_port = Set(tcp_port);
        model.enabled = Set(enabled);
        model.updated_at = Set(now);

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update device integration: {}", e))?;

        Self::get_by_id(db, id).await
    }

    /// Delete a device integration (soft delete)
    pub async fn delete(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        let entity = DeviceIntegrationEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .ok_or_else(|| "Device integration not found".to_string())?;

        let now = Utc::now();
        let mut model: device_integration::ActiveModel = entity.into();
        model.deleted_at = Set(Some(now));
        model.updated_at = Set(now);

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to delete device integration: {}", e))?;

        Ok(())
    }

    /// Toggle enabled status
    pub async fn toggle_enabled(db: &DatabaseConnection, id: i64) -> Result<DeviceIntegration, String> {
        let entity = DeviceIntegrationEntity::find_by_id(id)
            .filter(device_integration::Column::DeletedAt.is_null())
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .ok_or_else(|| "Device integration not found".to_string())?;

        let new_enabled = !entity.enabled;
        let connection_type = ConnectionType::from_db_string(&entity.connection_type)?;
        Self::ensure_port_free(db, Some(id), new_enabled, &connection_type, entity.serial_port_name.as_deref()).await?;
        let now = Utc::now();

        let mut model: device_integration::ActiveModel = entity.into();
        model.enabled = Set(new_enabled);
        model.updated_at = Set(now);

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to toggle enabled status: {}", e))?;

        Self::get_by_id(db, id).await
    }

    pub async fn record_last_result(db: &DatabaseConnection, id: i64, at: &str) -> Result<(), String> {
        db.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE device_integrations SET last_result_at = ? WHERE id = ?",
            [at.into(), id.into()],
        ))
        .await
        .map_err(|e| format!("Failed to record last result time: {}", e))?;
        Ok(())
    }

    pub async fn last_result_times(db: &DatabaseConnection) -> Result<std::collections::HashMap<i64, String>, String> {
        let rows = db
            .query_all(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, last_result_at FROM device_integrations WHERE last_result_at IS NOT NULL",
            ))
            .await
            .map_err(|e| format!("Failed to read last result times: {}", e))?;
        Ok(rows
            .iter()
            .filter_map(|row| {
                let id: i64 = row.try_get("", "id").ok()?;
                let at: String = row.try_get("", "last_result_at").ok()?;
                Some((id, at))
            })
            .collect())
    }

    /// How many readable results each machine has sent since `since`.
    pub async fn results_since(
        _db: &DatabaseConnection,
        _since: chrono::DateTime<chrono::Utc>,
    ) -> Result<std::collections::HashMap<i64, i64>, String> {
        Ok(std::collections::HashMap::new())
    }

    /// Update last_connected_at timestamp
    #[allow(dead_code)]
    pub async fn update_last_connected(db: &DatabaseConnection, id: i64) -> Result<(), String> {
        let entity = DeviceIntegrationEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch device integration: {}", e))?
            .ok_or_else(|| "Device integration not found".to_string())?;

        let now = Utc::now();
        let mut model: device_integration::ActiveModel = entity.into();
        model.last_connected_at = Set(Some(now));

        model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update last_connected_at: {}", e))?;

        Ok(())
    }
}
