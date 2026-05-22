//! Service layer for the `managed_hid_scanners` table — the list of HID
//! devices that the Windows Raw Input capture should suppress globally.
//!
//! Kept deliberately tiny: just CRUD. The actual platform-specific Raw Input
//! registration lives in [`crate::services::raw_input_capture`].

use crate::database::SeaOrmPool;
use crate::models::managed_hid_scanner::{
    CreateManagedHidScannerInput, ManagedHidScanner, UpdateManagedHidScannerInput,
};
use sea_orm::{ConnectionTrait, DbBackend, QueryResult, Statement};

pub struct ManagedHidScannerService;

impl ManagedHidScannerService {
    pub async fn list_all(pool: &SeaOrmPool) -> Result<Vec<ManagedHidScanner>, String> {
        let rows = pool
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, name, vendor_id, product_id, enabled, created_at, updated_at \
                 FROM managed_hid_scanners ORDER BY name ASC",
                vec![],
            ))
            .await
            .map_err(|e| format!("list_managed_hid_scanners: {}", e))?;

        rows.iter().map(row_to_model).collect()
    }

    /// Only enabled rows — used by `raw_input_capture` on startup.
    pub async fn list_enabled(pool: &SeaOrmPool) -> Result<Vec<ManagedHidScanner>, String> {
        let rows = pool
            .query_all(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, name, vendor_id, product_id, enabled, created_at, updated_at \
                 FROM managed_hid_scanners WHERE enabled = 1",
                vec![],
            ))
            .await
            .map_err(|e| format!("list_enabled_managed_hid_scanners: {}", e))?;

        rows.iter().map(row_to_model).collect()
    }

    pub async fn create(
        pool: &SeaOrmPool,
        input: CreateManagedHidScannerInput,
    ) -> Result<ManagedHidScanner, String> {
        if input.name.trim().is_empty() {
            return Err("Name is required".into());
        }
        if !(0..=0xFFFF).contains(&input.vendor_id) {
            return Err("vendor_id must be 0..65535".into());
        }
        if !(0..=0xFFFF).contains(&input.product_id) {
            return Err("product_id must be 0..65535".into());
        }

        let enabled = input.enabled.unwrap_or(true);
        let res = pool
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO managed_hid_scanners (name, vendor_id, product_id, enabled) \
                 VALUES (?, ?, ?, ?)",
                vec![
                    input.name.trim().into(),
                    input.vendor_id.into(),
                    input.product_id.into(),
                    (if enabled { 1i64 } else { 0i64 }).into(),
                ],
            ))
            .await
            .map_err(|e| {
                // Surface the UNIQUE(vendor_id, product_id) collision as a user-friendly message
                // because the most common cause is "you tried to add the same scanner twice."
                if e.to_string().contains("UNIQUE") {
                    "A scanner with this VID/PID is already managed".to_string()
                } else {
                    format!("create_managed_hid_scanner: {}", e)
                }
            })?;

        Self::get_by_id(pool, res.last_insert_id() as i64).await
    }

    pub async fn get_by_id(pool: &SeaOrmPool, id: i64) -> Result<ManagedHidScanner, String> {
        let row = pool
            .query_one(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT id, name, vendor_id, product_id, enabled, created_at, updated_at \
                 FROM managed_hid_scanners WHERE id = ?",
                vec![id.into()],
            ))
            .await
            .map_err(|e| format!("get_managed_hid_scanner: {}", e))?
            .ok_or_else(|| format!("Managed HID scanner {} not found", id))?;
        row_to_model(&row)
    }

    pub async fn update(
        pool: &SeaOrmPool,
        id: i64,
        input: UpdateManagedHidScannerInput,
    ) -> Result<ManagedHidScanner, String> {
        // Only support fields we actually expose on the UI today — name + enable
        // toggle. VID/PID are immutable because changing them effectively means
        // "this is a different device"; add a new row + delete the old one.
        let mut sets: Vec<&'static str> = Vec::new();
        let mut values: Vec<sea_orm::Value> = Vec::new();

        if let Some(name) = input.name {
            if name.trim().is_empty() {
                return Err("Name cannot be empty".into());
            }
            sets.push("name = ?");
            values.push(name.trim().to_string().into());
        }
        if let Some(enabled) = input.enabled {
            sets.push("enabled = ?");
            values.push((if enabled { 1i64 } else { 0i64 }).into());
        }
        if sets.is_empty() {
            return Self::get_by_id(pool, id).await;
        }
        values.push(id.into());

        let sql = format!(
            "UPDATE managed_hid_scanners SET {} WHERE id = ?",
            sets.join(", ")
        );
        pool.execute(Statement::from_sql_and_values(DbBackend::Sqlite, &sql, values))
            .await
            .map_err(|e| format!("update_managed_hid_scanner: {}", e))?;

        Self::get_by_id(pool, id).await
    }

    pub async fn delete(pool: &SeaOrmPool, id: i64) -> Result<(), String> {
        pool.execute(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "DELETE FROM managed_hid_scanners WHERE id = ?",
            vec![id.into()],
        ))
        .await
        .map_err(|e| format!("delete_managed_hid_scanner: {}", e))?;
        Ok(())
    }
}

fn row_to_model(row: &QueryResult) -> Result<ManagedHidScanner, String> {
    Ok(ManagedHidScanner {
        id: row.try_get("", "id").map_err(|e| format!("id: {}", e))?,
        name: row.try_get("", "name").map_err(|e| format!("name: {}", e))?,
        vendor_id: row
            .try_get::<i64>("", "vendor_id")
            .map_err(|e| format!("vendor_id: {}", e))? as i32,
        product_id: row
            .try_get::<i64>("", "product_id")
            .map_err(|e| format!("product_id: {}", e))? as i32,
        enabled: row.try_get::<i64>("", "enabled").map_err(|e| format!("enabled: {}", e))? != 0,
        created_at: row.try_get("", "created_at").unwrap_or_default(),
        updated_at: row.try_get("", "updated_at").unwrap_or_default(),
    })
}
