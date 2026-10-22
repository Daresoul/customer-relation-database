//! Table-rebuild migrations (`CREATE new → copy → DROP old → RENAME`) must not
//! cascade-delete child rows. See `migrations::rebuild_with_foreign_keys_off`.

use crate::database::migrations::rebuild_with_foreign_keys_off;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqliteConnection, SqlitePool};

/// One-connection pool with foreign keys on, like the app's pooled connections.
async fn pool(dir: &tempfile::TempDir) -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(dir.path().join("rebuild.db"))
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await.unwrap();
    for sql in [
        "CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
        "CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE)",
        "INSERT INTO parent (id, name) VALUES (1, 'a'), (2, 'b')",
        "INSERT INTO child (parent_id) VALUES (1), (1), (2)",
    ] {
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
    pool
}

async fn count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(pool).await.unwrap().get(0)
}

async fn foreign_keys_on(pool: &SqlitePool) -> bool {
    let on: i64 = sqlx::query("PRAGMA foreign_keys").fetch_one(pool).await.unwrap().get(0);
    on == 1
}

async fn rebuild_parent(conn: &mut SqliteConnection, copy_filter: &str) -> Result<(), sqlx::Error> {
    sqlx::query("CREATE TABLE parent_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL, note TEXT)")
        .execute(&mut *conn)
        .await?;
    sqlx::query(&format!("INSERT INTO parent_new (id, name) SELECT id, name FROM parent WHERE {copy_filter}"))
        .execute(&mut *conn)
        .await?;
    sqlx::query("DROP TABLE parent").execute(&mut *conn).await?;
    sqlx::query("ALTER TABLE parent_new RENAME TO parent").execute(&mut *conn).await?;
    Ok(())
}

#[tokio::test]
async fn plain_rebuild_with_foreign_keys_on_empties_child_tables() {
    // Why the helper exists: this is what migrations 027, 031 and 034 did.
    let dir = tempfile::tempdir().unwrap();
    let pool = pool(&dir).await;
    let mut conn = pool.acquire().await.unwrap();

    rebuild_parent(&mut conn, "1 = 1").await.unwrap();
    drop(conn);

    assert_eq!(count(&pool, "child").await, 0);
}

#[tokio::test]
async fn rebuild_with_helper_keeps_child_rows() {
    let dir = tempfile::tempdir().unwrap();
    let pool = pool(&dir).await;

    rebuild_with_foreign_keys_off(&pool, |conn| Box::pin(rebuild_parent(conn, "1 = 1")))
        .await
        .unwrap();

    assert_eq!(count(&pool, "parent").await, 2);
    assert_eq!(count(&pool, "child").await, 3);
    assert!(foreign_keys_on(&pool).await, "foreign keys are back on");
}

#[tokio::test]
async fn rebuild_that_orphans_rows_is_rolled_back() {
    let dir = tempfile::tempdir().unwrap();
    let pool = pool(&dir).await;

    let result = rebuild_with_foreign_keys_off(&pool, |conn| Box::pin(rebuild_parent(conn, "id = 1"))).await;

    assert!(result.is_err(), "child of parent 2 would be orphaned");
    assert_eq!(count(&pool, "parent").await, 2, "old table restored");
    assert_eq!(count(&pool, "child").await, 3);
    assert!(foreign_keys_on(&pool).await, "foreign keys are back on after a failure");
}

#[tokio::test]
async fn failed_rebuild_step_is_rolled_back() {
    let dir = tempfile::tempdir().unwrap();
    let pool = pool(&dir).await;

    let result = rebuild_with_foreign_keys_off(&pool, |conn| {
        Box::pin(async move {
            sqlx::query("DROP TABLE parent").execute(&mut *conn).await?;
            sqlx::query("SELECT * FROM no_such_table").execute(&mut *conn).await?;
            Ok(())
        })
    })
    .await;

    assert!(result.is_err());
    assert_eq!(count(&pool, "parent").await, 2);
    assert_eq!(count(&pool, "child").await, 3);
    assert!(foreign_keys_on(&pool).await);
}
