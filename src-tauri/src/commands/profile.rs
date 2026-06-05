//! Profile resolution commands.
//! 契約: docs/contracts/tauri-commands.md (`profile.fetch_remote`)
//!
//! 本フェーズでは mock resolver で固定マッピングを返す。Phase 2 で
//! Supabase 連携に置き換えるとき、ここを Rust 側で Supabase REST 叩く
//! 実装か、TS 側で supabase-js を叩く実装に切り替える。

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::ble::profile_resolver::{resolve, MockProfile};
use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MyProfile {
    pub user_id: String,
    pub display_name: String,
    pub avatar_code: String,
    pub message: String,
    pub home_prefecture: Option<String>,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn profile_get(app: AppHandle) -> Result<Option<MyProfile>, String> {
    let pool = db::pool(&app).await?;
    let profile = sqlx::query_as::<_, (String, String, String, String, Option<String>, i64)>(
        "SELECT user_id, display_name, avatar_code, message, home_prefecture, updated_at FROM my_profile LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("failed to fetch profile: {e}"))?
    .map(
        |(user_id, display_name, avatar_code, message, home_prefecture, updated_at)| MyProfile {
            user_id,
            display_name,
            avatar_code,
            message,
            home_prefecture,
            updated_at,
        },
    );

    Ok(profile)
}

#[tauri::command]
pub async fn profile_save(
    app: AppHandle,
    display_name: String,
    avatar_code: String,
    message: Option<String>,
    home_prefecture: Option<String>,
) -> Result<MyProfile, String> {
    validate_profile(
        &display_name,
        &avatar_code,
        message.as_deref(),
        home_prefecture.as_deref(),
    )?;

    let pool = db::pool(&app).await?;
    let existing = sqlx::query_as::<_, (String,)>("SELECT user_id FROM my_profile LIMIT 1")
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("failed to fetch existing profile: {e}"))?;
    let user_id = existing
        .map(|(id,)| id)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = unix_now();
    let message = message.unwrap_or_default();

    sqlx::query(
        r#"INSERT INTO my_profile
             (user_id, display_name, avatar_code, message, home_prefecture, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             display_name    = excluded.display_name,
             avatar_code     = excluded.avatar_code,
             message         = excluded.message,
             home_prefecture = excluded.home_prefecture,
             updated_at      = excluded.updated_at"#,
    )
    .bind(&user_id)
    .bind(&display_name)
    .bind(&avatar_code)
    .bind(&message)
    .bind(&home_prefecture)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| format!("failed to save profile: {e}"))?;

    Ok(MyProfile {
        user_id,
        display_name,
        avatar_code,
        message,
        home_prefecture,
        updated_at: now,
    })
}

#[tauri::command]
pub fn profile_fetch_remote(user_id: String) -> Result<Option<MockProfile>, String> {
    let uuid = match Uuid::parse_str(&user_id) {
        Ok(u) => u,
        Err(e) => return Err(format!("invalid user_id: {e}")),
    };
    // mock では「常に取得できる」想定。Supabase 連携時は 404 のとき None を返す。
    Ok(Some(resolve(uuid)))
}

fn validate_profile(
    display_name: &str,
    avatar_code: &str,
    message: Option<&str>,
    home_prefecture: Option<&str>,
) -> Result<(), String> {
    if display_name.trim().is_empty() {
        return Err("display_name is required".to_string());
    }
    if display_name.chars().count() > 16 {
        return Err("display_name must be 16 characters or less".to_string());
    }
    if avatar_code.trim().is_empty() {
        return Err("avatar_code is required".to_string());
    }
    if avatar_code.chars().count() > 64 {
        return Err("avatar_code must be 64 characters or less".to_string());
    }
    if message.unwrap_or_default().chars().count() > 30 {
        return Err("message must be 30 characters or less".to_string());
    }
    if let Some(pref) = home_prefecture {
        let valid = pref.len() == 2
            && pref.chars().all(|c| c.is_ascii_digit())
            && matches!(pref.parse::<u8>(), Ok(1..=47));
        if !valid {
            return Err("home_prefecture must be a JP prefecture code from 01 to 47".to_string());
        }
    }
    Ok(())
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}
