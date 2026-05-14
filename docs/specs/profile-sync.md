# Profile Sync — Supabase 経由のプロフィール同期

> 関連: [要件定義 §2, §4.1, §4.3, §6](../要件定義.md) / [ble-handshake.md](ble-handshake.md) / [profile.md](profile.md) / [encounter-popup.md](encounter-popup.md) / [encounter-plaza.md](encounter-plaza.md)

## 1. ゴール (What & Why)
BLE で交換するのは `user_id` のみという ID-only ハイブリッド方式（[ble-handshake.md](ble-handshake.md)）の片割れとして、**`user_id` ↔ 公開プロフィール (display_name / avatar_code / message)** を同期する。

- 自プロフィールを Supabase の `users` テーブルに **PUT** する。
- すれ違った相手の `user_id` リストから、Supabase に **未取得分の一括 GET** をかけてローカル `users_cache` に保存する。
- **オフライン時は何も表示しない**。完璧な状態（名前・アバター・メッセージ揃い）で初めて広場と対面挨拶に登場する。

## 2. ユーザーストーリー
- ユーザーとして、自分のプロフィールを変更したらすぐに他のユーザーに見える状態になってほしい。
- ユーザーとして、オフライン中はすれ違ったログだけ溜まり、オンラインに戻ったときに「完成された姿」で挨拶してほしい。
- ユーザーとして、自分のプロフィールがクラウドに上がる前に明確な同意を求めてほしい。
- ユーザーとして、「すれ違いの履歴」がクラウドに上がっていないことを保証してほしい。

## 3. スコープ
### In Scope
- Supabase クライアントの初期化と認証（匿名 Auth）
- 自プロフィールの PUT（保存ボタンで即同期）
- 未取得 `user_id` 一覧に対する一括 GET（IN クエリ）
- 取得結果を `users_cache` に UPSERT
- `encounter_logs` を集計して `users_cache.encounter_count` を反映
- 初回起動時の **公開同意ダイアログ**
- オフライン時のキューイングとリトライ

### Out of Scope
- すれ違い履歴のアップロード（行わない）
- 友達申請・チャット・フォロー（後フェーズ）
- プロフィール削除以外の高度な権限管理（Phase 2 以降）

## 4. データフロー（高レイヤ）

```
[BLE 受信]                    [Foreground 復帰]
    ↓                              ↓
encounter_logs.insert        unread_user_ids = SELECT DISTINCT
(is_read=false)              encountered_user_id FROM encounter_logs
                             WHERE encountered_user_id NOT IN
                               (SELECT user_id FROM users_cache)
                                  ↓
                             Supabase GET /users?user_id=in.(...)
                                  ↓                  ↓
                             [success]            [offline/error]
                                  ↓                  ↓
                             users_cache UPSERT   exponential backoff retry
                                  ↓
                             encounter_logs と JOIN して
                             encounter_count を更新
                                  ↓
                             EncounterPopup へ進む
```

## 5. 仕様詳細

### 5.1 Supabase スキーマと RLS

```sql
-- profiles : 公開プロフィール名簿（履歴は一切持たない）
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  avatar_code  TEXT NOT NULL,                   -- b{NN}_h{NN}_o{NN}_f{NN}
  message      TEXT,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 必須
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 参照: 認証済みユーザーは全行参照可（スクレイピング防止のため anon は不可）
CREATE POLICY "誰でもプロフィールを参照できる"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 作成: 自分のレコードのみ
CREATE POLICY "自分のプロフィールのみ作成できる"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 更新: 自分のレコードのみ
CREATE POLICY "自分のプロフィールのみ更新できる"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 削除: 自分のレコードのみ（退会用）
CREATE POLICY "自分のプロフィールのみ削除できる"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);
```

> 命名注: ローカル DB では `user_id` カラム名を使うが、Supabase 側は Auth との結合を素直に表すため `id` カラム名を採用する（SQL 慣習）。両者が指す値は **同じ UUID** で、Supabase Auth が初回発行したものを永続的に共有する。

### 5.2 認証
- Supabase の **匿名 Auth (Anonymous Sign-in)** を使用。
- 初回起動時に `supabase.auth.signInAnonymously()` を呼び、返された UUID をそのまま `my_profile.user_id` に保存する（短縮や派生は行わない）。
- BLE Advertise の Service Data には、この UUID をバイナリ 16 byte で送出する（[ble-handshake.md](ble-handshake.md) §4.2）。
- セッショントークン（refresh token 等）は Tauri Secure Storage（または OS Keychain）に保存。
- 端末再インストール時はリストアしない方針（[[architecture-id-only-ble-cloud-sync]] 参照、Phase 2 で SNS リカバリー検討）。

