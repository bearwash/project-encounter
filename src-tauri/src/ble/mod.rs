//! BLE すれ違い通信のサービス層。
//!
//! バックエンドは 2 種類:
//!   - `Mock`     : デバッグ用の擬似 peer ループ (環境変数で強制可能)
//!   - `Btleplug` : 実 BLE Scan (macOS / Linux / Windows のみ)
//!
//! iOS / Android はネイティブプラグインが必要なため、Phase 2 で別途実装する。
//! 実機以外では `Mock` にフォールバックして UI 検証だけは継続できる。
//!
//! 仕様: docs/specs/ble-handshake.md
//! 契約: docs/contracts/tauri-commands.md (ble.*)

pub mod payload;
pub mod profile_resolver;

use std::sync::Mutex;

use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Emitter};
use uuid::Uuid;

use self::payload::BlePayload;

pub const EVENT_ENCOUNTER_FOUND: &str = "ble://encounter-found";

/// アプリ固有 BLE Service UUID。spec ble-handshake.md §4.1 で確定。
/// scan のフィルタおよび advertise の Service Data Service UUID として使う。
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
}

#[derive(Debug, Clone, Serialize)]
pub struct BleStatus {
    pub mode: BleMode,
    pub backend: BleBackend,
    pub bluetooth_on: bool,
    pub permission_granted: bool,
    pub advertise_active: bool,
    pub scan_active: bool,
}

pub struct BleService {
    inner: Mutex<Inner>,
    backend: BleBackend,
}

struct Inner {
    mode: BleMode,
    task: Option<async_runtime::JoinHandle<()>>,
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
            }),
            backend,
        }
    }

    pub fn status(&self) -> BleStatus {
        let inner = self.inner.lock().expect("ble lock poisoned");
        let active = inner.mode != BleMode::Idle;
        BleStatus {
            mode: inner.mode,
            backend: self.backend,
            // mock の場合は固定で true、btleplug の場合は実 BLE 状態を反映したいが
            // adapter 状態の同期取得は重いので Phase 2 で別途。
            bluetooth_on: true,
            permission_granted: true,
            // btleplug は scan のみ実装 (Advertise は §4.7 オープン課題)
            advertise_active: matches!(self.backend, BleBackend::Mock) && active,
            scan_active: active,
        }
    }

    pub fn start(&self, app: AppHandle, mode: BleMode) {
        let mut inner = self.inner.lock().expect("ble lock poisoned");
        if let Some(h) = inner.task.take() {
            h.abort();
        }
        inner.mode = mode;
        let backend = self.backend;
        let handle = async_runtime::spawn(async move {
            match backend {
                BleBackend::Mock => mock_loop(app, mode).await,
                BleBackend::Btleplug => {
                    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                    {
                        btleplug_scan_loop(app, mode).await;
                    }
                    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
                    {
                        log::warn!("[ble] btleplug not supported on this platform, falling back to mock");
                        mock_loop(app, mode).await;
                    }
                }
            }
        });
        inner.task = Some(handle);
    }

    pub fn stop(&self) {
        let mut inner = self.inner.lock().expect("ble lock poisoned");
        if let Some(h) = inner.task.take() {
            h.abort();
        }
        inner.mode = BleMode::Idle;
    }
}

impl Default for BleService {
    fn default() -> Self {
        Self::new()
    }
}

/// 既定バックエンドを env で決定。
/// - `BLE_BACKEND=mock`     → Mock 強制
/// - `BLE_BACKEND=btleplug` → Btleplug 強制
/// - 未指定                  → 対応 OS なら Btleplug、それ以外は Mock
fn default_backend() -> BleBackend {
    match std::env::var("BLE_BACKEND").as_deref() {
        Ok("mock") => BleBackend::Mock,
        Ok("btleplug") => BleBackend::Btleplug,
        _ => {
            if cfg!(any(target_os = "macos", target_os = "linux", target_os = "windows")) {
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
        let CentralEvent::ServiceDataAdvertisement {
            id,
            service_data,
        } = event
        else {
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
