//! Tauri commands for BLE control.
//! 契約: docs/contracts/tauri-commands.md (ble.*)

use tauri::{AppHandle, State};

use crate::ble::{BleMode, BleService, BleStatus};

#[tauri::command]
pub fn ble_start(app: AppHandle, service: State<'_, BleService>) -> Result<(), String> {
    service.start(app, BleMode::Normal);
    Ok(())
}

#[tauri::command]
pub fn ble_stop(service: State<'_, BleService>) -> Result<(), String> {
    service.stop();
    Ok(())
}

#[tauri::command]
pub fn ble_walk_mode_start(
    app: AppHandle,
    service: State<'_, BleService>,
) -> Result<(), String> {
    service.start(app, BleMode::Walk);
    Ok(())
}

#[tauri::command]
pub fn ble_walk_mode_stop(service: State<'_, BleService>) -> Result<(), String> {
    service.stop();
    Ok(())
}

#[tauri::command]
pub fn ble_status(service: State<'_, BleService>) -> BleStatus {
    service.status()
}
