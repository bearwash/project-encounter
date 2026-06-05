//! Tauri commands for app settings.
//! 契約: docs/contracts/tauri-commands.md (settings.*)

use tauri::AppHandle;

use crate::db;

const DEFAULT_COOLDOWN_SEC: i64 = 28_800;

#[tauri::command]
pub async fn settings_get_cooldown_sec(app: AppHandle) -> Result<i64, String> {
    let pool = db::pool(&app).await?;
    let row =
        sqlx::query_as::<_, (String,)>("SELECT value FROM app_settings WHERE key = 'cooldown_sec'")
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("failed to get cooldown_sec: {e}"))?;

    Ok(row
        .and_then(|(value,)| value.parse::<i64>().ok())
        .unwrap_or(DEFAULT_COOLDOWN_SEC))
}

#[tauri::command]
pub async fn settings_set_cooldown_sec(app: AppHandle, sec: i64) -> Result<(), String> {
    if sec < 0 {
        return Err("cooldown_sec must be >= 0".to_string());
    }

    let pool = db::pool(&app).await?;
    sqlx::query(
        r#"INSERT INTO app_settings (key, value)
           VALUES ('cooldown_sec', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
    )
    .bind(sec.to_string())
    .execute(&pool)
    .await
    .map_err(|e| format!("failed to set cooldown_sec: {e}"))?;
    Ok(())
}
