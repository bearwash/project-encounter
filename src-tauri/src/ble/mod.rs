//! BLE すれ違い通信のサービス層。
//!
//! バックエンドは 3 種類:
//!   - `Mock`     : デバッグ用の擬似 peer ループ (環境変数で強制可能)
//!   - `Btleplug` : 実 BLE Scan (macOS / Linux / Windows のみ)
//!   - `TauriPlugin`: iOS / Android の native BLE bridge
//!
//! 実機以外では `Mock` にフォールバックして UI 検証だけは継続できる。
//!
//! 仕様: docs/specs/ble-handshake.md
//! 契約: docs/contracts/tauri-commands.md (ble.*)

pub mod payload;
pub mod profile_resolver;

use std::{collections::VecDeque, sync::Mutex};

use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Emitter};
#[cfg(mobile)]
use tauri_plugin_encounter_ble::EncounterBleExt;
use tauri_plugin_encounter_ble::MobileBleMode;
use uuid::Uuid;

use self::payload::BlePayload;

pub const EVENT_ENCOUNTER_FOUND: &str = "ble://encounter-found";
const DEBUG_EVENTS_MAX: usize = 32;

/// アプリ固有 BLE Service UUID。spec ble-handshake.md §4.1 で確定。
/// scan のフィルタおよび advertise の Service Data Service UUID として使う。
#[cfg_attr(mobile, allow(dead_code))]
pub const SERVICE_UUID: Uuid = Uuid::from_u128(0x4a98_5948_3bc6_450b_80d2_04a8_f98f_83cb);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BleMode {
    Idle,
    Normal,
    Walk,
}

/// BLE 実装の種別。runtime に env 経由で選択する。
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BleBackend {
    /// デバッグ用の擬似 peer ループ
    Mock,
    /// btleplug を使った実 BLE (macOS / Linux / Windows)
    Btleplug,
    /// iOS / Android の Native BLE plugin
    #[serde(rename = "tauri-plugin")]
    TauriPlugin,
}

