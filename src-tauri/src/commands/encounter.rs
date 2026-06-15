//! Tauri commands for encounter history.
//! 契約: docs/contracts/tauri-commands.md (encounter.*)

use serde::Serialize;
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::AppHandle;
use uuid::Uuid;

use crate::commands::settings::DEFAULT_COOLDOWN_SEC;
use crate::db;

#[derive(Debug, Clone, Serialize)]
pub struct EncounterUser {
    pub user_id: String,
    pub display_name: String,
    pub avatar_code: String,
    pub message: String,
    pub home_prefecture: Option<String>,
    pub encounter_count: i64,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UnreadEncounter {
    pub log_id: i64,
    pub user: EncounterUser,
    pub encountered_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryItem {
    pub user_id: String,
    pub display_name: String,
    pub avatar_code: String,
    pub message: String,
    pub home_prefecture: Option<String>,
    pub encounter_count: i64,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
    pub last_encountered_at: i64,
}

pub async fn record_received_user_id_internal(
    app: &AppHandle,
    user_id: String,
    encountered_at: Option<i64>,
) -> Result<bool, String> {
    let pool = db::pool(app).await?;
    record_received_user_id_with_pool(&pool, user_id, encountered_at).await
}

async fn record_received_user_id_with_pool(
    pool: &SqlitePool,
    user_id: String,
    encountered_at: Option<i64>,
) -> Result<bool, String> {
    let user_id = Uuid::parse_str(user_id.trim())
        .map_err(|_| "invalid encountered user_id".to_string())?
        .to_string();
    let now = encountered_at.unwrap_or_else(db::unix_now);
    if now <= 0 {
        return Err("encountered_at must be a unix timestamp".to_string());
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("failed to start encounter transaction: {e}"))?;

    let my_user_id = sqlx::query_as::<_, (String,)>("SELECT user_id FROM my_profile LIMIT 1")
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| format!("failed to read my profile user_id: {e}"))?
        .map(|(id,)| id);
    if my_user_id.as_deref() == Some(user_id.as_str()) {
        log::info!("[encounter] skipped self user_id={}", tail(&user_id));
        return finish_without_insert(tx).await;
    }

    let cooldown_sec =
        sqlx::query_as::<_, (String,)>("SELECT value FROM app_settings WHERE key = 'cooldown_sec'")
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| format!("failed to read cooldown_sec: {e}"))?
            .and_then(|(value,)| value.parse::<i64>().ok())
            .filter(|sec| *sec >= 0)
            .unwrap_or(DEFAULT_COOLDOWN_SEC);

    let exact_duplicate = sqlx::query_as::<_, (i64,)>(
        r#"SELECT log_id FROM encounter_logs
           WHERE encountered_user_id = ? AND encountered_at = ?
           LIMIT 1"#,
    )
    .bind(&user_id)
    .bind(now)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("failed to check duplicate encounter: {e}"))?
    .is_some();
    if exact_duplicate {
        log::info!(
            "[encounter] skipped exact duplicate user_id={} at={}",
            tail(&user_id),
            now
        );
        return finish_without_insert(tx).await;
    }

    let recent = sqlx::query_as::<_, (i64,)>(
        r#"SELECT encountered_at FROM encounter_logs
           WHERE encountered_user_id = ?
           ORDER BY encountered_at DESC LIMIT 1"#,
    )
    .bind(&user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("failed to read recent encounter: {e}"))?
    .map(|(encountered_at,)| encountered_at);
    if recent.is_some_and(|last| now - last < cooldown_sec) {
        log::info!(
            "[encounter] skipped cooldown user_id={} at={} cooldown_sec={}",
            tail(&user_id),
            now,
            cooldown_sec
        );
        return finish_without_insert(tx).await;
    }

    sqlx::query(
        r#"INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
           VALUES (?, ?, 0)"#,
    )
    .bind(&user_id)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("failed to insert encounter log: {e}"))?;

    tx.commit()
        .await
        .map_err(|e| format!("failed to commit encounter transaction: {e}"))?;
    log::info!("[encounter] inserted user_id={} at={}", tail(&user_id), now);
    Ok(true)
}

#[tauri::command]
pub async fn encounter_record_received_user_id(
    app: AppHandle,
    user_id: String,
    encountered_at: Option<i64>,
) -> Result<bool, String> {
    record_received_user_id_internal(&app, user_id, encountered_at).await
}

