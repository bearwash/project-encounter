//! Tauri commands for BLE control.
//! 契約: docs/contracts/tauri-commands.md (ble.*)

use tauri::{async_runtime, AppHandle, Manager, State};

use crate::ble::{BleDebugSnapshot, BleMode, BleService, BleStatus};
use crate::commands::encounter;
use crate::db;

#[tauri::command]
pub async fn ble_start(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    let user_id = require_my_user_id(&app, &service).await?;
    service.debug_event("start-request", "mode=normal");
    spawn_ble_start(app, BleMode::Normal, user_id);
    Ok(())
}

async fn read_my_user_id(app: &AppHandle) -> Result<Option<String>, String> {
    let pool = db::pool(app).await?;
    let row = sqlx::query_as::<_, (String,)>("SELECT user_id FROM my_profile LIMIT 1")
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("failed to read my profile user_id: {e}"))?;
    Ok(row.map(|(user_id,)| user_id))
}

async fn require_my_user_id(app: &AppHandle, service: &BleService) -> Result<String, String> {
    read_my_user_id(app).await?.ok_or_else(|| {
        let message =
            "profile user_id is missing; create your profile before starting BLE".to_string();
        service.debug_event("start-error", message.clone());
        message
    })
}

#[tauri::command]
pub fn ble_stop(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    service.debug_event("stop-request", "background");
    spawn_ble_stop(app);
    Ok(())
}

#[tauri::command]
pub async fn ble_walk_mode_start(
    app: AppHandle,
    service: State<'_, BleService>,
) -> Result<(), String> {
    let user_id = require_my_user_id(&app, &service).await?;
    service.debug_event("start-request", "mode=walk");
    spawn_ble_start(app, BleMode::Walk, user_id);
    Ok(())
}

#[tauri::command]
pub async fn ble_walk_mode_stop(
    app: AppHandle,
    service: State<'_, BleService>,
) -> Result<(), String> {
    let user_id = require_my_user_id(&app, &service).await?;
    service.debug_event("start-request", "mode=normal");
    spawn_ble_start(app, BleMode::Normal, user_id);
    Ok(())
}

fn spawn_ble_start(app: AppHandle, mode: BleMode, user_id: String) {
    async_runtime::spawn_blocking(move || {
        let service = app.state::<BleService>();
        if let Err(e) = service.start(app.clone(), mode, Some(user_id)) {
            log::warn!("[ble] background start failed mode={mode:?}: {e}");
            service.debug_event("start-error", e);
        }
    });
}

fn spawn_ble_stop(app: AppHandle) {
    async_runtime::spawn_blocking(move || {
        let service = app.state::<BleService>();
        service.stop(app.clone());
    });
}

#[tauri::command]
pub fn ble_status(app: AppHandle, service: State<'_, BleService>) -> BleStatus {
    service.status(app)
}

#[tauri::command]
pub fn ble_debug_snapshot(service: State<'_, BleService>) -> BleDebugSnapshot {
    service.debug_snapshot()
}

#[tauri::command]
pub fn ble_debug_note(service: State<'_, BleService>, label: String, detail: String) {
    service.debug_event(label, detail);
}

#[tauri::command]
pub async fn ble_drain_pending_encounters(
    app: AppHandle,
    service: State<'_, BleService>,
) -> Result<u32, String> {
    let pending = service.drain_pending(app.clone())?;
    log::info!("[ble] drain pending received {} event(s)", pending.len());
    service.debug_event("drain-command", format!("pending={}", pending.len()));
    let mut inserted = 0;
    for encounter in pending {
        if encounter::record_received_user_id_internal(
            &app,
            encounter.user_id,
            Some(encounter.seen_at),
        )
        .await?
        {
            inserted += 1;
        }
    }
    log::info!("[ble] drain pending inserted {} row(s)", inserted);
    service.debug_event("drain-result", format!("inserted={inserted}"));
    Ok(inserted)
}
