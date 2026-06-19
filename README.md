# Project Encounter

BLE による物理的すれ違いを再現する、位置情報非依存のアバターアプリ。

詳細は [`docs/要件定義.md`](docs/要件定義.md) を参照。

---

## 開発方針: 仕様駆動開発 (Spec-Driven Development)

実装の前に、機能ごとの仕様 (`docs/specs/`) と契約 (`docs/contracts/`) を確定させる。
コードはこの仕様への準拠物として扱い、仕様とコードが乖離した場合は **仕様を真実とみなして** 修正方針を決める。

### サイクル

1. **要件** — `docs/要件定義.md`（プロダクト全体の合意）
2. **仕様** — `docs/specs/<feature>.md`（機能単位の WHAT/HOW/受入基準）
3. **契約** — `docs/contracts/*`（型・スキーマ・API。フロントとバックエンドの境界）
4. **実装** — `src/`（Next.js / TypeScript） + `src-tauri/`（Rust）
5. **検証** — 受入基準で確認 → 仕様 or 実装を更新

---

## 技術スタック

- **アプリ**: Tauri v2 (macOS デスクトップ + iOS / Android)
- **UI**: Next.js (App Router) + React + Tailwind CSS + @tanstack/react-query
- **コア**: Rust (BLE: btleplug @ desktop、CoreBluetooth / Android Bluetooth は Tauri mobile plugin)
- **DB ローカル**: SQLite (Tauri Plugin SQL)
- **DB クラウド**: Supabase (Postgres + 匿名 Auth + RLS)
- **パッケージマネージャ**: pnpm

---

## セットアップ

### 0. 環境変数 (Supabase)

```bash
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を埋める
# 未設定でも mock モード (Rust 側 profile_fetch_remote) で動作
```

Supabase 側のスキーマは [`docs/contracts/supabase-schema.sql`](docs/contracts/supabase-schema.sql) を Studio SQL Editor に貼って実行。Authentication > Providers で **Anonymous sign-ins を有効化**。

サーバーサイドの責務と、将来 Supabase 直結を API サーバーへ置き換える場合の契約は [`docs/specs/server-side.md`](docs/specs/server-side.md) と [`docs/contracts/server-api.md`](docs/contracts/server-api.md) を参照。

ローカル契約検査:

```bash
pnpm server:check
```

サーバー側の実機不要 preflight:

```bash
pnpm server:preflight
```

Supabase 実プロジェクトの疎通確認:

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... pnpm server:smoke
```

`server:smoke` は anonymous sign-in、プロフィール upsert / resolve / delete、RLS による他人プロフィール更新拒否、DB 制約による不正プロフィール拒否まで確認する。

### 1. 依存解決 / 整合チェック

```bash
pnpm install
pnpm typecheck
(cd src-tauri && cargo check)
```

### 2. 開発サーバ (デスクトップ / WebView)

```bash
pnpm dev          # ブラウザで http://localhost:1420 (UI のみ、SQLite なし)
pnpm tauri:dev    # Tauri WebView (デスクトップアプリ、SQLite + 実 BLE @ macOS)
```

### 3. iOS ビルド

```bash
# 初回のみ
pnpm tauri ios init       # Xcode プロジェクトを src-tauri/gen/apple に生成
                          # (cocoapods 必須: brew install cocoapods)

# 開発実行
pnpm tauri ios dev        # シミュレータで起動
pnpm tauri ios dev --host # 実機 (要 Apple Developer Team)
```

iOS 環境:
- Xcode 15+ (現状 26.x で確認済)
- rustup target: `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `x86_64-apple-ios`
- `cocoapods` (`brew install cocoapods`)
- 実機ビルドには `tauri.conf.json > bundle > iOS > developmentTeam` か `APPLE_DEVELOPMENT_TEAM` env

`src-tauri/gen/` は gitignore されるため、`tauri ios init` のたびに以下のスニペットを **手動マージ** してください:

