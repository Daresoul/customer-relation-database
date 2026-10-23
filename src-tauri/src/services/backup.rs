//! Backup service: snapshots the SQLite DB and mirrors the app's files directory
//! into a user-chosen backup folder.
//!
//! Persists its own config as JSON in <app_data_dir>/backup_config.json rather
//! than in app_settings, because the config is system-level and should be
//! readable before the DB pool is ready (e.g. at startup before migrations).

use std::path::{Path, PathBuf};
use chrono::{DateTime, Local, TimeZone, Utc};
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
    /// One per local day; a rerun the same day replaces it.
    Daily,
    /// Taken right before installing an update. Never replaced by a daily
    /// run, and pruned on its own count, so the post-update startup backup
    /// can't erase the last copy from before the new migrations ran.
    PreUpdate { app_version: String },
}

/// Named by the wall-clock date and time of `now` (the app passes local time).
pub fn snapshot_file_name<Tz: TimeZone>(kind: &SnapshotKind, now: DateTime<Tz>) -> String
where
    Tz::Offset: std::fmt::Display,
{
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
pub fn is_backup_due(cfg: &BackupConfig, now: DateTime<Utc>) -> bool {
    if cfg.directory.is_none() {
        return false;
    }
    match cfg
        .last_backup_at
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
    {
        Some(last) => now.signed_duration_since(last) >= chrono::Duration::hours(BACKUP_INTERVAL_HOURS),
        None => true,
    }
}

const BACKUP_INTERVAL_HOURS: i64 = 24;
/// How often the running app checks whether a backup is due. Also the retry
/// delay after a failure (e.g. a backup drive that wasn't mounted yet at login).
const BACKUP_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// Backup at start, then whenever one is due while the app keeps running.
/// The app lives in the tray for weeks, so a start-only backup goes stale.
pub async fn run_backup_schedule(app_data_dir: PathBuf, db: std::sync::Arc<DatabaseConnection>) {
    if BackupService::load_config(&app_data_dir).directory.is_none() {
        log::info!("Backup: no destination configured, skipping startup backup");
    } else {
        run_logged(&app_data_dir, &db, "startup").await;
    }
    loop {
        tokio::time::sleep(BACKUP_CHECK_INTERVAL).await;
        if is_backup_due(&BackupService::load_config(&app_data_dir), Utc::now()) {
            run_logged(&app_data_dir, &db, "scheduled").await;
        }
    }
}

async fn run_logged(app_data_dir: &Path, db: &DatabaseConnection, trigger: &str) {
    match BackupService::run_backup(app_data_dir, db).await {
        Ok(c) => log::info!(
            "Backup ({}): completed at {}",
            trigger,
            c.last_backup_at.unwrap_or_default()
        ),
        Err(e) => log::error!("Backup ({}): failed: {}", trigger, e),
    }
}

impl BackupService {
    fn config_path(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("backup_config.json")
    }

    /// A missing file is a fresh install. A file that can't be read comes
    /// back as an error in `last_error`, so the backup light shows it.
    pub fn load_config(app_data_dir: &Path) -> BackupConfig {
        let path = Self::config_path(app_data_dir);
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return BackupConfig::default(),
            Err(e) => return Self::unreadable_config(&path, &e.to_string()),
        };
        serde_json::from_str(&text).unwrap_or_else(|e| Self::unreadable_config(&path, &e.to_string()))
    }

    fn unreadable_config(path: &Path, reason: &str) -> BackupConfig {
        log::error!("Backup: cannot read {}: {}", path.display(), reason);
        BackupConfig {
            last_error: Some(format!(
                "The backup settings file {} can't be read ({}). Choose the backup folder again.",
                path.display(),
                reason
            )),
            ..BackupConfig::default()
        }
    }

    /// Written to a temporary file and swapped in, so a failed write keeps
    /// the old settings whole.
    pub fn save_config(app_data_dir: &Path, config: &BackupConfig) -> Result<(), String> {
        let path = Self::config_path(app_data_dir);
        let tmp = path.with_extension("json.tmp");
        let s = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, s).map_err(|e| format!("Write backup config: {}", e))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("Replace backup config: {}", e))
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
        if cfg.directory.is_none() {
            // Nothing was set up (or the old file was unreadable): start clean.
            cfg.last_error = None;
        }
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
        // Written to a temporary name first, so an earlier snapshot of the
        // same name survives until the new one is complete.
        let db_target = db_dir.join(snapshot_file_name(kind, Local::now()));
        let mut part_name = db_target.file_name().unwrap_or_default().to_os_string();
        part_name.push(".part");
        let db_part = db_dir.join(part_name);
        if db_part.exists() {
            std::fs::remove_file(&db_part).map_err(|e| format!("Remove unfinished snapshot: {}", e))?;
        }
        let part_str = db_part.to_string_lossy().replace('\'', "''");
        db.execute(Statement::from_string(
            DbBackend::Sqlite,
            format!("VACUUM INTO '{}'", part_str),
        ))
        .await
        .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
        if let Err(e) = remove_google_login(&db_part).await {
            let _ = std::fs::remove_file(&db_part);
            return Err(format!("Remove Google login from snapshot: {}", e));
        }
        std::fs::rename(&db_part, &db_target).map_err(|e| format!("Replace snapshot: {}", e))?;

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

