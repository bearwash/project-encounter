# BLE Handshake — すれ違い検出（ID-only BLE）

> 関連: [要件定義 §4.1, §4.2](../要件定義.md) / [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json) / [profile-sync.md](profile-sync.md)

## 1. ゴール (What & Why)
GPS を使わず、純粋な BLE 電波の物理的到達のみで「すれ違い」を検出する。
Android / desktop では **Advertise Service Data / Scan** で `user_id` を交換し、iOS では通常アプリの CoreBluetooth 制約に合わせて **Service UUID 検出 + GATT read fallback** で同じ `user_id` を取得する。プロフィール本体の取得は [profile-sync.md](profile-sync.md) のクラウド同期に委譲する。

## 2. ユーザーストーリー
- ユーザーとして、アプリをポケットに入れたまま街を歩くだけで、近くを通った他ユーザーの `user_id` がローカルに記録されてほしい。
- ユーザーとして、自分の位置情報は一切外部に取得されない安心感が欲しい。
- ユーザーとして、すれ違いの "成立" が確実であってほしい。

## 3. スコープ
### In Scope
- BLE Advertise の起動・停止（自端末の `user_id` を Android では Service Data、iOS では GATT read characteristic に乗せる）
- BLE Scan の起動・停止（他端末の Service UUID をフィルタにして `user_id` を抽出）
- Service UUID によるアプリ識別
- 受信した `user_id` と受信時刻を **`encounter_logs`** に保存（`users_cache` への書き込みは行わない — それは [profile-sync.md](profile-sync.md) の責務）
- 同一 `user_id` に対するクールダウン制御（既定 8 時間）
- ローカル DB への記録（[db-schema.sql](../contracts/db-schema.sql)）

### Out of Scope
- プロフィール本体（display_name / avatar_code / message）の交換 → [profile-sync.md](profile-sync.md)
- 中央サーバーへのすれ違い履歴のアップロード
- 位置情報（GPS / CoreLocation）の利用
- BLE 以外のチャネル（Wi-Fi Direct、UWB 等）

## 4. 仕様詳細

### 4.1 Service UUID
アプリ専用の Service UUID は以下で固定する。Advertise の Service Data
Service UUID 兼 Scan のフィルタとして使う。

- `SERVICE_UUID`: `4a985948-3bc6-450b-80d2-04a8f98f83cb`
- `USER_ID_CHARACTERISTIC_UUID`: `4a985948-3bc6-450b-80d2-04a8f98f83cc`

Rust 側の正本は `src-tauri/src/ble/mod.rs` の `SERVICE_UUID` 定数。native plugin 側も同じ UUID を使う。

### 4.2 Advertise ペイロード
- **Service Data フィールドに 16 byte (バイナリ)** で `user_id`（Supabase Auth で発行された UUID）を乗せる。
- スキーマは [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)。
- 文字列形式（標準 UUID、ハイフン区切り 36 文字）はログ・ローカル DB・Supabase で使用するが、BLE 上はバイナリ 16 byte で送る。
- BLE 4 Legacy Advertise の Service Data 上限（〜26 byte）に余裕で収まる。

### 4.2.1 iOS / Android native 実装
- 実装は `src-tauri/plugins/tauri-plugin-encounter-ble`。
- Android: `BluetoothLeAdvertiser` で `SERVICE_UUID` を advertise し、GATT characteristic で 16 byte `user_id` を公開する。128-bit Service UUID の Service Data に 16 byte `user_id` を載せると BLE Legacy Advertise の 31 byte 枠を超えるため、現行実装では GATT read fallback を主経路にする。
- iOS: CoreBluetooth の通常アプリ制約により任意 Service Data advertise は使わず、`SERVICE_UUID` advertise + `USER_ID_CHARACTERISTIC_UUID` read characteristic で `user_id` を公開する。
- Scanner は Service Data があれば即時保存し、無い場合は短時間だけ GATT 接続して characteristic を読む。現行 mobile 実装では Service UUID advertise + GATT read が標準経路。
- この fallback はプロフィール交換には使わない。交換する値は引き続き `user_id` のみ。

