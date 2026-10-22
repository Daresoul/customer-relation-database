//! Frees the disk space of deleted attachments.
//!
//! A deleted attachment (`deleted_at` set) keeps its file for
//! `PURGE_AFTER_DAYS`, so a mistaken delete can still be undone in the DB.
//! After that the file is removed and the row gets `purged_at`; the row
//! itself stays for the record's history. This covers both ways an attachment
//! gets deleted: a document the app replaced when it regenerated it
//! (`simple_report`, `pharmacy_note`, `invoice`, `generated_pdf`) and a file
//! the user removed with the record page's Delete button (`file`,
//! `test_result`).

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};

pub const PURGE_AFTER_DAYS: i64 = 30;
const RUN_INTERVAL_HOURS: i64 = 24;
/// How often the running app checks whether a purge is due. Wall-clock based,
/// so a machine that sleeps at night still purges once a day.
const CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60 * 60);

/// What one purge run did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PurgeReport {
    /// Files removed from disk.
    pub purged: usize,
    pub bytes_freed: u64,
    /// Rows marked purged whose file was already gone.
    pub missing: usize,
    /// Rows left alone: unreadable `deleted_at`, a file id that is not a
    /// plain file name in the storage folder, or a file that could not be removed.
    pub skipped: usize,
}

/// Remove the files of attachments deleted more than `PURGE_AFTER_DAYS`
/// before `now`. Only touches plain files directly inside `storage_dir`.
pub async fn purge_deleted_attachments(
    db: &DatabaseConnection,
    storage_dir: &Path,
    now: DateTime<Utc>,
) -> Result<PurgeReport, String> {
    // A missing folder would make every file look "already gone".
    if !storage_dir.is_dir() {
        return Err(format!("Attachment folder not found: {}", storage_dir.display()));
    }

    // A file still listed in the device file history is shared with it.
    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT a.id, a.file_id, a.deleted_at FROM medical_attachments a \
             WHERE a.deleted_at IS NOT NULL AND a.purged_at IS NULL \
             AND NOT EXISTS (SELECT 1 FROM file_access_history h WHERE h.file_id = a.file_id)",
        ))
        .await
        .map_err(|e| format!("Failed to list deleted attachments: {}", e))?;

    let cutoff = now - Duration::days(PURGE_AFTER_DAYS);
    let mut report = PurgeReport::default();

    for row in rows {
        let id: i64 = row.try_get("", "id").map_err(|e| e.to_string())?;
        let file_id: String = row.try_get("", "file_id").unwrap_or_default();
        let deleted_at: Option<String> = row.try_get::<Option<String>>("", "deleted_at").ok().flatten();

        let Some(deleted_at) = deleted_at.as_deref().and_then(parse_time) else {
            log::warn!("Attachment purge: skipping {} (unreadable deleted_at {:?})", id, deleted_at);
            report.skipped += 1;
            continue;
        };
        if deleted_at > cutoff {
            continue;
        }

        let Some(path) = file_in(storage_dir, &file_id) else {
            log::warn!("Attachment purge: skipping {} (file id {:?} is not a plain file name)", id, file_id);
            report.skipped += 1;
            continue;
        };

        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_file() => match std::fs::remove_file(&path) {
                Ok(()) => {
                    report.purged += 1;
                    report.bytes_freed += meta.len();
                }
                Err(e) => {
                    log::warn!("Attachment purge: could not remove {}: {}", path.display(), e);
                    report.skipped += 1;
                    continue;
                }
            },
            Ok(_) => {
                log::warn!("Attachment purge: skipping {} ({} is not a regular file)", id, path.display());
                report.skipped += 1;
                continue;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => report.missing += 1,
            Err(e) => {
                log::warn!("Attachment purge: skipping {} ({}: {})", id, path.display(), e);
                report.skipped += 1;
                continue;
            }
        }

        if let Err(e) = db
            .execute(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE medical_attachments SET purged_at = ? WHERE id = ?",
                [now.to_rfc3339().into(), id.into()],
            ))
            .await
        {
            // The next run finds the file gone and marks it then.
            log::warn!("Attachment purge: could not mark {} purged: {}", id, e);
        }
    }

    Ok(report)
}

/// `storage_dir/file_id` when `file_id` is a single plain file name.
fn file_in(storage_dir: &Path, file_id: &str) -> Option<PathBuf> {
    let mut parts = Path::new(file_id).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(name)), None) => Some(storage_dir.join(name)),
        _ => None,
    }
}

/// RFC 3339 (what the app writes) or SQLite's `YYYY-MM-DD HH:MM:SS` in UTC.
fn parse_time(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(t) = DateTime::parse_from_rfc3339(s) {
        return Some(t.with_timezone(&Utc));
    }
    ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(s, f).ok())
        .map(|t| t.and_utc())
}

pub fn is_purge_due(last_run: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    match last_run {
        Some(last) => now.signed_duration_since(last) >= Duration::hours(RUN_INTERVAL_HOURS),
        None => true,
    }
}

/// Purge at start, then once a day while the app keeps running.
pub async fn run_purge_schedule(storage_dir: PathBuf, db: Arc<DatabaseConnection>) {
    let mut last_run = None;
    loop {
        let now = Utc::now();
        if is_purge_due(last_run, now) {
            match purge_deleted_attachments(&db, &storage_dir, now).await {
                Ok(r) => log::info!(
                    "Attachment purge: {} files removed, {} bytes freed, {} already missing, {} skipped",
                    r.purged, r.bytes_freed, r.missing, r.skipped
                ),
                Err(e) => log::error!("Attachment purge failed: {}", e),
            }
            last_run = Some(now);
        }
        tokio::time::sleep(CHECK_INTERVAL).await;
    }
}
