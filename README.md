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

仕様の書き方ガイドは [`docs/specs/README.md`](docs/specs/README.md) を参照。

---

## ディレクトリ構成

```
.
├── docs/
│   ├── 要件定義.md           # プロダクト要件（プロダクトオーナー視点）
│   ├── specs/               # 機能単位の仕様
│   │   ├── README.md
│   │   ├── ble-handshake.md
│   │   ├── encounter-popup.md
│   │   ├── encounter-list.md
│   │   ├── profile.md
│   │   └── walk-mode.md
│   └── contracts/           # フロント↔バックの境界定義
│       ├── ble-payload.schema.json
│       ├── db-schema.sql
│       └── tauri-commands.md
├── src/                     # Next.js (App Router) — UI 層
│   ├── app/                 # ルーティング
│   ├── components/          # 汎用 UI プリミティブ
│   ├── features/            # 機能単位 (spec と 1:1)
│   │   ├── encounter/
│   │   ├── profile/
│   │   └── walk-mode/
│   ├── lib/
│   │   ├── tauri/           # invoke ラッパ
│   │   └── db/              # ローカル DB ヘルパ
│   └── types/               # contracts から導出する TS 型
├── src-tauri/               # Rust — コアロジック層
│   ├── src/
│   │   ├── ble/             # BLE advertise / scan / payload
│   │   ├── db/              # SQLite repository / migrations
│   │   ├── commands/        # Tauri invoke ハンドラ
│   │   └── domain/          # ドメインモデル
│   └── migrations/          # SQL マイグレーション
└── public/
    └── avatars/             # アバターパーツ画像
```

---

## 技術スタック

- **アプリ**: Tauri v2 (iOS / Android)
- **UI**: Next.js (App Router) + React + Tailwind CSS + @tanstack/react-query
- **コア**: Rust（BLE: CoreBluetooth / Android Bluetooth API、SQLite アクセス）
- **DB**: SQLite (Tauri Plugin SQL)
- **パッケージマネージャ**: pnpm

---

## セットアップ

```bash
pnpm install                # 依存解決
pnpm tauri dev              # WebView 起動（初回は数分、以降は数秒）
pnpm typecheck              # TS 整合チェック
(cd src-tauri && cargo check)  # Rust 整合チェック
```

開発サーバはポート **1420** で起動（Tauri 慣習に合わせて固定。3000 衝突回避）。

### モバイル init（未実施）

```bash
pnpm tauri ios init         # Xcode + Apple Developer Team の選択
pnpm tauri android init     # 要 ANDROID_HOME / JAVA_HOME / Android Studio
```

iOS rustup targets は導入済み (`aarch64-apple-ios{,-sim}`, `x86_64-apple-ios`)。
Android 環境はまだ。

---

## 現在の進捗

**Phase 1 (MVP) — UI 縦串完了、BLE 未着手**

### ✅ 完了

| 機能 | spec | 検証ルート |
| --- | --- | --- |
| プロフィール設定 + 初回起動誘導 | [profile.md](docs/specs/profile.md) | `/profile` |
| エンカウント履歴リスト | [encounter-list.md](docs/specs/encounter-list.md) | `/` |
| 連続エンカウントポップアップ | [encounter-popup.md](docs/specs/encounter-popup.md) | dev panel → seed → Cmd+R |
| ウォークモード（wake lock + 長押し終了） | [walk-mode.md](docs/specs/walk-mode.md) | `/walk` |
| SQLite + migration + Tauri Plugin SQL 配線 | [db-schema.sql](docs/contracts/db-schema.sql) | 起動時に自動 |

### ⏳ 未着手 / 次のセッション候補

- **BLE プロトタイプ** ([ble-handshake.md](docs/specs/ble-handshake.md))
  - Rust 側 advertise / scan の trait + mock 実装
  - Tauri command 配線 ([tauri-commands.md](docs/contracts/tauri-commands.md) の `ble.*`)
  - mock peer 発見 → DB 保存 → ポップアップ発火のフルループ
  - その後、実機 BLE 実装（CoreBluetooth / Android Bluetooth）
- **モバイル init** (`pnpm tauri ios init` 等)
- **アバター本実装**（要件 §7 Phase 2。現状は色帯プレースホルダ）

### 既知の落とし穴

- **`tauri-plugin-sql` の permission は細粒度**: `sql:default` だけだと execute/select が拒否される。`capabilities/default.json` で `sql:allow-load` / `sql:allow-execute` / `sql:allow-select` / `sql:allow-close` を明示すること。
- **Tauri エラーは `string` で reject**: `error instanceof Error` が false になるので、`asError(e)` ヘルパで Error にラップしてから React Query に渡す（`src/features/*/queries.ts` 参照）。
- **dev server ポートは 1420 固定**: `package.json` の `dev: next dev -p 1420` と `tauri.conf.json` の `devUrl` を一致させる。
