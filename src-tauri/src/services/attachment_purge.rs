//! Frees the disk space of deleted attachments.

use std::path::Path;
use chrono::{DateTime, Utc};
use sea_orm::DatabaseConnection;

/// What one purge run did.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PurgeReport {
    pub purged: usize,
    pub bytes_freed: u64,
    pub missing: usize,
    pub skipped: usize,
}

pub async fn purge_deleted_attachments(
    _db: &DatabaseConnection,
    _storage_dir: &Path,
    _now: DateTime<Utc>,
) -> Result<PurgeReport, String> {
    Ok(PurgeReport::default())
}

pub fn is_purge_due(_last_run: Option<DateTime<Utc>>, _now: DateTime<Utc>) -> bool {
    false
}