### 4.3 動作モード

| モード | スキャン頻度 | アドバタイズ頻度 | 起動条件 |
| --- | --- | --- | --- |
| 通常時 | OS 任せ（バックグラウンド） | OS 任せ（バックグラウンド） | アプリ起動後、明示的停止まで継続 |
| ウォークモード | 高頻度（フォアグラウンド） | 高頻度（フォアグラウンド） | [walk-mode.md](walk-mode.md) 参照 |

### 4.4 受信時の処理

```
on_advertisement_received(service_data):
  user_id = parse_user_id(service_data_or_gatt_characteristic)
  if user_id is invalid: return  # スキーマ違反は破棄

  encounter_record_received_user_id(user_id, seen_at)
    -> Rust 側で UUID 検証 / 自己ID除外 / クールダウン / insert を行う
  # users_cache への書き込みは行わない。fetch されるまでは「ID だけ知ってる」状態
```

`encounter_logs` への保存は UI / TypeScript 層ではなく Rust command
`encounter_record_received_user_id` を正規入口にする。native plugin は検出イベントを
短期キューにも積み、foreground 復帰時に `ble_drain_pending_encounters` で同じ
Rust 保存経路へ流す。これにより WebView が寝ている間のイベント取りこぼしを減らす。
短期キューは最大 256 件。Android は `PendingIntent` scan / `BroadcastReceiver` で
プロセス復帰した検出を SharedPreferences に短期保存し、次回 `ble_drain_pending_encounters`
で Rust 保存経路へ流す。iOS は CoreBluetooth 復元時の plugin メモリキューを使う。

### 4.5 クールダウン
- 同一 `user_id` との 2 回目以降の受信は、前回 `encounter_logs.encountered_at` から `COOLDOWN_SEC` 経過後にのみ新規ログとして記録する。
- 既定値: `COOLDOWN_SEC = 8 * 60 * 60`（8 時間）
- 開発・テスト時には `COOLDOWN_SEC = 60`（1 分）等に短縮できるよう、`app_settings` テーブルで切替可能にする。
- クールダウン中の再受信は何もしない（カウントもしない、ログも増やさない）。
- `users_cache.encounter_count` のインクリメントは [profile-sync.md](profile-sync.md) のフェッチ完了時に `encounter_logs` を集計して反映する。

### 4.6 状態遷移

```
[Idle]
  --start--> [Advertising + Scanning]
[Advertising + Scanning]
  --advertisement_received--> [Persist (insert encounter_logs)]
                              --> [Advertising + Scanning]
[Advertising + Scanning]
  --bt_off--> [Waiting]
[Waiting]
  --bt_on--> [Advertising + Scanning]
[Advertising + Scanning]
  --stop--> [Idle]
```

### 4.7 iOS バックグラウンドの仕様（明文化）
- iOS では Service UUID 指定の Scan はバックグラウンドでも動作するが、頻度は OS が決定する。
- iOS バックグラウンドの Advertise は Service UUID が **Overflow Area** に押し込まれ、**他の iOS 端末からのみ検出可能**（Android からは見えにくい）。
- **方針**: バックグラウンドでの検出は確率的なものとして受け入れ、**確実な検出はウォークモード推奨** と UI で案内する。
- 詳細は [walk-mode.md](walk-mode.md) を参照。

### 4.8 エラー処理
- BLE 権限拒否 → UI 側に明示エラーを返し、ユーザーに権限再要求を促す
- Bluetooth OFF → 待機状態に入り、ON 検知でリトライ
- Service Data のスキーマ違反（16 byte でない、UUID として不正等）→ 破棄。ログは残す（不正端末検知用）

