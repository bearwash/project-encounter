# Profile — 自己プロフィール設定

> 関連: [要件定義 §3.2 C, §5 my_profile](../要件定義.md) / [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)

## 1. ゴール (What & Why)
ユーザーがすれ違いの「相手」として何を見せるかを設定する画面。
BLE で送出するペイロードの源泉であり、ここで決まった値がすべての他端末に届く。

## 2. ユーザーストーリー
- ユーザーとして、自分の表示名・アバター・一言メッセージを設定したい。
- ユーザーとして、設定を変えたらすぐ次のすれ違いに反映されてほしい。

## 3. スコープ
### In Scope
- `display_name` / `avatar_code` / `message` の編集と保存
- 初回起動時の必須入力（`user_id` 自動生成）
- 入力バリデーション（長さ・禁止文字）
- 保存後は即座に BLE advertise ペイロードへ反映

### Out of Scope
- SNS 連携、外部アカウント認証
- アバターパーツの動的購入（[要件定義 §7 Phase 3](../要件定義.md)）
- プロフィール画像のアップロード（アバターはパーツコードで表現）

## 4. 仕様詳細

### 4.1 `user_id` の生成
- 初回起動時に UUID v4 を 1 回だけ生成し、`my_profile.user_id` に保存
- 以降は不変。再インストールで新規 ID 扱い
- BLE ペイロードでは先頭 8 文字程度に短縮しても良いが、衝突確率を要検証 → [ble-payload.schema.json](../contracts/ble-payload.schema.json) と整合させる

### 4.2 入力項目

| 項目 | 必須 | 最大長 | 備考 |
| --- | --- | --- | --- |
| `display_name` | ✅ | 16 文字 | 改行不可 |
| `avatar_code` | ✅ | 64 文字 | `base01_top03_bot02` 形式 |
| `message` | ❌ | 30 文字 | 改行不可、空文字許容 |

### 4.3 バリデーション
- 制御文字（`\n`, `\t` 等）禁止
- 絵文字の扱いは UTF-8 文字数で 1 文字としてカウント
- 空白のみの `display_name` は不可

### 4.4 アバターパーツ
- パーツ ID の組み合わせで見た目を決定（`base / top / bottom / accessory` 等）
- 利用可能パーツの定義は `public/avatars/` に画像 + マニフェスト形式で配置（マニフェスト仕様は別途）
- 未知のパーツコードを受信した場合、UI 側でデフォルトパーツにフォールバック

### 4.5 保存と即時反映
保存ボタン押下時:
1. バリデーション通過確認
2. `my_profile` テーブルを UPSERT
3. BLE モジュールに通知 → 次回 advertise から新ペイロードを使用

## 5. 受入基準
- [ ] 初回起動時、プロフィール未設定なら必ず設定画面に誘導される
- [ ] `user_id` がアプリ再起動後も保持される
- [ ] 各項目の最大長を超える入力は保存できない（or 切り詰められる）
- [ ] 保存後、次に送出される BLE ペイロードに新しい値が反映される
- [ ] 未知の `avatar_code` を持つ相手を表示してもクラッシュしない

## 6. 依存・関連
- 上流: [contracts/db-schema.sql](../contracts/db-schema.sql), [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)
- 下流: [ble-handshake.md](ble-handshake.md), [encounter-popup.md](encounter-popup.md)

## 7. オープン課題
- [ ] アバターパーツのマニフェスト仕様
- [ ] `user_id` を 8 文字に短縮するか、フル UUID を使うか
- [ ] 名前重複時の表示（ID で区別する UI を出すか）
