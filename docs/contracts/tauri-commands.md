# Tauri Commands — Frontend ↔ Rust 契約

フロント (Next.js / TypeScript) が Rust コア (`src-tauri/`) を呼び出すための `invoke` API 定義。
ここに無い `invoke` 呼び出しは追加しない。追加する場合は本ドキュメントを先に更新する。

呼び出し規約:
- TS 側: `@tauri-apps/api/core` の `invoke(name, args)`
- Rust 側: `#[tauri::command]` 関数として実装し、`tauri::Builder::default().invoke_handler(tauri::generate_handler![...])` に登録
- 実コマンド名は **Rust 関数名をそのまま** 使う（snake_case）。ドット表記の `ble.start` 等は **TS 側ラッパ** での見せ方 (`src/lib/tauri/*.ts`)。

エラーは `Result<T, String>` を返し、TS 側で `Promise.reject` として扱う（メッセージは string）。

| ドット表記 (TS) | コマンド名 (実装) | 実装状況 |
| --- | --- | --- |
| `ble.start` | `ble_start` | ✅ btleplug (macOS/Linux/Windows) / mock fallback |
| `ble.stop` | `ble_stop` | ✅ |
| `ble.walkStart` | `ble_walk_mode_start` | ✅ |
| `ble.walkStop` | `ble_walk_mode_stop` | ✅ |
| `ble.status` | `ble_status` | ✅ `backend` フィールドで実装種別を返す |
| — | `profile_fetch_remote` | ✅ Supabase の代用 mock (Phase 2 で置換) |

非同期イベント (Rust → TS) は Tauri event を使う:

| event 名 | payload | 用途 |
| --- | --- | --- |
| `ble://encounter-found` | `BlePayload = { user_id: string }` | mock / btleplug 共通で peer 発見を通知 |

**バックエンド切り替え**: 環境変数 `BLE_BACKEND=mock` で mock 強制、`btleplug` で btleplug 強制、未指定だと対応 OS では btleplug、それ以外では mock fallback。

---

## プロフィール (`profile.*`)

### `profile.get`
自分のプロフィールを取得する。未設定なら `null` を返す。

| 引数 | 型 | 説明 |
| --- | --- | --- |
| なし | — | — |

**戻り値**
```ts
type MyProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  updated_at: number; // unix sec
} | null;
```

### `profile.save`
自分のプロフィールを保存（UPSERT）。保存後、BLE モジュールへ通知し advertise ペイロードを更新。

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `display_name` | string | 必須、最大 16 文字 |
| `avatar_code` | string | 必須、最大 64 文字 |
| `message` | string | 任意、最大 30 文字 |

**戻り値**: 更新後の `MyProfile`

---

## エンカウント (`encounter.*`)

### `encounter.list_unread`
未読のすれ違いをすべて取得（古い順）。

**戻り値**
```ts
type UnreadEncounter = {
  log_id: number;
  user: {
    user_id: string;
    display_name: string;
    avatar_code: string;
    message: string;
    encounter_count: number;
  };
  encountered_at: number;
};
type Result = UnreadEncounter[];
```

### `encounter.mark_read`
1 件のエンカウントを既読にする。

| 引数 | 型 |
| --- | --- |
| `log_id` | number |

**戻り値**: `void`

### `encounter.list_history`
すれ違い相手の一覧（既読 + 未読を含む全件）。最終遭遇日時の降順。

**戻り値**
```ts
type HistoryItem = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  encounter_count: number;
  last_encountered_at: number;
};
type Result = HistoryItem[];
```

---

## BLE 制御 (`ble.*`)

### `ble.start`
通常モードで advertise + scan を開始する。

**戻り値**: `void`

### `ble.stop`
advertise + scan を停止する。

**戻り値**: `void`

### `ble.walk_mode_start`
高頻度モード（ウォークモード）に切り替える。

**戻り値**: `void`

### `ble.walk_mode_stop`
高頻度モードを終了し、通常モードに戻す。

**戻り値**: `void`

### `ble.status`
現在のモードと統計情報を取得。

**戻り値**
```ts
type BleStatus = {
  mode: 'idle' | 'normal' | 'walk';
  backend: 'mock' | 'btleplug';   // どの実装で動いているか
  bluetooth_on: boolean;
  permission_granted: boolean;
  advertise_active: boolean;      // btleplug では現状常に false (§4.7)
  scan_active: boolean;
};
```

---

## プロフィール取得 (`profile.*`)

### `profile_fetch_remote`
他ユーザーの公開プロフィールを取得 (Supabase 連携の代用 mock)。
spec: docs/specs/profile-sync.md §5.4

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `user_id` | string (UUID) | 取得対象 |

**戻り値**
```ts
type RemoteProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;     // b{NN}_h{NN}_o{NN}_f{NN}
  message: string;
} | null;
```

未登録なら `null`。本実装は mock で常に固定マッピングを返す。Phase 2 で
Supabase REST `.in("id", [...])` 一括 fetch に置き換える。

---

## 設定 (`settings.*`)

### `settings.get_cooldown_sec`
クールダウン秒数を取得（既定 28800）。

**戻り値**: `number`

### `settings.set_cooldown_sec`
クールダウン秒数を上書き（テスト用）。

| 引数 | 型 |
| --- | --- |
| `sec` | number |

**戻り値**: `void`

---

## エラー型

```ts
type AppError = {
  code:
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'BLE_PERMISSION_DENIED'
    | 'BLE_BLUETOOTH_OFF'
    | 'DB_ERROR'
    | 'INTERNAL';
  message: string;
};
```