#[tauri::command]
pub async fn encounter_list_unread(app: AppHandle) -> Result<Vec<UnreadEncounter>, String> {
    let pool = db::pool(&app).await?;
    list_unread_with_pool(&pool).await
}

async fn list_unread_with_pool(pool: &SqlitePool) -> Result<Vec<UnreadEncounter>, String> {
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            String,
            String,
            Option<String>,
            i64,
            i64,
            i64,
        ),
    >(
        r#"SELECT
             l.log_id,
             l.encountered_at,
             u.user_id,
             u.display_name,
             u.avatar_code,
             u.message,
             u.home_prefecture,
             a.encounter_count,
             a.first_seen_at,
             a.last_seen_at
           FROM encounter_logs l
           JOIN users_cache u ON u.user_id = l.encountered_user_id
           JOIN (
             SELECT
               encountered_user_id AS user_id,
               COUNT(*) AS encounter_count,
               MIN(encountered_at) AS first_seen_at,
               MAX(encountered_at) AS last_seen_at
             FROM encounter_logs
             GROUP BY encountered_user_id
           ) a ON a.user_id = u.user_id
           WHERE l.is_read = 0
           ORDER BY l.encountered_at ASC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("failed to list unread encounters: {e}"))?;

    Ok(rows
        .into_iter()
        .map(
            |(
                log_id,
                encountered_at,
                user_id,
                display_name,
                avatar_code,
                message,
                home_prefecture,
                encounter_count,
                first_seen_at,
                last_seen_at,
            )| UnreadEncounter {
                log_id,
                encountered_at,
                user: EncounterUser {
                    user_id,
                    display_name,
                    avatar_code,
                    message,
                    home_prefecture,
                    encounter_count,
                    first_seen_at,
                    last_seen_at,
                },
            },
        )
        .collect())
}

async fn finish_without_insert(tx: Transaction<'_, Sqlite>) -> Result<bool, String> {
    // 読み取りのみで挿入しないので commit は不要。drop で rollback して接続を解放する。
    drop(tx);
    Ok(false)
}

fn tail(value: &str) -> &str {
    value.get(value.len().saturating_sub(8)..).unwrap_or(value)
}

