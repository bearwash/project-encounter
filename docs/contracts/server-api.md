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

## 6. Non-Goals

- `POST /encounters`
- `GET /encounters`
- server-side encounter matching
- push notification delivery
- location or proximity storage
