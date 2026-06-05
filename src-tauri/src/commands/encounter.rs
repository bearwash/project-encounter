//! Tauri commands for encounter history.
//! 契約: docs/contracts/tauri-commands.md (encounter.*)

use serde::Serialize;
use tauri::AppHandle;

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
