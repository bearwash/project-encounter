mod ble;
mod commands;
mod db;

use tauri_plugin_sql::{Migration, MigrationKind};

use crate::ble::BleService;

const DB_URL: &str = "sqlite:project_encounter.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "profile sync: add queue, drop FK on encounter_logs",
            sql: include_str!("../migrations/0002_profile_sync.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add home_prefecture to my_profile / users_cache",
            sql: include_str!("../migrations/0003_home_prefecture.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_encounter_ble::init())
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
            commands::profile::profile_get,
            commands::profile::profile_save,
            commands::profile::profile_fetch_remote,
            commands::encounter::encounter_list_unread,
            commands::encounter::encounter_mark_read,
            commands::encounter::encounter_list_history,
            commands::settings::settings_get_cooldown_sec,
            commands::settings::settings_set_cooldown_sec,
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
