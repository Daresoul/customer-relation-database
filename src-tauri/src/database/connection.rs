use sea_orm::{Database, DatabaseConnection, ConnectOptions, ConnectionTrait};
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
        .idle_timeout(Duration::from_secs(8))
        .max_lifetime(Duration::from_secs(8))
        .sqlx_logging(false);

    let db = Database::connect(opt).await?;

    // Enable foreign key constraints and WAL mode
    db.execute_unprepared("PRAGMA foreign_keys = ON").await?;
    db.execute_unprepared("PRAGMA journal_mode = WAL").await?;

    // Get the underlying sqlx pool for legacy services
    let sqlite_pool = db.get_sqlite_connection_pool().clone();

    Ok((Arc::new(db), Arc::new(Mutex::new(sqlite_pool))))
}

/// Create legacy pool only (for backward compatibility during migration)
pub async fn create_pool(database_url: &str) -> Result<DatabasePool, sea_orm::DbErr> {
    let (_, legacy_pool) = create_pools(database_url).await?;
    Ok(legacy_pool)
}

pub async fn test_connection(pool: &DatabasePool) -> Result<(), sqlx::Error> {
    let pool = pool.lock().await;
    sqlx::query("SELECT 1")
        .fetch_one(&*pool)
        .await?;
    Ok(())
}
