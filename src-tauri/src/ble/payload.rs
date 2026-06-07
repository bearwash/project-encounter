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

/// BLE 上で交換する 16 byte は UUID の **ネットワークバイト順 (RFC 4122 / big-endian)**。
/// これは `Uuid::as_bytes` / `Uuid::from_bytes` が用いる順序であり、
/// iOS の `uuid_t` (タプルそのまま) と Android の `ByteBuffer`
/// (`putLong(msb).putLong(lsb)` = big-endian) のいずれとも一致する。
/// 受信側 (btleplug scan) は `Uuid::from_bytes` でこの順序として解釈する。
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_bytes_round_trip_is_network_order() {
        let u = Uuid::parse_str("4a985948-3bc6-450b-80d2-04a8f98f83cb").unwrap();
        let bytes = *u.as_bytes();
        // 先頭バイトが UUID 文字列の先頭 (MSB) と一致する = ネットワークバイト順
        assert_eq!(bytes[0], 0x4a);
        assert_eq!(bytes[15], 0xcb);
        // from_bytes で元の UUID / 文字列に戻る (送受信の往復契約)
        assert_eq!(Uuid::from_bytes(bytes), u);
        assert_eq!(BlePayload::from_uuid(Uuid::from_bytes(bytes)).user_id, u.to_string());
    }
}
