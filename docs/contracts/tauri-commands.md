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
| `ble.start` | `ble_start` | ✅ btleplug (desktop) / native plugin (iOS/Android) / mock fallback |
| `ble.stop` | `ble_stop` | ✅ |
| `ble.walkStart` | `ble_walk_mode_start` | ✅ |
| `ble.walkStop` | `ble_walk_mode_stop` | ✅ |
| `ble.status` | `ble_status` | ✅ `backend` フィールドで実装種別を返す |
| `ble.drainPending` | `ble_drain_pending_encounters` | ✅ native plugin の短期キューを SQLite へ反映 |
| `profile.get` | `profile_get` | ✅ SQLite (`my_profile`) |
| `profile.save` | `profile_save` | ✅ SQLite (`my_profile`) |
| — | `profile_fetch_remote` | ✅ Supabase の代用 mock (Phase 2 で置換) |
| — | `encounter_record_received_user_id` | ✅ UUID 検証 + 自己ID除外 + クールダウン + SQLite insert |
| `encounter.listUnread` | `encounter_list_unread` | ✅ SQLite (`encounter_logs` + `users_cache`) |
| `encounter.markRead` | `encounter_mark_read` | ✅ SQLite (`encounter_logs`) |
| `encounter.listHistory` | `encounter_list_history` | ✅ SQLite (`users_cache`) |
| `settings.getCooldownSec` | `settings_get_cooldown_sec` | ✅ SQLite (`app_settings`) |
| `settings.setCooldownSec` | `settings_set_cooldown_sec` | ✅ SQLite (`app_settings`) |

非同期イベント (Rust → TS) は Tauri event を使う:

| event 名 | payload | 用途 |
| --- | --- | --- |
| `ble://encounter-found` | `BlePayload = { user_id: string, seen_at?: number }` | mock / btleplug 共通で peer 発見を通知 |
| plugin `encounter-ble` / `encounter-found` | `BlePayload = { user_id: string, seen_at?: number }` | iOS / Android native plugin から peer 発見を通知 |

**バックエンド切り替え**: 環境変数 `BLE_BACKEND=mock` で mock 強制、`btleplug` で btleplug 強制、`tauri-plugin` で iOS / Android native plugin 強制。未指定だと desktop は btleplug、iOS / Android は tauri-plugin、それ以外では mock fallback。

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
  home_prefecture: string | null;
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
| `home_prefecture` | string \| null | 任意、`"01"`〜`"47"` または `null` |

**戻り値**: 更新後の `MyProfile`

---

## エンカウント (`encounter.*`)

### `encounter_record_received_user_id`
BLE で受信した `user_id` を `encounter_logs` に保存する唯一の正規入口。
UUID 検証、自己ID除外、`cooldown_sec`、完全重複排除を Rust 側の transaction で処理する。
`users_cache` は更新しない。

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `user_id` | string (UUID) | BLE / native plugin で受信した相手ID |
| `encountered_at` | number \| null | 検出時刻 unix sec。null なら Rust 側の現在時刻 |

**戻り値**: `boolean` (`true` = 新規 insert、`false` = 重複 / クールダウン / 自己ID)

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
    home_prefecture: string | null;
    encounter_count: number;
    first_seen_at: number;
    last_seen_at: number;
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
  home_prefecture: string | null;
  encounter_count: number;
  first_seen_at: number;
  last_seen_at: number;
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
  backend: 'mock' | 'btleplug' | 'tauri-plugin'; // どの実装で動いているか
  bluetooth_on: boolean;
  permission_granted: boolean;
  advertise_active: boolean;      // btleplug では現状常に false
  scan_active: boolean;
  seen_count: number;             // native plugin が短期 dedup window 内で見た peer 数
  last_error: string | null;      // native BLE 起動/advertise/scan/GATT の直近エラー
};
```

### `ble.drain_pending_encounters`
native plugin 側の短期キューに残っている検出済み `user_id` を Rust 側へ drain し、
`encounter_logs` へ反映する。戻り値は新規 insert 件数。クールダウン中・自己ID・完全重複
(`user_id` + `encountered_at`) は Rust 側で捨てる。

**戻り値**: `number`

### iOS / Android native plugin

mobile target では `ble_start` / `ble_walk_mode_start` が現在の `my_profile.user_id` を読み、`tauri-plugin-encounter-ble` の native `start` を呼ぶ。plugin の permission identifier は `encounter-ble:default`。

native plugin は `SERVICE_UUID = 4a985948-3bc6-450b-80d2-04a8f98f83cb` を advertise / scan filter に使い、`USER_ID_CHARACTERISTIC_UUID = 4a985948-3bc6-450b-80d2-04a8f98f83cc` を mobile の GATT read に使う。128-bit Service UUID + 16 byte user_id の Service Data は BLE Legacy Advertise のサイズ上限を超えるため、mobile は Service UUID advertise + GATT read を標準経路にする。

native plugin は検出イベントを最大 256 件のメモリ内短期キューにも積む。WebView が
イベントを取りこぼした場合でも、foreground 復帰時に `ble_drain_pending_encounters`
で Rust 保存経路へ流す。プロセス終了時の永続保証はしない。

plugin listener と mobile permission request のため、`encounter-ble:default` は
`allow-registerListener` / `allow-removeListener` / `allow-checkPermissions` /
`allow-requestPermissions` を含む。

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
  home_prefecture: string | null;
} | null;
```

未登録なら `null`。Rust 側の mock は固定マッピングを返す。フロント TS の
`fetchRemoteProfile` (src/lib/tauri/profile.ts) は **環境変数で切り替え**:

- `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` 設定済み + サインイン済み:
  Supabase の `profiles` テーブルから fetch (src/lib/supabase/profiles.ts)
- それ以外: この Rust mock コマンドへフォールバック (デバッグ用)

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
