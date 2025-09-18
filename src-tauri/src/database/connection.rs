use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::sync::Arc;
use tokio::sync::Mutex;

pub type DatabasePool = Arc<Mutex<SqlitePool>>;

pub async fn create_pool(database_url: &str) -> Result<DatabasePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    Ok(Arc::new(Mutex::new(pool)))
}

pub async fn test_connection(pool: &DatabasePool) -> Result<(), sqlx::Error> {
    let pool = pool.lock().await;
    sqlx::query("SELECT 1")
        .fetch_one(&*pool)
        .await?;
    Ok(())
}