#[derive(Debug, Clone, Serialize)]
pub struct BleStatus {
    pub mode: BleMode,
    pub backend: BleBackend,
    pub bluetooth_on: bool,
    pub permission_granted: bool,
    pub advertise_active: bool,
    pub scan_active: bool,
    pub seen_count: u32,
    pub pending_count: u32,
    pub pending_gatt_count: u32,
    pub last_seen_at: Option<i64>,
    pub last_seen_user_id: Option<String>,
    pub last_drained_count: u32,
    pub last_drained_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BleDebugEvent {
    pub at: i64,
    pub label: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BleDebugSnapshot {
    pub backend: BleBackend,
    pub mode: BleMode,
    pub events: Vec<BleDebugEvent>,
}

pub struct BleService {
    inner: Mutex<Inner>,
    backend: BleBackend,
}

struct Inner {
    mode: BleMode,
    task: Option<async_runtime::JoinHandle<()>>,
    last_drained_count: u32,
    last_drained_at: Option<i64>,
    last_error: Option<String>,
    debug_events: VecDeque<BleDebugEvent>,
}

impl BleService {
    pub fn new() -> Self {
        Self::with_backend(default_backend())
    }

    pub fn with_backend(backend: BleBackend) -> Self {
        log::info!("[ble] backend = {:?}", backend);
        Self {
            inner: Mutex::new(Inner {
                mode: BleMode::Idle,
                task: None,
                last_drained_count: 0,
                last_drained_at: None,
                last_error: None,
                debug_events: VecDeque::with_capacity(DEBUG_EVENTS_MAX),
            }),
            backend,
        }
    }

    pub fn status(&self, app: AppHandle) -> BleStatus {
        let inner = self.inner.lock().expect("ble lock poisoned");
        let active = inner.mode != BleMode::Idle;
        #[cfg(not(mobile))]
        let _ = &app;
        #[allow(unused_mut)]
        let mut status = BleStatus {
            mode: inner.mode,
            backend: self.backend,
            // mock の場合は固定で true、btleplug の場合は実 BLE 状態を反映したいが
            // adapter 状態の同期取得は重いので Phase 2 で別途。
            bluetooth_on: true,
            permission_granted: true,
            // btleplug は scan のみ実装 (Advertise は §4.7 オープン課題)
            advertise_active: matches!(self.backend, BleBackend::Mock) && active,
            scan_active: active,
            seen_count: 0,
            pending_count: 0,
            pending_gatt_count: 0,
            last_seen_at: None,
            last_seen_user_id: None,
            last_drained_count: inner.last_drained_count,
            last_drained_at: inner.last_drained_at,
            last_error: inner.last_error.clone(),
        };

        if matches!(self.backend, BleBackend::TauriPlugin) {
            #[cfg(mobile)]
            if let Ok(native) = app.encounter_ble().status() {
                status.bluetooth_on = native.bluetooth_on;
                status.permission_granted = native.permission_granted;
                status.advertise_active = native.advertise_active;
                status.scan_active = native.scan_active;
                status.seen_count = native.seen_count;
                status.pending_count = native.pending_count;
                status.pending_gatt_count = native.pending_gatt_count;
                status.last_seen_at = native.last_seen_at;
                status.last_seen_user_id = native.last_seen_user_id;
                if native.last_error.is_some() {
                    status.last_error = native.last_error;
                }
            }
        }

        status
    }

    pub fn start(
        &self,
        app: AppHandle,
        mode: BleMode,
        user_id: Option<String>,
    ) -> Result<(), String> {
        let backend = self.backend;
        {
            let mut inner = self.inner.lock().expect("ble lock poisoned");
            if inner.mode == mode && !matches!(backend, BleBackend::TauriPlugin) {
                push_debug(
                    &mut inner,
                    "start-skip",
                    format!("backend={backend:?} mode={mode:?}"),
                );
                return Ok(());
            }
            if let Some(h) = inner.task.take() {
                h.abort();
            }
            inner.mode = mode;
            inner.last_error = None;
            push_debug(
                &mut inner,
                "start",
                format!("backend={backend:?} mode={mode:?}"),
            );
        }

        if matches!(backend, BleBackend::TauriPlugin) {
            #[cfg(mobile)]
            {
                let Some(user_id) = user_id else {
                    let message =
                        "profile is required before starting mobile BLE advertise".to_string();
                    let mut inner = self.inner.lock().expect("ble lock poisoned");
                    inner.mode = BleMode::Idle;
                    inner.last_error = Some(message.clone());
                    push_debug(&mut inner, "start-error", message.clone());
                    return Err(message);
                };
                if let Err(e) = app.encounter_ble().start(&user_id, mode.into()) {
                    let mut inner = self.inner.lock().expect("ble lock poisoned");
                    inner.mode = BleMode::Idle;
                    inner.last_error = Some(e.clone());
                    push_debug(&mut inner, "start-error", e.clone());
                    return Err(e);
                }
                return Ok(());
            }
            #[cfg(not(mobile))]
            {
                let _ = user_id;
                let mut inner = self.inner.lock().expect("ble lock poisoned");
                inner.mode = BleMode::Idle;
                inner.last_error = Some("native plugin unavailable".to_string());
                push_debug(&mut inner, "start-error", "native plugin unavailable");
                return Err("encounter BLE native plugin is only available on mobile".to_string());
            }
        }

        let handle = async_runtime::spawn(async move {
            match backend {
                BleBackend::Mock => mock_loop(app, mode).await,
                BleBackend::TauriPlugin => unreachable!("native plugin backend is handled above"),
                BleBackend::Btleplug => {
                    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                    {
                        btleplug_scan_loop(app, mode).await;
                    }
                    #[cfg(any(target_os = "ios", target_os = "android"))]
                    {
                        log::warn!(
                            "[ble] btleplug is not available on iOS/Android; use BLE_BACKEND=tauri-plugin for native BLE"
                        );
                        mock_loop(app, mode).await;
                    }
                    #[cfg(not(any(
                        target_os = "macos",
                        target_os = "linux",
                        target_os = "windows",
                        target_os = "ios",
                        target_os = "android"
                    )))]
                    {
                        log::warn!(
                            "[ble] btleplug not supported on this platform, falling back to mock"
                        );
                        mock_loop(app, mode).await;
                    }
                }
            }
        });
        let mut inner = self.inner.lock().expect("ble lock poisoned");
        inner.task = Some(handle);
        Ok(())
    }

    pub fn stop(&self, app: AppHandle) {
        #[cfg(not(mobile))]
        let _ = &app;
        {
            let mut inner = self.inner.lock().expect("ble lock poisoned");
            if let Some(h) = inner.task.take() {
                h.abort();
            }
            push_debug(&mut inner, "stop", format!("backend={:?}", self.backend));
            inner.mode = BleMode::Idle;
            inner.last_error = None;
        }
        if matches!(self.backend, BleBackend::TauriPlugin) {
            #[cfg(mobile)]
            if let Err(e) = app.encounter_ble().stop() {
                log::warn!("[ble] native plugin stop failed: {e}");
            }
        }
    }

    pub fn drain_pending(
        &self,
        app: AppHandle,
    ) -> Result<Vec<tauri_plugin_encounter_ble::MobileEncounter>, String> {
        let drained = if matches!(self.backend, BleBackend::TauriPlugin) {
            #[cfg(mobile)]
            {
                app.encounter_ble().drain_pending()?
            }
            #[cfg(not(mobile))]
            {
                let _ = app;
                Vec::new()
            }
        } else {
            #[cfg(not(mobile))]
            let _ = app;
            Vec::new()
        };

        let mut inner = self.inner.lock().expect("ble lock poisoned");
        inner.last_drained_count = drained.len() as u32;
        let drained_at = unix_now();
        inner.last_drained_at = Some(drained_at);
        push_debug(
            &mut inner,
            "drain",
            format!("received={} at={drained_at}", drained.len()),
        );
        Ok(drained)
    }

    pub fn debug_snapshot(&self) -> BleDebugSnapshot {
        let inner = self.inner.lock().expect("ble lock poisoned");
        BleDebugSnapshot {
            backend: self.backend,
            mode: inner.mode,
            events: inner.debug_events.iter().cloned().collect(),
        }
    }

    pub fn debug_event(&self, label: impl Into<String>, detail: impl Into<String>) {
        let mut inner = self.inner.lock().expect("ble lock poisoned");
        let label = label.into();
        let detail = detail.into();
        if label.ends_with("error") || label == "start-error" {
            inner.last_error = Some(detail.clone());
        }
        push_debug(&mut inner, label, detail);
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn push_debug(inner: &mut Inner, label: impl Into<String>, detail: impl Into<String>) {
    if inner.debug_events.len() >= DEBUG_EVENTS_MAX {
        inner.debug_events.pop_front();
    }
    inner.debug_events.push_back(BleDebugEvent {
        at: unix_now(),
        label: label.into(),
        detail: detail.into(),
    });
}

impl From<BleMode> for MobileBleMode {
    fn from(value: BleMode) -> Self {
        match value {
            BleMode::Walk => MobileBleMode::Walk,
            BleMode::Idle | BleMode::Normal => MobileBleMode::Normal,
        }
    }
}

impl Default for BleService {
    fn default() -> Self {
        Self::new()
    }
}

/// 既定バックエンドを env で決定。
/// - `BLE_BACKEND=mock`     → Mock 強制
/// - `BLE_BACKEND=btleplug` → Btleplug 強制 (iOS/Android では mock fallback)
/// - `BLE_BACKEND=tauri-plugin` → iOS/Android Native BLE plugin 強制
/// - 未指定                  → mobile は TauriPlugin、対応 desktop OS は Btleplug、他は Mock
fn default_backend() -> BleBackend {
    match std::env::var("BLE_BACKEND").as_deref() {
        Ok("mock") => BleBackend::Mock,
        Ok("btleplug") => BleBackend::Btleplug,
        Ok("tauri-plugin") => BleBackend::TauriPlugin,
        _ => {
            if cfg!(mobile) {
                BleBackend::TauriPlugin
            } else if cfg!(any(
                target_os = "macos",
                target_os = "linux",
                target_os = "windows"
            )) {
                BleBackend::Btleplug
            } else {
                BleBackend::Mock
            }
        }
    }
}

/// 擬似 peer 発見ループ。
/// ウォークモードでは検出頻度を高く (spec ble-handshake §4.2)。
async fn mock_loop(app: AppHandle, mode: BleMode) {
    let (min_s, max_s): (u64, u64) = match mode {
        BleMode::Walk => (5, 15),
        _ => (20, 60),
    };

    loop {
        let wait_s = {
            let mut rng = rand::thread_rng();
            rng.gen_range(min_s..=max_s)
        };
        tokio::time::sleep(std::time::Duration::from_secs(wait_s)).await;

        let payload = BlePayload::from_uuid(Uuid::new_v4());
        if let Err(e) = app.emit(EVENT_ENCOUNTER_FOUND, &payload) {
            log::warn!("failed to emit {}: {}", EVENT_ENCOUNTER_FOUND, e);
        }
    }
}

// =============================================================
// 実 BLE Scan (btleplug)
// =============================================================
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
async fn btleplug_scan_loop(app: AppHandle, _mode: BleMode) {
    use btleplug::api::{Central, CentralEvent, Manager as _, ScanFilter};
    use btleplug::platform::Manager;
    use futures::stream::StreamExt;
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    let manager = match Manager::new().await {
        Ok(m) => m,
        Err(e) => {
            log::error!("[ble] btleplug Manager init failed: {e}");
            return;
        }
    };

    let adapters = match manager.adapters().await {
        Ok(a) => a,
        Err(e) => {
            log::error!("[ble] adapters() failed: {e}");
            return;
        }
    };
    let adapter = match adapters.into_iter().next() {
        Some(a) => a,
        None => {
            log::error!("[ble] no Bluetooth adapter found");
            return;
        }
    };

    let filter = ScanFilter {
        services: vec![SERVICE_UUID],
    };
    if let Err(e) = adapter.start_scan(filter).await {
        log::error!("[ble] start_scan failed: {e}");
        return;
    }
    log::info!("[ble] scan started (service={})", SERVICE_UUID);

    let mut events = match adapter.events().await {
        Ok(s) => s,
        Err(e) => {
            log::error!("[ble] events() failed: {e}");
            return;
        }
    };

    // 同一 PeripheralId からの連続検出を 5 秒で抑止 (DB 側のクールダウンとは別、
    // emit 過多を防ぐ)。本仕様の 8 時間クールダウンは TS 側で判定する。
    let mut last_seen: HashMap<String, Instant> = HashMap::new();
    let dedup_window = Duration::from_secs(5);

    while let Some(event) = events.next().await {
        let CentralEvent::ServiceDataAdvertisement { id, service_data } = event else {
            continue;
        };

        let Some(data) = service_data.get(&SERVICE_UUID) else {
            continue;
        };
        if data.len() != 16 {
            log::warn!("[ble] payload size != 16 ({})", data.len());
            continue;
        }

        let id_key = format!("{:?}", id);
        let now = Instant::now();
        if let Some(prev) = last_seen.get(&id_key) {
            if now.duration_since(*prev) < dedup_window {
                continue;
            }
        }
        last_seen.insert(id_key, now);

        let mut bytes = [0u8; 16];
        bytes.copy_from_slice(data);
        let uuid = Uuid::from_bytes(bytes);
        let payload = BlePayload::from_uuid(uuid);

        log::info!("[ble] discovered peer user_id={}", payload.user_id);
        if let Err(e) = app.emit(EVENT_ENCOUNTER_FOUND, &payload) {
            log::warn!("[ble] emit failed: {e}");
        }
    }
}
