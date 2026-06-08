mod ble;
mod commands;
mod db;

use tauri::Manager;

use crate::ble::BleService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // スキーマの唯一の所有者は db::ensure_schema (docs/contracts/db-schema.sql)。
    // 以前は tauri-plugin-sql の migration と二重管理しており、Rust が先に
    // フルスキーマを作ると plugin migration 0003 の ADD COLUMN が
    // "duplicate column" で衝突しうる問題があった。plugin-sql は TS からの
    // 接続用にのみ使い、migration は登録しない。
    tauri::Builder::default()
        .plugin(tauri_plugin_encounter_ble::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(BleService::new())
        .invoke_handler(tauri::generate_handler![
            commands::ble::ble_start,
            commands::ble::ble_stop,
            commands::ble::ble_walk_mode_start,
            commands::ble::ble_walk_mode_stop,
            commands::ble::ble_status,
            commands::ble::ble_debug_snapshot,
            commands::ble::ble_debug_note,
            commands::ble::ble_drain_pending_encounters,
            commands::profile::profile_get,
            commands::profile::profile_save,
            commands::profile::profile_fetch_remote,
            commands::encounter::encounter_record_received_user_id,
            commands::encounter::encounter_list_unread,
            commands::encounter::encounter_mark_read,
            commands::encounter::encounter_list_history,
            commands::settings::settings_get_cooldown_sec,
            commands::settings::settings_set_cooldown_sec,
        ])
        .setup(|app| {
            // 共有 DB プールを起動時に一度だけ生成し manage する。
            let pool = tauri::async_runtime::block_on(db::init_pool(app.handle()))
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(pool);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