#[tauri::command]
pub async fn encounter_mark_read(app: AppHandle, log_id: i64) -> Result<(), String> {
    let pool = db::pool(&app).await?;
    sqlx::query("UPDATE encounter_logs SET is_read = 1 WHERE log_id = ?")
        .bind(log_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("failed to mark encounter read: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn encounter_list_history(app: AppHandle) -> Result<Vec<HistoryItem>, String> {
    let pool = db::pool(&app).await?;
    list_history_with_pool(&pool).await
}

async fn list_history_with_pool(pool: &SqlitePool) -> Result<Vec<HistoryItem>, String> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            String,
            Option<String>,
            i64,
            i64,
            i64,
            i64,
        ),
    >(
        r#"SELECT
             u.user_id,
             u.display_name,
             u.avatar_code,
             u.message,
             u.home_prefecture,
             COALESCE(a.encounter_count, u.encounter_count) AS encounter_count,
             COALESCE(a.first_seen_at, u.first_seen_at) AS first_seen_at,
             COALESCE(a.last_seen_at, u.last_seen_at) AS last_seen_at,
             COALESCE(a.last_seen_at, u.last_seen_at) AS last_encountered_at
           FROM users_cache u
           LEFT JOIN (
             SELECT
               encountered_user_id AS user_id,
               COUNT(*) AS encounter_count,
               MIN(encountered_at) AS first_seen_at,
               MAX(encountered_at) AS last_seen_at
             FROM encounter_logs
             GROUP BY encountered_user_id
           ) a ON a.user_id = u.user_id
           ORDER BY COALESCE(a.last_seen_at, u.last_seen_at) DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("failed to list encounter history: {e}"))?;

    Ok(rows
        .into_iter()
        .map(
            |(
                user_id,
                display_name,
                avatar_code,
                message,
                home_prefecture,
                encounter_count,
                first_seen_at,
                last_seen_at,
                last_encountered_at,
            )| HistoryItem {
                user_id,
                display_name,
                avatar_code,
                message,
                home_prefecture,
                encounter_count,
                first_seen_at,
                last_seen_at,
                last_encountered_at,
            },
        )
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    const SCHEMA_SQL: &str = include_str!("../../../docs/contracts/db-schema.sql");

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite pool");
        sqlx::raw_sql(SCHEMA_SQL)
            .execute(&pool)
            .await
            .expect("schema");
        pool
    }

    async fn insert_my_profile(pool: &SqlitePool, user_id: &Uuid) {
        sqlx::query(
            r#"INSERT INTO my_profile
               (user_id, display_name, avatar_code, message, home_prefecture, updated_at)
               VALUES (?, 'me', 'b04_h05_o04_f01', '', NULL, 1)"#,
        )
        .bind(user_id.to_string())
        .execute(pool)
        .await
        .expect("insert my_profile");
    }

    async fn count_logs(pool: &SqlitePool) -> i64 {
        sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM encounter_logs")
            .fetch_one(pool)
            .await
            .expect("count logs")
            .0
    }

    #[test]
    fn record_received_user_id_validates_self_duplicate_and_cooldown() {
        tauri::async_runtime::block_on(async {
            let pool = setup_pool().await;
            let my_id = Uuid::new_v4();
            let peer_id = Uuid::new_v4();
            insert_my_profile(&pool, &my_id).await;

            let invalid =
                record_received_user_id_with_pool(&pool, "not-a-uuid".to_string(), Some(1000))
                    .await
                    .expect_err("invalid uuid should fail");
            assert!(invalid.contains("invalid encountered user_id"));

            let self_inserted =
                record_received_user_id_with_pool(&pool, my_id.to_string(), Some(1000))
                    .await
                    .expect("self id handled");
            assert!(!self_inserted);
            assert_eq!(count_logs(&pool).await, 0);

            sqlx::query(
                r#"INSERT INTO app_settings (key, value)
                   VALUES ('cooldown_sec', '60')
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
            )
            .execute(&pool)
            .await
            .expect("set cooldown");

            assert!(
                record_received_user_id_with_pool(&pool, peer_id.to_string(), Some(1000))
                    .await
                    .expect("first insert")
            );
            assert!(
                !record_received_user_id_with_pool(&pool, peer_id.to_string(), Some(1000))
                    .await
                    .expect("exact duplicate")
            );
            assert!(
                !record_received_user_id_with_pool(&pool, peer_id.to_string(), Some(1059))
                    .await
                    .expect("cooldown duplicate")
            );
            assert!(
                record_received_user_id_with_pool(&pool, peer_id.to_string(), Some(1060))
                    .await
                    .expect("after cooldown")
            );
            assert_eq!(count_logs(&pool).await, 2);
        });
    }

    #[test]
    fn unread_and_history_use_latest_encounter_log_aggregates() {
        tauri::async_runtime::block_on(async {
            let pool = setup_pool().await;
            let peer_id = Uuid::new_v4().to_string();
            sqlx::query(
                r#"INSERT INTO users_cache
                   (user_id, display_name, avatar_code, message, home_prefecture,
                    encounter_count, first_seen_at, last_seen_at)
                   VALUES (?, 'peer', 'b01_h01_o01_f01', 'hello', NULL, 1, 1000, 1000)"#,
            )
            .bind(&peer_id)
            .execute(&pool)
            .await
            .expect("insert users_cache");
            sqlx::query(
                r#"INSERT INTO encounter_logs
                   (encountered_user_id, encountered_at, is_read)
                   VALUES (?, 1000, 1), (?, 2000, 0)"#,
            )
            .bind(&peer_id)
            .bind(&peer_id)
            .execute(&pool)
            .await
            .expect("insert encounter logs");

            let unread = list_unread_with_pool(&pool).await.expect("list unread");
            assert_eq!(unread.len(), 1);
            assert_eq!(unread[0].encountered_at, 2000);
            assert_eq!(unread[0].user.encounter_count, 2);
            assert_eq!(unread[0].user.first_seen_at, 1000);
            assert_eq!(unread[0].user.last_seen_at, 2000);

            let history = list_history_with_pool(&pool).await.expect("list history");
            assert_eq!(history.len(), 1);
            assert_eq!(history[0].encounter_count, 2);
            assert_eq!(history[0].first_seen_at, 1000);
            assert_eq!(history[0].last_seen_at, 2000);
            assert_eq!(history[0].last_encountered_at, 2000);
        });
    }
}
