//! BLE すれ違い通信のサービス層。
//!
//! 現状は **mock 実装** — tokio タスクで擬似 peer を一定間隔で発火する。
//! 実 BLE 実装時は [`BleService::start`] / [`BleService::stop`] の内部のみを差し替える。
//!
//! 仕様: docs/specs/ble-handshake.md
//! 契約: docs/contracts/tauri-commands.md (ble.*)

pub mod payload;

use std::sync::Mutex;

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime, AppHandle, Emitter};

use self::payload::BlePayload;

pub const EVENT_ENCOUNTER_FOUND: &str = "ble://encounter-found";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BleMode {
    Idle,
    Normal,
    Walk,
}

#[derive(Debug, Clone, Serialize)]
pub struct BleStatus {
    pub mode: BleMode,
    pub bluetooth_on: bool,
    pub permission_granted: bool,
    pub advertise_active: bool,
    pub scan_active: bool,
}

pub struct BleService {
    inner: Mutex<Inner>,
}

struct Inner {
    mode: BleMode,
    task: Option<async_runtime::JoinHandle<()>>,
}

impl BleService {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                mode: BleMode::Idle,
                task: None,
            }),
        }
    }

    pub fn status(&self) -> BleStatus {
        let inner = self.inner.lock().expect("ble lock poisoned");
        let active = inner.mode != BleMode::Idle;
        BleStatus {
            mode: inner.mode,
            // mock: 実装時には実 BLE adapter の状態を反映する
            bluetooth_on: true,
            permission_granted: true,
            advertise_active: active,
            scan_active: active,
        }
    }

    pub fn start(&self, app: AppHandle, mode: BleMode) {
        let mut inner = self.inner.lock().expect("ble lock poisoned");
        if let Some(h) = inner.task.take() {
            h.abort();
        }
        inner.mode = mode;
        let handle = async_runtime::spawn(async move {
            mock_loop(app, mode).await;
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

/// 擬似 peer 発見ループ。
/// ウォークモードでは検出頻度を高く (spec ble-handshake §4.2)。
async fn mock_loop(app: AppHandle, mode: BleMode) {
    let (min_s, max_s): (u64, u64) = match mode {
        BleMode::Walk => (5, 15),
        _ => (20, 60),
    };

    loop {
        // rng を await にまたがって持ち越さない (Send 制約回避)
        let wait_s = {
            let mut rng = rand::thread_rng();
            rng.gen_range(min_s..=max_s)
        };
        tokio::time::sleep(std::time::Duration::from_secs(wait_s)).await;

        let payload = mock_payload();
        if let Err(e) = app.emit(EVENT_ENCOUNTER_FOUND, &payload) {
            log::warn!("failed to emit {}: {}", EVENT_ENCOUNTER_FOUND, e);
        }
    }
}

fn mock_payload() -> BlePayload {
    const NAMES: &[&str] = &["Neko-9", "Riku", "sora", "Pixel.42", "mion", "zoo", "Hex"];
    const AVATARS: &[&str] = &[
        "base01_top01_bot01",
        "base02_top03_bot02",
        "base01_top05_bot04",
        "base03_top02_bot01",
    ];
    const MESSAGES: &[&str] = &[
        "最近はRust勉強中！",
        "こんにちは",
        "散歩中",
        "今日は寒い",
        "すれ違いテスト",
        "",
    ];

    let mut rng = rand::thread_rng();
    let id: String = (0..8)
        .map(|_| {
            let n: u8 = rng.gen_range(0..16);
            format!("{:X}", n)
        })
        .collect();

    BlePayload {
        id,
        name: NAMES.choose(&mut rng).unwrap().to_string(),
        avatar: AVATARS.choose(&mut rng).unwrap().to_string(),
        msg: Some(MESSAGES.choose(&mut rng).unwrap().to_string()),
    }
}