### 5.3 自プロフィール PUT
プロフィール画面（[profile.md](profile.md)）で「保存」を押した瞬間に Supabase へ即同期する。

```ts
// Next.js / TypeScript 想定
async function saveProfile(profile: MyProfile) {
  validate(profile);
  await localDb.upsert("my_profile", profile);         // ローカル先行

  try {
    await supabase.from("profiles").upsert({
      id: profile.user_id,                              // = auth.uid()
      display_name: profile.display_name,
      avatar_code: profile.avatar_code,
      message: profile.message,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (isNetworkError(err)) {
      enqueueRetry(profile);                            // 送信キューに保存
    } else {
      throw err;
    }
  }
}
```

オフライン時は送信キューに積み、オンライン復帰時に最新値だけを 1 回 PUT する（古いキューは捨てる）。

### 5.4 未取得 `user_id` の一括 fetch

#### 5.4.1 トリガー
- アプリがフォアグラウンドになった直後
- BLE スキャンで新しい `user_id` を受信し、かつアプリがフォアグラウンドのとき（最大 30 秒間隔のデバウンス）

#### 5.4.2 クエリ
```sql
-- 未取得のもの = encounter_logs にあるが users_cache にない user_id
SELECT DISTINCT encountered_user_id
FROM encounter_logs
WHERE encountered_user_id NOT IN (SELECT user_id FROM users_cache);
```

これを Supabase JS SDK で実行する:

```ts
async function fetchEncounteredProfiles(ids: string[]) {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_code, message, updated_at")
    .in("id", ids);                                    // 一括 IN クエリ

  if (error) {
    console.error("プロフィールの取得に失敗:", error);
    return [];
  }
  return data;
}
```

1 リクエストあたり最大 100 件。それを超える場合は配列をチャンク分割（Supabase の URL 長制限対策）。

#### 5.4.3 受信結果の反映
```
on_fetch_success(rows):
  for row in rows:
    localDb.upsert("users_cache", {
      user_id: row.id,                                  -- profiles.id をローカルでは user_id と呼ぶ
      display_name: row.display_name,
      avatar_code: row.avatar_code,
      message: row.message ?? "",
      first_seen_at: localDb.min_encountered_at(row.id),
      last_seen_at:  localDb.max_encountered_at(row.id),
      encounter_count: localDb.count_logs(row.id)
    })
```

`encounter_count` は `encounter_logs` を集計してその場で再計算する（クールダウン制御で重複ログは入らない前提）。

### 5.5 オフライン時の振る舞い
- ネットワーク到達不可のときは fetch を実行しない。
- `users_cache` に未登録の `user_id` を持つ `encounter_logs.is_read=false` の行は、**対面挨拶ポップアップにも広場にも一切出さない**（[encounter-popup.md](encounter-popup.md) §5.1, [encounter-plaza.md](encounter-plaza.md) §4.x）。
- ユーザーには「オフラインのため、新しい出会いの情報を取得できません」のような **控えめなトースト** を 1 回だけ出す（連発しない）。
- オンライン復帰検知（`navigator.onLine` イベントや Tauri 側の network status）で fetch を再試行。
- リトライ戦略: 指数バックオフ（5 秒 → 30 秒 → 5 分 → 30 分 → 上限）。バックグラウンドでも条件が許せば実施。

### 5.6 オンライン復帰時のフロー
1. 未取得 `user_id` 一覧をクエリ。
2. fetch 成功 → `users_cache` に UPSERT。
3. **次回フォアグラウンド復帰時** に対面挨拶ポップアップが起動し、完璧な状態（名前・アバター・メッセージ揃い）で挨拶が始まる。
4. 同時に広場ビューにも住人として現れる。

### 5.7 公開同意ダイアログ（初回起動時）

初回起動時、プロフィール設定の前に表示する。

```
┌──────────────────────────────────────────┐
│ プロフィールを公開しますか？              │
│                                          │
│ あなたの「名前・アバター・一言メッセージ」│
│ はサーバーに保存され、すれ違った相手の  │
│ アプリに表示されます。                    │
│                                          │
│ ・「誰といつ会ったか」の履歴は           │
│   端末内にだけ残り、サーバーには         │
│   送信されません。                        │
│ ・位置情報は一切取得しません。            │
│                                          │
│ 後から非公開・退会することもできます。   │
│                                          │
│           [同意して始める]               │
│           [今は始めない]                  │
└──────────────────────────────────────────┘
```

