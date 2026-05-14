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
- **コア**: Rust (BLE: btleplug @ macOS、CoreBluetooth/Android Bluetooth は Phase 1.5)
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

# 生成された AndroidManifest.xml に Bluetooth 権限を追加:
# docs/contracts/android/AndroidManifest.snippet.xml の内容を <manifest> 直下にマージ

pnpm tauri android dev                       # エミュレータ / 実機で起動
```

---

## 現在の進捗 (2026-05 時点)

### ✅ Phase 1 完了

| カテゴリ | 状態 |
|---|---|
| UI / 体験 (対面挨拶 / 広場 / プロフィール / ウォークモード) | 全機能実装済み |
| Supabase 連携 (匿名 Auth / RLS / 同意 / 一括 fetch / バックオフ + トースト) | 実装済み |
| ローカル DB (SQLite + migration 0001 / 0002) | 実装済み |
| 実 BLE Scan (btleplug @ macOS) | 実装済み |
| iOS プロジェクト + Bluetooth 権限 + 縦固定 | 生成済み |
| Android Manifest 雛形 (`docs/contracts/android/`) | 用意済み |

### ⏳ Phase 1.5: iOS / Android Native BLE プラグイン

`btleplug` は iOS/Android 非対応のため、Mobile では mock fallback で動作する
(= UI / Supabase は実機で確認できるが、実すれちがいは擬似発火)。実機 BLE を
動かすには Tauri Mobile プラグインを実装する必要がある。

残課題:
- `pnpm tauri plugin new tauri-plugin-encounter-ble --android --ios`
- iOS Swift で `CoreBluetooth` Central + Peripheral
- Android Kotlin で `BluetoothLeScanner` + `BluetoothLeAdvertiser`
- `BleBackend::TauriPlugin` バリアントを追加して mobile では自動採用
- 実機 (iPhone × 2, Android × 1 程度) でキャンパス内テスト

詳細は [`docs/specs/ble-handshake.md`](docs/specs/ble-handshake.md) §7 を参照。

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
# 未指定は対応 OS なら btleplug、iOS/Android は mock fallback

# Supabase mock モード
# .env.local の URL/ANON_KEY を空にすると Rust の profile_fetch_remote にフォールバック
```

### 既知の落とし穴

- **`output: 'export'` の Next.js**: `pnpm build` 後は `.next` / `out` を削除しないと `pnpm dev` がキャッシュ衝突する
- **`tauri-plugin-sql` の permission**: `capabilities/default.json` に `sql:allow-load` / `sql:allow-execute` / `sql:allow-select` / `sql:allow-close` を明示
- **Tauri エラーは `string`**: `error instanceof Error` が false になるので `asError(e)` でラップ
- **dev server ポート 1420 固定**: `package.json` の `dev: next dev -p 1420` と `tauri.conf.json` の `devUrl` を一致
- **SSR で `Math.random()` / `Date.now()` 禁止**: hydration mismatch を起こす。`useEffect` 内で生成して `setState` する (例: `SakuraPetals`)
