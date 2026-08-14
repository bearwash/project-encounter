//! Tauri commands for encounter history.
//! 契約: docs/contracts/tauri-commands.md (encounter.*)

use serde::Serialize;
use sqlx::{Sqlite, Transaction};
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
    let user_id = Uuid::parse_str(user_id.trim())
        .map_err(|_| "invalid encountered user_id".to_string())?
        .to_string();
    let now = encountered_at.unwrap_or_else(db::unix_now);
    if now <= 0 {
        return Err("encountered_at must be a unix timestamp".to_string());
    }

    let pool = db::pool(app).await?;
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
             u.encounter_count,
             u.first_seen_at,
             u.last_seen_at
           FROM encounter_logs l
           JOIN users_cache u ON u.user_id = l.encountered_user_id
           WHERE l.is_read = 0
             AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = u.user_id)
           ORDER BY l.encountered_at ASC"#,
    )
    .fetch_all(&pool)
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
             user_id,
             display_name,
             avatar_code,
             message,
             home_prefecture,
             encounter_count,
             first_seen_at,
             last_seen_at,
             last_seen_at AS last_encountered_at
           FROM users_cache
           WHERE NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = users_cache.user_id)
           ORDER BY last_seen_at DESC"#,
    )
    .fetch_all(&pool)
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
