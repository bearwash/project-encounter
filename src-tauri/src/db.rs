use sqlx::{sqlite::SqlitePoolOptions, Executor, SqlitePool};
use tauri::{AppHandle, Manager};

pub const DB_FILE: &str = "project_encounter.db";
const DB_MAX_CONNECTIONS: u32 = 1;

const CURRENT_SCHEMA_SQL: &str = include_str!("../../docs/contracts/db-schema.sql");

pub async fn pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("failed to create app data dir: {e}"))?;

    let db_path = app_data_dir.join(DB_FILE);
    let url = format!(
        "sqlite:{}",
        db_path
            .to_str()
            .ok_or_else(|| "database path is not valid utf-8".to_string())?
    );

    let pool = SqlitePoolOptions::new()
        .max_connections(DB_MAX_CONNECTIONS)
        .connect(&url)
        .await
        .map_err(|e| format!("failed to open sqlite db: {e}"))?;

    ensure_schema(&pool).await?;
    Ok(pool)
}

async fn ensure_schema(pool: &SqlitePool) -> Result<(), String> {
    // The contract schema is idempotent and creates a fresh database in its
    // current shape. The ALTER checks below cover older databases.
    sqlx::raw_sql(CURRENT_SCHEMA_SQL)
        .execute(pool)
        .await
        .map_err(|e| format!("failed to ensure initial schema: {e}"))?;

    ensure_column(pool, "my_profile", "home_prefecture", "TEXT").await?;
    ensure_column(pool, "users_cache", "home_prefecture", "TEXT").await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS profile_sync_queue (
            queue_id         INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name     TEXT    NOT NULL,
            avatar_code      TEXT    NOT NULL,
            message          TEXT    NOT NULL DEFAULT '',
            home_prefecture  TEXT,
            enqueued_at      INTEGER NOT NULL
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| format!("failed to ensure profile_sync_queue: {e}"))?;
    ensure_column(pool, "profile_sync_queue", "home_prefecture", "TEXT").await?;

    sqlx::query("UPDATE app_settings SET value = '3' WHERE key = 'schema_version'")
        .execute(pool)
        .await
        .map_err(|e| format!("failed to update schema_version: {e}"))?;

    Ok(())
}

async fn ensure_column(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let pragma = format!("PRAGMA table_info({table})");
    let rows: Vec<(i64, String, String, i64, Option<String>, i64)> = sqlx::query_as(&pragma)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("failed to inspect {table}: {e}"))?;

    if rows.iter().any(|(_, name, _, _, _, _)| name == column) {
        return Ok(());
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    pool.execute(sql.as_str())
        .await
        .map_err(|e| format!("failed to add {table}.{column}: {e}"))?;
    Ok(())
}