/// Recursive copy that copies a file when the destination is missing, has
/// another size (a copy cut off mid-way), or is older than the source. Each
/// copy goes to `<name>.part` first and is renamed when complete, so an
/// interrupted copy never sits under the real name. Never deletes from the
/// destination, apart from its own leftover `.part` files.
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
            let mut part_name = entry.file_name();
            part_name.push(".part");
            let part_path = dest.join(part_name);
            if part_path.is_file() {
                std::fs::remove_file(&part_path)?;
            }
            if needs_copy(&metadata, &dest_path) {
                std::fs::copy(&src_path, &part_path)?;
                std::fs::rename(&part_path, &dest_path)?;
            }
        }
    }
    Ok(())
}

fn needs_copy(src: &std::fs::Metadata, dest_path: &Path) -> bool {
    let Ok(dest) = std::fs::metadata(dest_path) else { return true };
    if dest.len() != src.len() {
        return true;
    }
    match (src.modified(), dest.modified()) {
        (Ok(s), Ok(d)) => s > d,
        _ => true,
    }
}

/// Backups go to USB sticks and cloud folders, so the Google login is
/// removed from the copy. `needs_reauth` makes a restored copy show
/// Reconnect in Settings. `secure_delete` overwrites the old bytes.
async fn remove_google_login(snapshot: &Path) -> Result<(), String> {
    use sqlx::{ConnectOptions, Connection};
    let mut conn = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(snapshot)
        .disable_statement_logging()
        .connect()
        .await
        .map_err(|e| e.to_string())?;
    let result = async {
        sqlx::query("PRAGMA secure_delete = ON").execute(&mut conn).await?;
        let has_table: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'google_calendar_settings'",
        )
        .fetch_one(&mut conn)
        .await?;
        if has_table > 0 {
            sqlx::query(
                "UPDATE google_calendar_settings SET access_token = NULL, refresh_token = NULL, \
                 token_expires_at = NULL, needs_reauth = 1",
            )
            .execute(&mut conn)
            .await?;
        }
        Ok::<_, sqlx::Error>(())
    }
    .await;
    let closed = conn.close().await;
    result.map_err(|e| e.to_string())?;
    closed.map_err(|e| e.to_string())
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

/// How many pre-migration copies stay next to the database.
pub const PRE_MIGRATION_COPIES_KEPT: usize = 3;
const PRE_MIGRATION_MARKER: &str = "_pre-migration-";

/// Copies the database next to itself before pending migrations run, as
/// `<name>_pre-migration-<local time>.db`, and keeps the newest
/// [`PRE_MIGRATION_COPIES_KEPT`]. A new install (no migration run yet) and an
/// up-to-date database get no copy. Returns the copy's path when one was made.
pub async fn backup_before_migrations<Tz: TimeZone>(
    pool: &sqlx::SqlitePool,
    db_path: &Path,
    now: DateTime<Tz>,
) -> Result<Option<PathBuf>, String>
where
    Tz::Offset: std::fmt::Display,
{
    let pending = crate::database::migrations::pending_migrations(pool)
        .await
        .map_err(|e| format!("Check pending migrations: {}", e))?;
    if pending.is_empty() || pending.len() == crate::database::migrations::migration_count() {
        return Ok(None);
    }

    let dir = db_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = db_path.file_stem().and_then(|s| s.to_str()).unwrap_or("vet_clinic");
    let copy = dir.join(format!("{stem}{PRE_MIGRATION_MARKER}{}.db", now.format("%Y-%m-%d_%H-%M-%S")));
    if copy.exists() {
        std::fs::remove_file(&copy).map_err(|e| format!("Remove old copy: {}", e))?;
    }
    let target = copy.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{}'", target))
        .execute(pool)
        .await
        .map_err(|e| format!("Copy database before migrations: {}", e))?;

    prune_pre_migration_copies(dir, stem);
    Ok(Some(copy))
}

fn prune_pre_migration_copies(dir: &Path, stem: &str) {
    let prefix = format!("{stem}{PRE_MIGRATION_MARKER}");
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut names: Vec<String> = entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with(&prefix) && n.ends_with(".db"))
        .collect();
    // The name carries the time, so name order is age order.
    names.sort();
    let excess = names.len().saturating_sub(PRE_MIGRATION_COPIES_KEPT);
    for name in names.into_iter().take(excess) {
        let _ = std::fs::remove_file(dir.join(name));
    }
}
