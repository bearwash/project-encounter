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
- ゲスト開始と、編集開始時の明示ログイン（Auth UUID を `user_id` に使用）
- 入力バリデーション（長さ・禁止文字）
- 保存後は即座に BLE advertise ペイロードへ反映

### Out of Scope
- フレンド、フォロー、チャット等の SNS 機能
- アバターパーツの動的購入（[要件定義 §7 Phase 3](../要件定義.md)）
- プロフィール画像のアップロード（アバターはパーツコードで表現）

## 4. 仕様詳細

### 4.1 `user_id` の生成と公開同意
- 初回起動はゲストとし、ホーム閲覧にログインやプロフィール入力を要求しない。
- 工房・プロフィール編集・タワーを開く時に Apple / Google / メールの明示ログインを求める（開発ビルドのみテストログイン可）。
- ログイン後、Supabase Auth が返す **非 anonymous の UUID をそのまま `my_profile.user_id` に保存**する。短縮や派生は行わない。
- 公開同意とコミュニティルール同意が完了するまでは BLE advertise / Supabase 公開を開始しない。
- 同じアカウントでは端末を替えても同じ UUID を使う。
- BLE Advertise の Service Data は **この UUID をバイナリ 16 byte で送出**する（[contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json), [ble-handshake.md](ble-handshake.md) §4.2）。

### 4.2 入力項目

| 項目 | 必須 | 最大長 | 備考 |
| --- | --- | --- | --- |
| `display_name` | ✅ | 16 文字 | 改行不可 |
| `avatar_code` | ✅ | 15 文字（固定） | `b{NN}_h{NN}_o{NN}_f{NN}` 形式。詳細は [avatar.md](avatar.md) §3.2 |
| `message` | ❌ | 30 文字 | 改行不可、空文字許容 |
| `home_prefecture` | ❌ | 2 文字（固定） | ISO 3166-2:JP 下 2 桁 (`"01"`〜`"47"`) or null（= 未設定 / 非公開）。詳細は [regional-map.md](regional-map.md) |

### 4.3 バリデーション
- 制御文字（`\n`, `\t` 等）禁止
- 絵文字の扱いは UTF-8 文字数で 1 文字としてカウント
- 空白のみの `display_name` は不可

### 4.4 アバターパーツ
- パーツ ID の組み合わせで見た目を決定（`base / hair / outfit / face` の 4 軸、各 4 種、合計 256 通り）
- 描画は SVG パーツの重ね合わせ + CSS アニメ + 軽い 2.5D 立体感（グラデ・シャドウ・ハイライト）。詳細は [avatar.md](avatar.md)
- 編集 UI（AvatarEditor）は [avatar.md](avatar.md) §8 を参照。Framer Motion で「ポンッ」と弾むおもちゃ箱感
- 利用可能パーツの定義は `public/avatars/manifest.json`（仕様は [avatar.md](avatar.md) §3.5）
- 未知のパーツコードを受信した場合、UI 側でデフォルトパーツにフォールバック（クラッシュ禁止）

### 4.5 保存と即時反映
保存ボタン押下時:
1. バリデーション通過確認
2. ローカル `my_profile` テーブルを UPSERT
3. **Supabase の `users` テーブルに即 PUT**（[profile-sync.md](profile-sync.md) §5.3）
4. オフライン時は送信キューに積み、オンライン復帰で再送

> 注: BLE Advertise には `user_id` のみが乗る（[ble-handshake.md](ble-handshake.md)）。プロフィール本体は Supabase 経由で他端末に伝わるため、保存後の反映タイミングは「相手がフォアグラウンドに復帰したとき」になる。

## 5. 受入基準
- [x] 初回起動はゲストでホームを表示し、工房・プロフィール編集・タワーだけログインを要求する
- [ ] `user_id` がアプリ再起動後も保持される
- [ ] 各項目の最大長を超える入力は保存できない（or 切り詰められる）
- [ ] 保存後、次に送出される BLE ペイロードに新しい値が反映される
- [ ] 未知の `avatar_code` を持つ相手を表示してもクラッシュしない

## 6. 依存・関連
- 上流: [contracts/db-schema.sql](../contracts/db-schema.sql), [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)
- 下流: [ble-handshake.md](ble-handshake.md), [encounter-popup.md](encounter-popup.md)

## 7. オープン課題
- [ ] 名前重複時の表示（ID で区別する UI を出すか）
- [ ] アバター編集 UI のレイアウト（パーツプレビュー + 軸切替）
