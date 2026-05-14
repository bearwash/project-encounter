mod ble;
mod commands;

use tauri_plugin_sql::{Migration, MigrationKind};

use crate::ble::BleService;

const DB_URL: &str = "sqlite:project_encounter.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial schema",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .manage(BleService::new())
        .invoke_handler(tauri::generate_handler![
            commands::ble::ble_start,
            commands::ble::ble_stop,
            commands::ble::ble_walk_mode_start,
            commands::ble::ble_walk_mode_stop,
            commands::ble::ble_status,
        ])
        .setup(|app| {
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
