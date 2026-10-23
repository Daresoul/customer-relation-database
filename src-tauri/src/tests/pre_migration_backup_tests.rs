//! A copy of the database is taken before pending migrations run, so a
//! migration that fails or damages data leaves a way back (lifecycle.md #2,
//! ranked fix 3).

use crate::database::migrations::{pending_migrations, run_migrations};
use crate::services::backup::{backup_before_migrations, PRE_MIGRATION_COPIES_KEPT};
use chrono::{FixedOffset, TimeZone};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::path::{Path, PathBuf};

async fn file_pool(path: &Path) -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true);
    SqlitePoolOptions::new().max_connections(2).connect_with(options).await.unwrap()
}

fn now() -> chrono::DateTime<FixedOffset> {
    FixedOffset::east_opt(2 * 3600).unwrap().with_ymd_and_hms(2026, 10, 23, 9, 5, 7).unwrap()
}

fn copies(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n.contains("_pre-migration-"))
        .collect();
    names.sort();
    names
}

struct Fixture {
    dir: tempfile::TempDir,
    db_path: PathBuf,
    pool: SqlitePool,
}

async fn migrated() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("vet_clinic.db");
    let pool = file_pool(&db_path).await;
    run_migrations(&pool).await.unwrap();
    Fixture { dir, db_path, pool }
}

async fn forget_last_migration(pool: &SqlitePool) -> String {
    let last: String = sqlx::query("SELECT filename FROM migrations ORDER BY id DESC LIMIT 1")
        .fetch_one(pool)
        .await
        .unwrap()
        .get(0);
    sqlx::query("DELETE FROM migrations WHERE filename = ?").bind(&last).execute(pool).await.unwrap();
    last
}

#[tokio::test]
async fn an_up_to_date_database_has_nothing_pending_and_gets_no_copy() {
    let fx = migrated().await;

    assert!(pending_migrations(&fx.pool).await.unwrap().is_empty());
    assert_eq!(backup_before_migrations(&fx.pool, &fx.db_path, now()).await.unwrap(), None);
    assert!(copies(fx.dir.path()).is_empty());
}

#[tokio::test]
async fn a_new_install_gets_no_copy() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("vet_clinic.db");
    let pool = file_pool(&db_path).await;

    assert!(!pending_migrations(&pool).await.unwrap().is_empty());
    assert_eq!(backup_before_migrations(&pool, &db_path, now()).await.unwrap(), None);
    assert!(copies(dir.path()).is_empty());
}

#[tokio::test]
async fn a_pending_migration_gets_a_copy_of_the_database_first() {
    let fx = migrated().await;
    sqlx::query("INSERT INTO rooms (name) VALUES ('Exam 1')").execute(&fx.pool).await.unwrap();
    let last = forget_last_migration(&fx.pool).await;

    assert_eq!(pending_migrations(&fx.pool).await.unwrap(), vec![last.as_str()]);
    let copy = backup_before_migrations(&fx.pool, &fx.db_path, now())
        .await
        .unwrap()
        .expect("a copy is made");

    assert_eq!(copy, fx.dir.path().join("vet_clinic_pre-migration-2026-10-23_09-05-07.db"));
    let copy_pool = file_pool(&copy).await;
    let rooms: i64 = sqlx::query("SELECT COUNT(*) FROM rooms WHERE name = 'Exam 1'")
        .fetch_one(&copy_pool)
        .await
        .unwrap()
        .get(0);
    assert_eq!(rooms, 1, "the copy holds the data from before the migration");
}

#[tokio::test]
async fn only_the_newest_copies_are_kept() {
    let fx = migrated().await;
    for day in 1..=4 {
        std::fs::write(
            fx.dir.path().join(format!("vet_clinic_pre-migration-2026-10-0{day}_10-00-00.db")),
            "old",
        )
        .unwrap();
    }
    forget_last_migration(&fx.pool).await;

    backup_before_migrations(&fx.pool, &fx.db_path, now()).await.unwrap();

    let kept = copies(fx.dir.path());
    assert_eq!(kept.len(), PRE_MIGRATION_COPIES_KEPT, "{kept:?}");
    assert_eq!(kept.last().unwrap(), "vet_clinic_pre-migration-2026-10-23_09-05-07.db");
    assert!(!kept.iter().any(|n| n.contains("2026-10-01")), "oldest pruned: {kept:?}");
    assert!(fx.db_path.exists(), "the live database is never pruned");
}
