//! Backup service: snapshots the SQLite DB and mirrors the app's files directory
//! into a user-chosen backup folder.
//!
//! Persists its own config as JSON in <app_data_dir>/backup_config.json rather
//! than in app_settings, because the config is system-level and should be
//! readable before the DB pool is ready (e.g. at startup before migrations).

use std::path::{Path, PathBuf};
use chrono::Utc;
use sea_orm::{ConnectionTrait, DatabaseConnection, Statement, DbBackend};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub directory: Option<String>,
    pub last_backup_at: Option<String>,
    pub last_error: Option<String>,
}

pub struct BackupService;

const DB_SNAPSHOT_RETENTION: usize = 30;

impl BackupService {
    fn config_path(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("backup_config.json")
    }

    pub fn load_config(app_data_dir: &Path) -> BackupConfig {
        let path = Self::config_path(app_data_dir);
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save_config(app_data_dir: &Path, config: &BackupConfig) -> Result<(), String> {
        let path = Self::config_path(app_data_dir);
        let s = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        std::fs::write(&path, s).map_err(|e| format!("Write backup config: {}", e))
    }

    pub fn set_directory(app_data_dir: &Path, directory: &str) -> Result<BackupConfig, String> {
        let trimmed = directory.trim();
        if trimmed.is_empty() {
            return Err("Backup directory cannot be empty".to_string());
        }
        let target = PathBuf::from(trimmed);
        if !target.exists() {
            std::fs::create_dir_all(&target)
                .map_err(|e| format!("Create backup directory: {}", e))?;
        }
        if !target.is_dir() {
            return Err(format!("Backup path is not a directory: {}", trimmed));
        }
        let mut cfg = Self::load_config(app_data_dir);
        cfg.directory = Some(trimmed.to_string());
        Self::save_config(app_data_dir, &cfg)?;
        Ok(cfg)
    }

    /// Run a full backup: snapshot DB + mirror files. Records success or
    /// failure in the config file so the UI can show the last status.
    pub async fn run_backup(
        app_data_dir: &Path,
        db: &DatabaseConnection,
    ) -> Result<BackupConfig, String> {
        let mut cfg = Self::load_config(app_data_dir);
        let backup_dir = cfg
            .directory
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| "No backup directory configured".to_string())?;

        let result = Self::do_backup(app_data_dir, &backup_dir, db).await;
        match result {
            Ok(()) => {
                cfg.last_backup_at = Some(Utc::now().to_rfc3339());
                cfg.last_error = None;
            }
            Err(e) => {
                cfg.last_error = Some(e.clone());
                Self::save_config(app_data_dir, &cfg).ok();
                return Err(e);
            }
        }
        Self::save_config(app_data_dir, &cfg)?;
        Ok(cfg)
    }

    async fn do_backup(
        app_data_dir: &Path,
        backup_dir: &Path,
        db: &DatabaseConnection,
    ) -> Result<(), String> {
        if !backup_dir.exists() {
            return Err(format!("Backup directory does not exist: {}", backup_dir.display()));
        }

        let db_dir = backup_dir.join("db");
        let files_dest = backup_dir.join("files");
        std::fs::create_dir_all(&db_dir).map_err(|e| format!("Create db dir: {}", e))?;
        std::fs::create_dir_all(&files_dest).map_err(|e| format!("Create files dir: {}", e))?;

        // DB snapshot — one per day, overwriting today's if rerun. VACUUM INTO
        // produces a consistent point-in-time copy that doesn't require
        // quiescing other writers (unlike a raw file copy + WAL).
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let db_target = db_dir.join(format!("vet_clinic_{}.db", today));
        if db_target.exists() {
            std::fs::remove_file(&db_target).map_err(|e| format!("Remove old snapshot: {}", e))?;
        }
        let target_str = db_target.to_string_lossy().replace('\'', "''");
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            format!("VACUUM INTO '{}'", target_str),
        ))
        .await
        .map_err(|e| format!("VACUUM INTO failed: {}", e))?;

        // Mirror files directory (additive; never deletes from destination)
        let files_src = app_data_dir.join("files");
        if files_src.exists() {
            copy_dir_additive(&files_src, &files_dest)
                .map_err(|e| format!("Files mirror failed: {}", e))?;
        }

        // Keep the last N daily snapshots, drop the rest
        prune_old_snapshots(&db_dir, DB_SNAPSHOT_RETENTION)
            .map_err(|e| format!("Prune failed: {}", e))?;

        Ok(())
    }
}

/// Recursive copy that only copies files when the source is newer or the
/// destination doesn't exist. Never deletes from destination.
fn copy_dir_additive(src: &Path, dest: &Path) -> std::io::Result<()> {
    if !dest.exists() {
        std::fs::create_dir_all(dest)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            copy_dir_additive(&src_path, &dest_path)?;
        } else {
            let should_copy = match std::fs::metadata(&dest_path) {
                Ok(d) => {
                    let s_mod = metadata.modified().ok();
                    let d_mod = d.modified().ok();
                    match (s_mod, d_mod) {
                        (Some(s), Some(d)) => s > d,
                        _ => true,
                    }
                }
                Err(_) => true,
            };
            if should_copy {
                std::fs::copy(&src_path, &dest_path)?;
            }
        }
    }
    Ok(())
}

fn prune_old_snapshots(db_dir: &Path, keep: usize) -> std::io::Result<()> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(db_dir)? {
        let entry = entry?;
        let path = entry.path();
        let is_db = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.eq_ignore_ascii_case("db"))
            .unwrap_or(false);
        if !is_db {
            continue;
        }
        if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
            files.push((modified, path));
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in files.into_iter().skip(keep) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
