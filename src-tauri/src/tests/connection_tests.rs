//! Every pooled connection is set up the same way: foreign keys on, a busy
//! wait, WAL. The PRAGMAs used to run once, on whichever connection the
//! pool handed out, next to an 8 s connection lifetime (database.md,
//! correction on foreign keys).

use crate::database::create_pools;
use sqlx::Row;
use std::time::Duration;

#[tokio::test]
async fn every_pooled_connection_has_foreign_keys_a_busy_wait_and_wal() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}?mode=rwc", dir.path().join("vet_clinic.db").display());
    let (db, _legacy) = create_pools(&url).await.unwrap();
    let pool = db.get_sqlite_connection_pool();

    let mut first = pool.acquire().await.unwrap();
    let mut second = pool.acquire().await.unwrap();
    for conn in [&mut first, &mut second] {
        let fk: i64 = sqlx::query("PRAGMA foreign_keys").fetch_one(&mut **conn).await.unwrap().get(0);
        let busy: i64 = sqlx::query("PRAGMA busy_timeout").fetch_one(&mut **conn).await.unwrap().get(0);
        let journal: String = sqlx::query("PRAGMA journal_mode").fetch_one(&mut **conn).await.unwrap().get(0);
        assert_eq!(fk, 1, "foreign keys on");
        assert_eq!(busy, 10_000, "waits up to 10 s for a lock");
        assert_eq!(journal.to_lowercase(), "wal");
    }
}

#[tokio::test]
async fn pooled_connections_are_not_recycled_every_few_seconds() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}?mode=rwc", dir.path().join("vet_clinic.db").display());
    let (db, _legacy) = create_pools(&url).await.unwrap();
    let options = db.get_sqlite_connection_pool().options();

    assert!(options.get_max_lifetime().map_or(true, |l| l >= Duration::from_secs(30 * 60)));
    assert!(options.get_idle_timeout().map_or(true, |t| t >= Duration::from_secs(5 * 60)));
}
