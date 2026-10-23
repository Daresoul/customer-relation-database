use sea_orm::{Database, DatabaseConnection, ConnectOptions};
use sqlx::sqlite::SqliteJournalMode;
use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// SeaORM database connection
pub type SeaOrmPool = Arc<DatabaseConnection>;

/// Legacy pool type for transitional period - services will migrate to use SeaOrmPool directly
pub type DatabasePool = Arc<Mutex<SqlitePool>>;

/// Create both SeaORM connection and legacy SqlitePool
/// Returns (SeaOrmPool, DatabasePool) tuple for transitional period
pub async fn create_pools(database_url: &str) -> Result<(SeaOrmPool, DatabasePool), sea_orm::DbErr> {
    let mut opt = ConnectOptions::new(database_url);
    opt.max_connections(5)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(10 * 60))
        .max_lifetime(Duration::from_secs(30 * 60))
        .sqlx_logging(false)
        // Applied to every connection the pool opens, not just the first.
        // `rebuild_with_foreign_keys_off` turns foreign keys off on one
        // connection and back on before handing it back.
        .map_sqlx_sqlite_opts(|o| {
            o.foreign_keys(true)
                .busy_timeout(Duration::from_secs(10))
                .journal_mode(SqliteJournalMode::Wal)
        });

    let db = Database::connect(opt).await?;

    // Get the underlying sqlx pool for legacy services
    let sqlite_pool = db.get_sqlite_connection_pool().clone();

    Ok((Arc::new(db), Arc::new(Mutex::new(sqlite_pool))))
}

/// Create legacy pool only (for backward compatibility during migration)
pub async fn create_pool(database_url: &str) -> Result<DatabasePool, sea_orm::DbErr> {
    let (_, legacy_pool) = create_pools(database_url).await?;
    Ok(legacy_pool)
}

