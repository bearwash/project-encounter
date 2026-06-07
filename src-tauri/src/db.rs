use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Executor, SqlitePool};
use tauri::{AppHandle, Manager};

pub const DB_FILE: &str = "project_encounter.db";
// 単一接続で全コマンドを直列化する。これにより encounter 記録の
// read-modify-write (クールダウン判定) が他コマンドと競合せず、8 時間
// クールダウン仕様の TOCTOU を防ぐ。WAL + busy_timeout は保険。
const DB_MAX_CONNECTIONS: u32 = 1;
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

const CURRENT_SCHEMA_SQL: &str = include_str!("../../docs/contracts/db-schema.sql");

/// 起動時 (setup) に一度だけ呼び、共有プールを生成してスキーマを適用する。
///
/// パスは tauri-plugin-sql と同じ `app_config_dir/<DB_FILE>` を使う
/// (plugin-sql v2 は sqlite: 相対パスを app_config_dir 基準で解決する)。
/// これにより TS (plugin-sql 経由) と Rust (sqlx) が同一 DB ファイルを共有する。
/// 旧実装は app_data_dir を使っており、macOS では一致するが iOS/Android/Linux
/// では別ファイルに分岐していた。
pub async fn init_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config dir: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create app config dir: {e}"))?;
    let db_path = dir.join(DB_FILE);

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(BUSY_TIMEOUT);

    let pool = SqlitePoolOptions::new()
        .max_connections(DB_MAX_CONNECTIONS)
        .connect_with(options)
        .await
        .map_err(|e| format!("failed to open sqlite db: {e}"))?;

    ensure_schema(&pool).await?;
    Ok(pool)
}

/// `init_pool` で生成し `manage` 済みの共有プールを取得する。
/// 旧実装はコマンド毎に新規プールを開き毎回 ensure_schema を走らせていたため、
/// 複数プールによるロック競合・無駄なスキーマ検証が起きていた。
pub async fn pool(app: &AppHandle) -> Result<SqlitePool, String> {
    app.try_state::<SqlitePool>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "db pool is not initialized".to_string())
}

/// Unix epoch 秒。複数モジュールで使うためここに集約。
pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
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