- [`docs/contracts/ios/Info.plist.snippet`](docs/contracts/ios/Info.plist.snippet) — Bluetooth 権限文 + 縦固定 + UIBackgroundModes
- [`docs/contracts/ios/project.yml.snippet`](docs/contracts/ios/project.yml.snippet) — CoreBluetooth.framework 依存追加

手動で書き込む場所:

1. `src-tauri/gen/apple/project_encounter_iOS/Info.plist` を開く
2. `<dict>` の中に [`docs/contracts/ios/Info.plist.snippet`](docs/contracts/ios/Info.plist.snippet) の `<key>...` 一式を追加する
3. `src-tauri/gen/apple/project.yml` を開く
4. `targets > project_encounter_iOS > info > properties` に [`docs/contracts/ios/project.yml.snippet`](docs/contracts/ios/project.yml.snippet) の `UISupportedInterfaceOrientations` / `NSBluetoothAlwaysUsageDescription` / `UIBackgroundModes` を追加する
5. 同じ `targets > project_encounter_iOS > dependencies` に `CoreBluetooth.framework` を追加する

`pnpm tauri ios init` をやり直すと `src-tauri/gen/apple` が再生成されるため、この書き込みもやり直してください。

### 4. Android ビルド

Android Studio + SDK + NDK が要る。手順:

```bash
brew install --cask android-studio          # GUI でセットアップ完了させる
# Android Studio > More Actions > SDK Manager で:
#   - Android SDK (API 34 以上)
#   - Android SDK Platform-Tools
#   - NDK (Side by side)
#   - Android SDK Command-line Tools

# 環境変数
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<version>"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

# Rust target
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

# Tauri Android プロジェクト生成
pnpm tauri android init

pnpm tauri android dev                       # エミュレータ / 実機で起動
```

`src-tauri/gen/` は gitignore されるため、`tauri android init` のたびに Android 権限も **手動マージ** してください。

手動で書き込む場所:

1. `src-tauri/gen/android/app/src/main/AndroidManifest.xml` を開く
2. `<manifest>` の直下に [`docs/contracts/android/AndroidManifest.snippet.xml`](docs/contracts/android/AndroidManifest.snippet.xml) の `<uses-permission>` と `<uses-feature>` を追加する
3. 既存の `<application>` の中に、同じ snippet の `<service>` と `<receiver>` を追加する
4. `<application>` を二重に作らないこと。snippet 内の `<application>` は「この中身を既存 application へ移す」ための目印として扱う

追加される主な権限は Bluetooth scan / advertise / connect、Foreground Service、通知権限です。位置情報は使わない方針なので、`BLUETOOTH_SCAN` には `android:usesPermissionFlags="neverForLocation"` を付けたままにしてください。

### 5. サーバーなしですれ違い ID 取得を確認する

Supabase なしでも、BLE で相手の `user_id` を受信してローカル SQLite の `encounter_logs` に保存できるかは確認できます。相手の名前・アバター・メッセージ解決はサーバー側の役割なので、この手順では確認対象外です。

手順:

1. 2台の端末にアプリを入れる
2. 初回の公開同意ダイアログは、サーバーなし確認だけなら `いまは始めない` でもよい
3. それぞれプロフィールを1回保存して、端末内の `my_profile.user_id` を作る
4. ホーム右下の `?` を押して Dev パネルを開く
5. BLE パネルで `開始` を押す
6. 両端末の Bluetooth 権限を許可する
7. `SEEN` が増えるか、`ID 取得` に相手の UUID が出るか確認する
8. `SERVERLESS CHECK` の `ローカルDB記録済み` に UUID が出れば、サーバーなしのすれ違い ID 保存は成功

見方:

- `ID 取得`: native BLE plugin が直近で受信した相手 UUID
- `SERVERLESS CHECK`: SQLite の `encounter_logs` に保存済みの UUID
- `PEND`: native plugin 側に溜まっていて、まだ Rust/SQLite 側へ drain されていない件数
- `GATT`: GATT read 待ちの件数
- `DRAIN`: pending から SQLite へ取り込んだ直近件数

同じ相手はクールダウン中だと `SEEN` は増えても `encounter_logs` には追加されません。連続テストしたい場合は Dev パネルの `クリア` で履歴を消すか、時間を空けてください。

