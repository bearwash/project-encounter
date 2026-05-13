# BLE Handshake — すれ違い通信

> 関連: [要件定義 §4](../要件定義.md) / [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)

## 1. ゴール (What & Why)
GPS を使わず、純粋な BLE 電波の物理的到達のみで「すれ違い」を検出し、相手の最小プロフィールを交換してローカルに保存する。
位置情報非取得はプライバシー要件の中核であり、本機能の存在意義そのもの。

## 2. ユーザーストーリー
- ユーザーとして、アプリをポケットに入れたまま街を歩くだけで、近くを通った他ユーザーとデータが交換されていてほしい。
- ユーザーとして、自分の位置情報は一切外部に取得されない安心感が欲しい。

## 3. スコープ
### In Scope
- BLE advertise / scan の起動・停止
- Service UUID によるアプリ識別
- 最小ペイロードの送受信（[contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json) 準拠）
- 同一ユーザーに対するクールダウン制御（既定 8 時間）
- ローカル DB への記録（[db-schema.sql](../contracts/db-schema.sql) の `encounter_logs` / `users_cache`）

### Out of Scope
- 中央サーバーへの送信
- 位置情報（GPS / CoreLocation）の利用
- BLE 以外のチャネル（Wi-Fi Direct、UWB 等）

## 4. 仕様詳細

### 4.1 Service UUID
アプリ専用の Service UUID を 1 つ確保する（具体値は実装時に決定し、本ドキュメントに固定値として記載する）。

- `SERVICE_UUID`: `TBD`（128-bit UUID）

### 4.2 動作モード

| モード | スキャン頻度 | アドバタイズ頻度 | 起動条件 |
| --- | --- | --- | --- |
| 通常時 | OS 任せ（バックグラウンド） | OS 任せ（バックグラウンド） | アプリ起動後、明示的停止まで継続 |
| ウォークモード | 高頻度（フォアグラウンド） | 高頻度（フォアグラウンド） | [walk-mode.md](walk-mode.md) 参照 |

### 4.3 ペイロード
[contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json) に厳密準拠。
合計バイト数は **BLE advertise の有効ペイロード上限（実装で計測）** を超えないこと。超える場合は `msg` を切り詰める。

### 4.4 クールダウン
- 同一 `user_id` との 2 回目以降の遭遇は、前回 `encounter_logs.encountered_at` から `COOLDOWN_SEC` 経過後にのみ新規ログとして記録する。
- 既定値: `COOLDOWN_SEC = 8 * 60 * 60`（8 時間）
- 開発・テスト時には `COOLDOWN_SEC = 60`（1 分）等に短縮できるよう、ビルド設定または DB 設定値で切替可能にする。
- クールダウン中の再遭遇では `users_cache.encounter_count` をインクリメントしない（重複カウント防止）。

### 4.5 状態遷移

```
[Idle] --start_advertise--> [Advertising]
[Idle] --start_scan------> [Scanning]
[Advertising+Scanning] --peer_found--> [Handshaking]
[Handshaking] --payload_ok--> [Persist] --> [Advertising+Scanning]
[Handshaking] --timeout/error--> [Advertising+Scanning]（無視・ログのみ）
```

### 4.6 エラー処理
- BLE 権限拒否 → UI 側に明示エラーを返し、ユーザーに権限再要求を促す
- Bluetooth OFF → 待機状態に入り、ON 検知でリトライ
- ペイロードのスキーマ違反 → 破棄。ログは残す（不正端末検知用）

## 5. 受入基準
- [ ] 2 台の端末を近づけたとき、双方の `encounter_logs` に 1 件ずつエントリが追加される
- [ ] 同じ相手と連続して近づいてもクールダウン中はログが増えない
- [ ] クールダウン経過後の再遭遇でログが追加され、`encounter_count` が +1 される
- [ ] アプリがバックグラウンドにある状態でもすれ違いが成立する（OS 制約の範囲で）
- [ ] GPS / 位置情報パーミッションを一切要求しない
- [ ] スキーマ違反ペイロードを受信しても DB が破損しない

## 6. 依存・関連
- 上流: [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json), [contracts/db-schema.sql](../contracts/db-schema.sql)
- 下流: [encounter-popup.md](encounter-popup.md), [encounter-list.md](encounter-list.md), [walk-mode.md](walk-mode.md)

## 7. オープン課題
- [ ] Service UUID の確定
- [ ] iOS バックグラウンドでの advertise 制限（Apple 仕様）への対処方針
- [ ] Android 12+ の `BLUETOOTH_ADVERTISE` / `BLUETOOTH_SCAN` 権限フロー
- [ ] payload 最大バイト数の計測と `msg` 切り詰めポリシー
- [ ] 衝突する `user_id` が同時刻に複数現れた場合の優先度
