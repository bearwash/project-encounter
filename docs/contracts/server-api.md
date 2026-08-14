# Server API Contract

> 関連: [specs/server-side.md](../specs/server-side.md) / [specs/profile-sync.md](../specs/profile-sync.md) / [supabase-schema.sql](supabase-schema.sql)

この契約は、将来 Supabase 直結を API サーバーに置き換える場合の互換 API を定義する。
MVP では Supabase JS SDK がこの契約相当の処理を直接実行する。

## 1. 共通

- Base URL: 未定
- Auth: `Authorization: Bearer <access_token>`
- Content-Type: `application/json`
- 時刻: ISO 8601 UTC
- UUID: Supabase Auth UUID と同一

サーバーはすれ違い履歴を受け取らない。`encountered_at`、`encounter_count`、`last_seen_at` などは request に含めてはいけない。

## 2. 型

### PublicProfile

```ts
type PublicProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  home_prefecture: string | null;
  updated_at: string;
};
```

### ProfileUpsertRequest

```ts
type ProfileUpsertRequest = {
  display_name: string;
  avatar_code: string;
  message: string;
  home_prefecture: string | null;
};
```

### ProfileResolveRequest

```ts
type ProfileResolveRequest = {
  user_ids: string[];
};
```

### ProfileResolveResponse

```ts
type ProfileResolveResponse = {
  profiles: PublicProfile[];
  missing_user_ids: string[];
};
```

`missing_user_ids` は未公開、削除済み、存在しない UUID を区別しない。

## 3. Endpoints

### `GET /v1/me`

現在の認証ユーザー ID とプロフィール有無を返す。

Response 200:

```json
{
  "user_id": "00000000-0000-0000-0000-000000000000",
  "profile": null
}
```

### `PUT /v1/me/profile`

自分の公開プロフィールを作成または更新する。

Request:

```json
{
  "display_name": "Aki",
  "avatar_code": "b01_h02_o03_f01",
  "message": "こんにちは",
  "home_prefecture": "13"
}
```

Response 200:

```json
{
  "profile": {
    "user_id": "00000000-0000-0000-0000-000000000000",
    "display_name": "Aki",
    "avatar_code": "b01_h02_o03_f01",
    "message": "こんにちは",
    "home_prefecture": "13",
    "updated_at": "2026-06-06T00:00:00Z"
  }
}
```

Rules:

- `user_id` は auth token から決める。request body で受け取らない。
- `display_name`、`avatar_code`、`message`、`home_prefecture` はアプリ側 validation と同じ制約を server-side でも検証する。
- 同じ内容で複数回送っても成功する。

### `POST /v1/profiles/resolve`

BLE で得た `user_id` 配列から公開プロフィールを一括取得する。

Request:

```json
{
  "user_ids": [
    "00000000-0000-0000-0000-000000000000"
  ]
}
```

Response 200:

```json
{
  "profiles": [
    {
      "user_id": "00000000-0000-0000-0000-000000000000",
      "display_name": "Aki",
      "avatar_code": "b01_h02_o03_f01",
      "message": "こんにちは",
      "home_prefecture": "13",
      "updated_at": "2026-06-06T00:00:00Z"
    }
  ],
  "missing_user_ids": []
}
```

Rules:

- `user_ids` は 1〜100 件。
- 重複 ID はサーバー側で dedupe してよい。
- request body を永続化しない。
- response order は保証しない。クライアントは `user_id` で対応付ける。

### `DELETE /v1/me/profile`

自分の公開プロフィールを削除する。

Response 204: body なし。

Rules:

- プロフィール削除後もローカルの過去ログ処理は端末側責務。
- Auth user 自体の削除は別 endpoint として扱う。

### `DELETE /v1/me`

現在の認証アカウントと、それに結び付く公開プロフィール・ウォレットを削除する。
Supabase 構成では `supabase/functions/delete-account` が同等の境界になる。

Response 204: body なし。

Rules:

- Bearer token から削除対象を決める。body の user ID は信用しない。
- `auth.users` の削除により `profiles` は `ON DELETE CASCADE` で削除する。
- 本番ウォレットを別サービスに置く場合、そのサービスの残高・購入関連データも同一処理で削除または法定保持へ分離する。
- すれ違い履歴は端末内だけにあるため、クライアントがローカル DB を消去する。

### `GET /v1/wallet`

現在の認証ユーザーの本番コイン残高を返す。ユーザー ID は Bearer token から決める。

Response 200:

```json
{ "balance": 650 }
```

### `POST /v1/purchases/verify`

StoreKit / Google Play Billing が返した購入証明を検証し、消耗型コインを付与する。

Request:

```json
{
  "platform": "ios",
  "productId": "com.projectencounter.coins.120",
  "transactionId": "opaque-store-transaction-id",
  "receipt": "opaque-store-signed-payload"
}
```

Response 200:

```json
{ "accepted": true, "balance": 120 }
```

Rules:

- Apple / Google のサーバー API で署名、商品、購入状態、環境を検証してから付与する。
- 付与量と商品状態はサーバーの商品台帳から決め、クライアント値を信用しない。
- `(platform, transactionId)` を一意にし、同じリクエストは二重付与せず同じ残高を返す。
- Google Play の consumable は付与確定後に purchase token を consume / acknowledge する。
- 認証ユーザーとストア transaction の紐付けを監査ログへ残すが、レシート全文を通常ログへ出さない。

### `POST /v1/purchases/restore`

端末ストアから再取得した購入証明を再検証し、サーバー台帳と残高を照合する。消耗型商品の再付与はせず、未処理 transaction だけを冪等に反映する。

Response 200:

```json
{ "accepted": true, "balance": 650 }
```

## 4. Error

```ts
type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
```

代表コード:

| HTTP | code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | JSON / UUID / validation error |
| 401 | `unauthorized` | token missing or invalid |
| 403 | `forbidden` | own profile constraint violation |
| 413 | `too_many_ids` | `user_ids` が 100 件超過 |
| 429 | `rate_limited` | rate limit |
| 500 | `internal` | unexpected server error |

## 5. Supabase 対応表

| Contract | Supabase direct implementation |
| --- | --- |
| `GET /v1/me` | `auth.getUser()` + `profiles.select().eq('id', user.id).maybeSingle()` |
| `PUT /v1/me/profile` | `profiles.upsert({ id: auth.uid(), ... })` |
| `POST /v1/profiles/resolve` | `profiles.select(...).in('id', user_ids)` |
| `DELETE /v1/me/profile` | `profiles.delete().eq('id', auth.uid())` |
| `GET /v1/wallet` / purchase endpoints | 認証付き購入検証サービス（Supabase Edge Function または専用API） |

## 6. Non-Goals

- `POST /encounters`
- `GET /encounters`
- server-side encounter matching
- push notification delivery
- location or proximity storage
