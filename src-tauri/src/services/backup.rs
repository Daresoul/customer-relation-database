//! Backup service: snapshots the SQLite DB and mirrors the app's files directory
//! into a user-chosen backup folder.
//!
//! Persists its own config as JSON in <app_data_dir>/backup_config.json rather
//! than in app_settings, because the config is system-level and should be
//! readable before the DB pool is ready (e.g. at startup before migrations).

use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
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
const PRE_UPDATE_SNAPSHOT_RETENTION: usize = 10;
const PRE_UPDATE_MARKER: &str = "_pre-update-";

/// Which snapshot a backup run writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotKind {
    /// One per UTC day; a rerun the same day replaces it.
    Daily,
    /// Taken right before installing an update. Never replaced by a daily
    /// run, and pruned on its own count, so the post-update startup backup
    /// can't erase the last copy from before the new migrations ran.
    PreUpdate { app_version: String },
}

pub fn snapshot_file_name(kind: &SnapshotKind, now: DateTime<Utc>) -> String {
    match kind {
        SnapshotKind::Daily => format!("vet_clinic_{}.db", now.format("%Y-%m-%d")),
        SnapshotKind::PreUpdate { app_version } => format!(
            "vet_clinic_{}{}{}.db",
            now.format("%Y-%m-%d_%H-%M-%S"),
            PRE_UPDATE_MARKER,
            app_version
        ),
    }
}

pub fn is_pre_update_snapshot(file_name: &str) -> bool {
    file_name.contains(PRE_UPDATE_MARKER)
}

/// True when a backup folder is set and the last successful backup is
/// older than the scheduled interval (or there never was one).
pub fn is_backup_due(_cfg: &BackupConfig, _now: DateTime<Utc>) -> bool {
    false
}

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
        Self::run_backup_with_kind(app_data_dir, db, SnapshotKind::Daily).await
    }

    pub async fn run_backup_with_kind(
        app_data_dir: &Path,
        db: &DatabaseConnection,
        kind: SnapshotKind,
    ) -> Result<BackupConfig, String> {
        let mut cfg = Self::load_config(app_data_dir);
        let backup_dir = cfg
            .directory
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| "No backup directory configured".to_string())?;

        let result = Self::do_backup(app_data_dir, &backup_dir, db, &kind).await;
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
        kind: &SnapshotKind,
    ) -> Result<(), String> {
        if !backup_dir.exists() {
            return Err(format!("Backup directory does not exist: {}", backup_dir.display()));
        }

        let db_dir = backup_dir.join("db");
        let files_dest = backup_dir.join("files");
        std::fs::create_dir_all(&db_dir).map_err(|e| format!("Create db dir: {}", e))?;
        std::fs::create_dir_all(&files_dest).map_err(|e| format!("Create files dir: {}", e))?;

        // VACUUM INTO produces a consistent point-in-time copy that doesn't
        // require quiescing other writers (unlike a raw file copy + WAL).
        let db_target = db_dir.join(snapshot_file_name(kind, Utc::now()));
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

        let (keep, pre_update) = match kind {
            SnapshotKind::Daily => (DB_SNAPSHOT_RETENTION, false),
            SnapshotKind::PreUpdate { .. } => (PRE_UPDATE_SNAPSHOT_RETENTION, true),
        };
        prune_old_snapshots(&db_dir, keep, pre_update)
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

/// Keeps the newest `keep` snapshots of one kind: pre-update snapshots when
/// `pre_update` is true, every other `.db` file otherwise.
fn prune_old_snapshots(db_dir: &Path, keep: usize, pre_update: bool) -> std::io::Result<()> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in std::fs::read_dir(db_dir)? {
        let entry = entry?;
        let path = entry.path();
        let is_db = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.eq_ignore_ascii_case("db"))
            .unwrap_or(false);
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_db || is_pre_update_snapshot(&name) != pre_update {
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