- 「同意して始める」 → プロフィール設定画面へ。Supabase 認証を実施。
- 「今は始めない」 → アプリは起動するが BLE / Supabase の機能はオフ（プロフィール設定画面のみ閲覧可能）。
- 同意は `app_settings` テーブルに `cloud_profile_consent_at` として記録。

### 5.8 退会・削除
- プロフィール画面の最下部に「アカウント削除」を配置。
- 押下で確認ダイアログ → Supabase `profiles` から自身の行を DELETE → ローカル DB も初期化。
- BLE は停止。`user_id` は失効する（再起動で新規 UUID 発行）。

### 5.9 エラー処理
- 認証失敗 → 1 回だけ無人再認証を試行。失敗したらユーザーに明示エラー。
- レート制限（429）→ Retry-After ヘッダに従ってバックオフ。
- 部分失敗（一部 user_id だけ取得できなかった）→ 取得できた分だけ users_cache に保存。残りは次回再試行。

## 6. 受入基準
- [ ] 初回起動時に公開同意ダイアログが表示され、同意なしには BLE / Supabase が起動しない
- [ ] 同意後にプロフィールを保存すると、即座に Supabase の `users` テーブルに反映される
- [ ] 別端末ですれ違うと、相手のプロフィールが Supabase 経由で取得され、`users_cache` に入る
- [ ] オフライン時にすれ違っても、`encounter_logs` には保存されるが、ポップアップ / 広場には一切出ない
- [ ] オンライン復帰後、未取得の `user_id` が一括取得され、次回フォアグラウンド復帰時にポップアップが起動する
- [ ] アカウント削除を実行すると Supabase の自分の行が消え、ローカル DB も初期化される
- [ ] 同意ダイアログで「今は始めない」を選んでも、アプリ自体はクラッシュせず最低限の UI を提供する
- [ ] すれ違い履歴は Supabase に一切送信されない（ネットワーク監視で確認）
- [ ] レート制限を受けても自動的にバックオフして再試行する

## 7. 依存・関連
- 上流: [ble-handshake.md](ble-handshake.md)（user_id を受信する側）, [profile.md](profile.md)（自プロフィールの編集）
- 下流: [encounter-popup.md](encounter-popup.md), [encounter-plaza.md](encounter-plaza.md)（fetch 完了したものだけ表示）
- 関連: [contracts/db-schema.sql](../contracts/db-schema.sql)

## 8. オープン課題
- [ ] レート制限超過時のフォールバック UI
- [ ] チャンクサイズ（1 リクエスト 100 件）の妥当性検証
- [ ] Phase 2 で SNS / Email リカバリーを導入するときのマイグレーション設計
- [ ] 公開同意ダイアログのコピー文言の最終確定（特に法的観点）

### 解消済み（参考）
- ~~RLS の SELECT 公開範囲~~ → **認証済みのみ SELECT 可** に確定（§5.1）
- ~~匿名 Auth 永続化方法~~ → **諦める。再インストール = 新生スタート** で確定
- ~~プロフィール非公開モード~~ → **MVP では不要**（公開 or 退会の 2 択）
- ~~アバター素材ホスティング~~ → **クライアント同梱**（[avatar.md](avatar.md)）

## 9. 実装状況

| 項目 | 状況 |
| --- | --- |
| supabase-js クライアント + 匿名 Auth | ✅ src/lib/supabase/{client,auth}.ts |
| profiles upsert / single fetch / bulk fetch / delete | ✅ src/lib/supabase/profiles.ts |
| `profile_fetch_remote` (Rust mock) | ✅ Supabase 未設定時のフォールバック |
| 公開同意ダイアログ (cloud_profile_consent_at) | ✅ pending / granted / declined の 3 値、§5.7 通り |
| 自プロフィール PUT + オフライン send queue (§5.3) | ✅ 簡易リトライ (起動時 + visibility 復帰時に flush) |
| 退会・削除 (§5.8) | ✅ Supabase delete + local DB 初期化 |
| Supabase スキーマ + RLS デプロイ用 SQL | ✅ docs/contracts/supabase-schema.sql |
| 指数バックオフ・全自動リトライ (§5.5) | ❌ Phase 2 |
| トースト UI (§5.5) | ❌ Phase 2 |
