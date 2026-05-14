use serde::{Deserialize, Serialize};

/// BLE すれ違い通信で 1 ハンドシェイクあたりに交換するペイロード。
/// 契約: docs/contracts/ble-payload.schema.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlePayload {
    pub id: String,
    pub name: String,
    pub avatar: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub msg: Option<String>,
}
