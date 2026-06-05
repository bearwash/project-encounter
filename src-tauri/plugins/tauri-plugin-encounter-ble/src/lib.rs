use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.projectencounter.encounterble";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_encounter_ble);

pub const PLUGIN_NAME: &str = "encounter-ble";
pub const EVENT_ENCOUNTER_FOUND: &str = "encounter-found";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MobileBleMode {
    Normal,
    Walk,
}

#[cfg(mobile)]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartPayload<'a> {
    user_id: &'a str,
    mode: MobileBleMode,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MobileBleStatus {
    pub bluetooth_on: bool,
    pub permission_granted: bool,
    pub advertise_active: bool,
    pub scan_active: bool,
    pub seen_count: u32,
    pub pending_count: u32,
    pub pending_gatt_count: u32,
    pub last_seen_at: Option<i64>,
    pub last_seen_user_id: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileEncounter {
    #[serde(alias = "user_id")]
    pub user_id: String,
    #[serde(alias = "seen_at")]
    pub seen_at: i64,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MobileEncounterBatch {
    pub encounters: Vec<MobileEncounter>,
}

pub struct EncounterBle<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    #[cfg(not(mobile))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> EncounterBle<R> {
    #[cfg(mobile)]
    pub fn start(&self, user_id: &str, mode: MobileBleMode) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("start", StartPayload { user_id, mode })
            .map_err(|e| e.to_string())
    }

    #[cfg(not(mobile))]
    pub fn start(&self, _user_id: &str, _mode: MobileBleMode) -> Result<(), String> {
        Err("encounter BLE native plugin is only available on mobile".to_string())
    }

    #[cfg(mobile)]
    pub fn stop(&self) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("stop", ())
            .map_err(|e| e.to_string())
    }

    #[cfg(not(mobile))]
    pub fn stop(&self) -> Result<(), String> {
        Ok(())
    }

    #[cfg(mobile)]
    pub fn status(&self) -> Result<MobileBleStatus, String> {
        self.handle
            .run_mobile_plugin::<MobileBleStatus>("status", ())
            .map_err(|e| e.to_string())
    }

    #[cfg(not(mobile))]
    pub fn status(&self) -> Result<MobileBleStatus, String> {
        Ok(MobileBleStatus::default())
    }

    #[cfg(mobile)]
    pub fn drain_pending(&self) -> Result<Vec<MobileEncounter>, String> {
        self.handle
            .run_mobile_plugin::<MobileEncounterBatch>("drainPending", ())
            .map(|batch| batch.encounters)
            .map_err(|e| e.to_string())
    }

    #[cfg(not(mobile))]
    pub fn drain_pending(&self) -> Result<Vec<MobileEncounter>, String> {
        Ok(Vec::new())
    }
}

pub trait EncounterBleExt<R: Runtime> {
    fn encounter_ble(&self) -> &EncounterBle<R>;
}

impl<R: Runtime, T: Manager<R>> EncounterBleExt<R> for T {
    fn encounter_ble(&self) -> &EncounterBle<R> {
        self.state::<EncounterBle<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            #[cfg(not(mobile))]
            let _ = &api;

            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "EncounterBlePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_encounter_ble)?;

            app.manage(EncounterBle {
                #[cfg(mobile)]
                handle,
                #[cfg(not(mobile))]
                _marker: std::marker::PhantomData::<fn() -> R>,
            });
            Ok(())
        })
        .build()
}
