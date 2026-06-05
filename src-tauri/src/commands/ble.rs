//! Tauri commands for BLE control.
//! 契約: docs/contracts/tauri-commands.md (ble.*)

use tauri::{AppHandle, State};

use crate::ble::{BleMode, BleService, BleStatus};
use crate::db;

#[tauri::command]
pub async fn ble_start(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    let user_id = read_my_user_id(&app).await?;
    service.start(app, BleMode::Normal, user_id)
}

async fn read_my_user_id(app: &AppHandle) -> Result<Option<String>, String> {
    let pool = db::pool(app).await?;
    let row = sqlx::query_as::<_, (String,)>("SELECT user_id FROM my_profile LIMIT 1")
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("failed to read my profile user_id: {e}"))?;
    Ok(row.map(|(user_id,)| user_id))
}

#[tauri::command]
pub fn ble_stop(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    service.stop(app);
    Ok(())
}

#[tauri::command]
pub async fn ble_walk_mode_start(
    app: AppHandle,
    service: State<'_, BleService>,
) -> Result<(), String> {
    let user_id = read_my_user_id(&app).await?;
    service.start(app, BleMode::Walk, user_id)
}

#[tauri::command]
pub fn ble_walk_mode_stop(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    service.stop(app);
    Ok(())
}

#[tauri::command]
pub fn ble_status(app: AppHandle, service: State<'_, BleService>) -> BleStatus {
    service.status(app)
}