## 5. 受入基準
- [ ] 2 台の端末を近づけたとき、双方の `encounter_logs` に 1 件ずつエントリが追加される
- [ ] 検出から DB 書き込みまで 1 秒以内に完了する（Service Data 経路）
- [ ] iOS fallback 経路では GATT read 完了後に DB 書き込みされる
- [ ] 同じ相手と連続して近づいてもクールダウン中はログが増えない
- [ ] クールダウン経過後の再受信でログが追加される
- [ ] アプリがバックグラウンドにある状態でも iOS↔iOS でのすれ違いが成立する（OS 制約の範囲で）
- [ ] GPS / 位置情報パーミッションを一切要求しない
- [ ] 受信ペイロードが 16 byte でない場合は破棄され、DB が破損しない
- [ ] BLE OFF → ON 復帰で自動的に Advertise / Scan が再開する
- [ ] `users_cache.encounter_count` の更新は本仕様では行わず、[profile-sync.md](profile-sync.md) 側で反映される

## 6. 依存・関連
- 上流: [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json), [contracts/db-schema.sql](../contracts/db-schema.sql)
- 下流: [profile-sync.md](profile-sync.md)（受信した user_id をプロフィールに紐付ける）, [encounter-popup.md](encounter-popup.md), [encounter-plaza.md](encounter-plaza.md), [walk-mode.md](walk-mode.md)

## 7. オープン課題

### 解消済み
- ~~Service UUID の確定~~ → `4a985948-3bc6-450b-80d2-04a8f98f83cb` (§4.1)
- ~~Android 12+ の `BLUETOOTH_ADVERTISE` / `BLUETOOTH_SCAN` 権限フロー~~
  → [`docs/contracts/android/AndroidManifest.snippet.xml`](../contracts/android/AndroidManifest.snippet.xml) に
  雛形を用意。`BLUETOOTH_SCAN` には `neverForLocation` を明示する (要件定義 §6 の
  位置情報非取得を担保)。`tauri android init` 実行後、生成された
  `AndroidManifest.xml` の `<manifest>` 直下にマージする運用。
- ~~iOS バックグラウンド対応~~ → `Info.plist` に `UIBackgroundModes`
  (`bluetooth-central` / `bluetooth-peripheral`) を設定済み。実測検出率は
  実機テストで計測する。
- ~~iOS / Android Native BLE プラグインの実装~~
  ([要件定義 §7 Phase 1.5](../要件定義.md))
  - `tauri-plugin-encounter-ble` を実装し、`BleBackend::TauriPlugin`
    バリアントを追加。mobile では未指定時に自動採用する。

### 残課題
- [ ] iPhone / Android 実機の相互検出テスト
  - Android APK build は通過済み。
  - iOS simulator bundle / iPhoneOS `.ipa` build は通過済み。
  - 残りは署名済み実機インストールと、端末間の advertise / scan / fallback GATT read の実測。
- [ ] 同時に複数の `user_id` が検出された場合のキューイング戦略
  - 現状: btleplug 側で 5 秒の dedup window のみ。実機計測後に再検討

### 将来の高速化オプション

現行 mobile 実装は、通常アプリ権限で成立しやすい `Service UUID advertise + GATT read`
を標準経路にする。COCOA / Exposure Notification のような広告パケット完結型は
Apple/Google の OS 特権 API と 16-bit Service UUID (`0xFD6F`) に依存しており、
通常アプリでは同等のバックグラウンド性能を前提にしない。

ただし、特に Android 同士では次の高速経路を追加できる余地がある。

- Android / desktop: Manufacturer Data に短い `app_magic` / `version` / `short_id`
  / checksum を載せ、GATT 接続なしで即時検出する。
- iOS: CoreBluetooth 制約により、引き続き Service UUID 検出 + GATT read を基本にする。
- 共通: RSSI が弱すぎる相手は GATT read しない、GATT timeout を通常時と
  ウォークモードで分ける、既知 peripheral への再接続を短時間抑止する。

この高速経路を採用する場合、`short_id` から `user_id` / 公開プロフィールへどう
安全に到達するかを別仕様で定義する必要がある。固定 hash は追跡可能性が高いため、
日替わり・時間替わり token や鍵設計を検討する。ただし「すれ違い履歴をサーバーへ
アップロードしない」方針と衝突しないことを必須条件にする。
