# Server Side — 公開プロフィール同期と将来拡張

> 関連: [要件定義 §4.1, §4.3, §6](../要件定義.md) / [profile-sync.md](profile-sync.md) / [ble-handshake.md](ble-handshake.md) / [contracts/server-api.md](../contracts/server-api.md) / [contracts/supabase-schema.sql](../contracts/supabase-schema.sql)

## 1. ゴール (What & Why)

Project Encounter のサーバーサイドは、BLE で受け取った `user_id` から公開プロフィールを解決するための「公開プロフィール名簿」を提供する。

MVP では Supabase (Auth + Postgres + RLS) をサーバーサイドとして扱う。アプリ独自の API サーバーは、MVP の必須条件ではない。

## 2. 原則

- すれ違い履歴はアップロードしない。
- 位置情報、GPS、基地局、Wi-Fi SSID、BLE の RSSI 履歴はアップロードしない。
- サーバーが保持してよいのは、ユーザーが公開同意したプロフィールと認証情報だけ。
- BLE で交換する ID は Supabase Auth UUID と同じ値にする。
- サーバー障害やオフライン時も、BLE 受信ログは端末ローカルにだけ保存される。
- プロフィール取得が完了していない相手は、対面挨拶にも広場にも表示しない。

## 3. スコープ

### In Scope

- Anonymous Auth によるユーザー UUID 発行
- 自プロフィールの作成・更新・削除
- `user_id` 配列から公開プロフィールを一括取得
- RLS による「自分のプロフィールだけ更新可能」制約
- クライアント側のオフラインキューとリトライを受け止められる冪等 API
- 将来 Go などの自前バックエンドへ移行できる API 契約の固定

### Out of Scope

- すれ違い履歴のサーバー保存
- 「誰が誰と会ったか」の照合
- プッシュ通知
- チャット、フレンド、フォロー
- 位置情報に基づく近接判定
- 管理画面、分析基盤、広告計測

## 4. フェーズ

### Phase 1: Supabase 直結

現行アプリは Supabase JS SDK で次を直接実行する。

- `auth.signInAnonymously()`
- `profiles.upsert()`
- `profiles.select().in('id', ids)`
- `profiles.delete().eq('id', myUserId)`

この段階では別リポジトリのサーバーは作らない。運用対象は Supabase project と SQL schema だけ。

### Phase 1.5: Thin API Server

別リポジトリまたは `server/` ディレクトリに薄い API サーバーを置く。

役割:

- Supabase を隠蔽する互換 API を提供する
- rate limit、request validation、監査ログを追加する
- クライアントから Supabase SDK 依存を外せるようにする

制約:

- API サーバーもすれ違い履歴を受け取らない
- encounter log 風の endpoint は作らない
- 受け取る ID 配列はプロフィール解決のためだけに使い、保存しない

### Phase 2: 自前バックエンド

Supabase を置き換える場合は、[contracts/server-api.md](../contracts/server-api.md) を互換契約として Go などで実装する。

候補:

- Go + PostgreSQL
- OpenAPI から TypeScript client を生成
- JWT または匿名 device token ベース認証

## 5. データモデル

### `profiles`

公開プロフィール。サーバーに保存してよい唯一のユーザー可視データ。

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | Auth user id。BLE payload の `user_id` と同じ |
| `display_name` | text | yes | 表示名 |
| `avatar_code` | text | yes | `bNN_hNN_oNN_fNN` |
| `message` | text | no | 一言メッセージ |
| `home_prefecture` | text | no | `"01"`〜`"47"` or null |
| `updated_at` | timestamp | yes | server generated |

### 保存しないデータ

- `encounter_logs`
- `encountered_at`
- `is_read`
- `first_seen_at`
- `last_seen_at`
- `encounter_count`
- RSSI
- scan timestamp list
- foreground/background 状態履歴

これらは端末ローカル SQLite の責務。

## 6. セキュリティ / プライバシー要件

- `SELECT profiles` は認証済みユーザーのみ許可する。
- `INSERT/UPDATE/DELETE profiles` は `auth.uid() = id` のみ許可する。
- API サーバーを挟む場合も、同じ制約を server-side で検証する。
- `POST /profiles/resolve` に渡された ID 配列は永続化しない。
- server logs に request body を出さない。
- rate limit は user 単位と IP 単位の両方を持つ。
- response はプロフィール未公開・削除済みユーザーを単に欠落として返す。

## 7. リポジトリ方針

MVP は同一リポジトリのまま進める。

別リポジトリに切る条件:

- API サーバーを Supabase 以外で常時運用する
- OpenAPI 生成 client を CI で配布する
- サーバーに独立した deploy pipeline が必要になる
- モバイルアプリと別チーム/別 cadence で開発する

別リポジトリ名の候補:

- `project-encounter-server`
- `project-encounter-api`

同一リポジトリで始める場合の候補:

- `server/`
- `apps/api/`
- `packages/api-client/`

## 8. 受入基準

- [ ] Supabase の anonymous sign-in で UUID が発行され、ローカル `my_profile.user_id` に保存される
- [ ] プロフィール保存時に `profiles` が upsert される
- [ ] `user_id[]` から公開プロフィールを 100 件単位で一括取得できる
- [ ] 未公開・削除済みユーザーは response に含まれず、クライアントは表示しない
- [ ] すれ違い履歴がネットワーク request に含まれない
- [ ] SQL/RLS を再実行しても壊れない
- [ ] API サーバーを挟む場合でも `contracts/server-api.md` と同じ入出力になる

## 9. オープン課題

- Thin API Server を Phase 1.5 で作るか、Phase 2 まで Supabase 直結にするか。
- Supabase Auth session を OS keychain に移すか、現状の WebView localStorage にするか。
- 退会時に auth user 自体を削除する管理 API を用意するか。