---

## 現在の進捗 (2026-06 時点)

### ✅ Phase 1 完了

| カテゴリ | 状態 |
|---|---|
| UI / 体験 (対面挨拶 / 広場 / プロフィール / ウォークモード) | 全機能実装済み |
| Supabase 連携 (匿名 Auth / RLS / 同意 / 一括 fetch / バックオフ + トースト) | 実装済み |
| ローカル DB (SQLite + migration 0001 / 0002) | 実装済み |
| 実 BLE Scan (btleplug @ desktop) | 実装済み |
| iOS プロジェクト + Bluetooth 権限 + 縦固定 | 生成済み |
| Android Manifest / BLE permission | plugin 側に実装済み |

### ✅ Phase 1.5: iOS / Android Native BLE プラグイン

`btleplug` は iOS/Android 非対応のため、Mobile では `tauri-plugin-encounter-ble`
を使う。Android は Service Data + GATT characteristic、iOS は CoreBluetooth の
制約に合わせて Service UUID advertise + GATT read fallback で `user_id` を交換する。

実装済み:
- `src-tauri/plugins/tauri-plugin-encounter-ble` に iOS Swift / Android Kotlin plugin を追加
- `BleBackend::TauriPlugin` を追加し、mobile では未指定時に自動採用
- native plugin event を既存の encounter 保存フローへ接続
- Android debug APK build は通過済み
- iOS simulator bundle / iPhoneOS `.ipa` build は通過済み

残課題:
- 実機 (iPhone × 2, Android × 1 程度) で相互検出テスト
- iOS 実機インストールには Apple Developer Team / signing 設定が必要

詳細は [`docs/specs/ble-handshake.md`](docs/specs/ble-handshake.md) §7 を参照。
実機検証手順は [`docs/specs/ble-real-device-test.md`](docs/specs/ble-real-device-test.md) を参照。

### Phase 2 (要件定義 §7)

- アバター完全 3D 化 (R3F + glTF)
- LLM ベースの会話生成
- 表情軸 / アクセサリ軸の拡張

### Phase 3 (要件定義 §7)

- AVATAVI STORE プラットフォーム
- Go 自前バックエンド (Supabase 置換)
- 着せ替え販売

---

## 開発時 Tips

### dev preview ページ (Tauri 不要、ブラウザで動作)

| URL | 用途 |
|---|---|
| `/encounter-preview` | 対面挨拶シーンを iPhone 13 サイズ枠で確認 |
| `/plaza-preview` | 広場ビューを 0/1/8/32/60 人で確認、合流アニメ再生 |
| `/avatar-preview` | アバターパーツの組み合わせ確認 |

`process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES=0` で本番無効化。

### バックエンド切り替え

```bash
# BLE 実装
BLE_BACKEND=mock pnpm tauri:dev      # mock peer ループ強制
BLE_BACKEND=btleplug pnpm tauri:dev  # btleplug (macOS) 強制
BLE_BACKEND=tauri-plugin pnpm tauri:dev  # mobile native plugin 強制
# 未指定は desktop なら btleplug、iOS/Android は tauri-plugin

# Supabase mock モード
# .env.local の URL/ANON_KEY を空にすると Rust の profile_fetch_remote にフォールバック
```

### 既知の落とし穴

- **`output: 'export'` の Next.js**: `pnpm build` 後は `.next` / `out` を削除しないと `pnpm dev` がキャッシュ衝突する
- **`tauri-plugin-sql` の permission**: `capabilities/default.json` に `sql:allow-load` / `sql:allow-execute` / `sql:allow-select` / `sql:allow-close` を明示
- **Tauri エラーは `string`**: `error instanceof Error` が false になるので `asError(e)` でラップ
- **dev server ポート 1420 固定**: `package.json` の `dev: next dev -p 1420` と `tauri.conf.json` の `devUrl` を一致
- **SSR で `Math.random()` / `Date.now()` 禁止**: hydration mismatch を起こす。`useEffect` 内で生成して `setState` する (例: `SakuraPetals`)
