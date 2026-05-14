use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// BLE すれ違い通信で 1 Advertise あたりに交換するペイロード。
/// 契約: docs/contracts/ble-payload.schema.json
/// 仕様: docs/specs/ble-handshake.md §4.2
///
/// BLE 上はバイナリ 16 byte で送出するが、Rust/TS 境界では UUID 文字列形式
/// (小文字、ハイフン区切り) で表現する。プロフィール本体 (display_name /
/// avatar_code / message) はここに含めず、Supabase 経由で別途取得する。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlePayload {
    /// 送信者の user_id (UUID 文字列形式)
    pub user_id: String,
}

impl BlePayload {
    pub fn from_uuid(uuid: Uuid) -> Self {
        Self {
            user_id: uuid.to_string(),
        }
    }
}
