# BLE Handshake — すれ違い検出（ID-only Advertise / Scan）

> 関連: [要件定義 §4.1, §4.2](../要件定義.md) / [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json) / [profile-sync.md](profile-sync.md)

## 1. ゴール (What & Why)
GPS を使わず、純粋な BLE 電波の物理的到達のみで「すれ違い」を検出する。
**接続は行わず、Advertise / Scan のみで `user_id` を交換する**ことで、検出時間を最短（数百 ms 以下）に抑え、すれ違い成功率と iOS バックグラウンド耐性を最大化する。プロフィール本体の取得は [profile-sync.md](profile-sync.md) のクラウド同期に委譲する。

## 2. ユーザーストーリー
- ユーザーとして、アプリをポケットに入れたまま街を歩くだけで、近くを通った他ユーザーの `user_id` がローカルに記録されてほしい。
- ユーザーとして、自分の位置情報は一切外部に取得されない安心感が欲しい。
- ユーザーとして、すれ違いの "成立" が確実であってほしい（GATT 接続のような不安定な要素が入らない）。

## 3. スコープ
### In Scope
- BLE Advertise の起動・停止（自端末の `user_id` を Service Data に乗せる）
- BLE Scan の起動・停止（他端末の Service UUID をフィルタにして `user_id` を抽出）
- Service UUID によるアプリ識別
- 受信した `user_id` と受信時刻を **`encounter_logs`** に保存（`users_cache` への書き込みは行わない — それは [profile-sync.md](profile-sync.md) の責務）
- 同一 `user_id` に対するクールダウン制御（既定 8 時間）
- ローカル DB への記録（[db-schema.sql](../contracts/db-schema.sql)）

### Out of Scope
- GATT 接続（このプロジェクトでは行わない）
- プロフィール本体（display_name / avatar_code / message）の交換 → [profile-sync.md](profile-sync.md)
- 中央サーバーへのすれ違い履歴のアップロード
- 位置情報（GPS / CoreLocation）の利用
- BLE 以外のチャネル（Wi-Fi Direct、UWB 等）

## 4. 仕様詳細

### 4.1 Service UUID
アプリ専用の Service UUID は以下で固定する。Advertise の Service Data
Service UUID 兼 Scan のフィルタとして使う。

- `SERVICE_UUID`: `4a985948-3bc6-450b-80d2-04a8f98f83cb`

Rust 側の正本は `src-tauri/src/ble/mod.rs` の `SERVICE_UUID` 定数。

### 4.2 Advertise ペイロード
- **Service Data フィールドに 16 byte (バイナリ)** で `user_id`（Supabase Auth で発行された UUID）を乗せる。
- スキーマは [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)。
- 文字列形式（標準 UUID、ハイフン区切り 36 文字）はログ・ローカル DB・Supabase で使用するが、BLE 上はバイナリ 16 byte で送る。
- BLE 4 Legacy Advertise の Service Data 上限（〜26 byte）に余裕で収まる。

### 4.3 動作モード

| モード | スキャン頻度 | アドバタイズ頻度 | 起動条件 |
| --- | --- | --- | --- |
| 通常時 | OS 任せ（バックグラウンド） | OS 任せ（バックグラウンド） | アプリ起動後、明示的停止まで継続 |
| ウォークモード | 高頻度（フォアグラウンド） | 高頻度（フォアグラウンド） | [walk-mode.md](walk-mode.md) 参照 |

### 4.4 受信時の処理

```
on_advertisement_received(service_data):
  user_id = parse_user_id(service_data)
  if user_id is invalid: return  # スキーマ違反は破棄

  last = db.last_encounter_at(user_id)
  if last and (now - last) < COOLDOWN_SEC:
    return  # クールダウン中は無視

  db.insert(encounter_logs {
    encountered_user_id: user_id,
    encountered_at: now,
    is_read: false
  })
  # users_cache への書き込みは行わない。fetch されるまでは「ID だけ知ってる」状態
```

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
- [ ] 検出から DB 書き込みまで 1 秒以内に完了する（GATT 接続を伴わない）
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
  Phase 1.5 の Native プラグイン実装後に計測する。

### 残課題 (Phase 1.5)
- [ ] iOS / Android Native BLE プラグインの実装
  ([要件定義 §7 Phase 1.5](../要件定義.md))
  - 現状: btleplug が iOS/Android 非対応のため、mobile では mock fallback
  - 解決: `tauri-plugin-encounter-ble` を新規実装し、`BleBackend::TauriPlugin`
    バリアントを追加 → mobile では自動採用
- [ ] 同時に複数の `user_id` が検出された場合のキューイング戦略
  - 現状: btleplug 側で 5 秒の dedup window のみ。実機計測後に再検討
