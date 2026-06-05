# Specs — 機能仕様書

このディレクトリには、機能単位の仕様書を 1 ファイル = 1 機能で配置する。
プロダクト全体の要件は [`../要件定義.md`](../要件定義.md)、フロント↔バックの境界定義は [`../contracts/`](../contracts/) を参照。

---

## 仕様ファイルのテンプレート

```markdown
# <feature-name>

> 関連: [要件定義 §X.Y](../要件定義.md) / [contracts/...](../contracts/...)

## 1. ゴール (What & Why)
この機能で何を達成するか。なぜ必要か（要件定義のどの価値に紐づくか）。

## 2. ユーザーストーリー
- ◯◯として、△△したい。なぜなら□□だから。

## 3. スコープ
### In Scope
- ...
### Out of Scope
- ...（明示的に外すもの。誤解を防ぐ）

## 4. 仕様詳細
状態遷移、UI、データフロー、計算ルール、エッジケースなど。
必要に応じて図 (mermaid) や擬似コードを併用。

## 5. 受入基準 (Acceptance Criteria)
- [ ] 検証可能な箇条書きで列挙する。
- [ ] 「動く」だけでなく「失敗しない」「期待通り表示される」を含める。

## 6. 依存・関連
- 上流: 他の spec / contract / 外部 API
- 下流: この spec を前提とする他機能

## 7. オープン課題
未確定の判断、仮置きの値、後で詰める点。
```

---

## 運用ルール

1. **仕様が先、コードが後。** 仕様を書かずに実装を始めない。
2. **仕様変更は PR で。** コードと一緒に spec の差分も入れる。
3. **受入基準が真実。** 「動く」の定義は spec の §5 に従う。
4. **オープン課題は隠さない。** §7 に書き出して残す。

---

## 機能一覧（現行）

| ファイル | 概要 | 要件定義 §  |
| --- | --- | --- |
| [ble-handshake.md](ble-handshake.md) | BLE ID-only Advertise / Scan（接続なし、Supabase Auth UUID 16 byte のみ） | §4.1, §4.2 |
| [profile-sync.md](profile-sync.md) | Supabase 経由のプロフィール同期 + 公開同意 | §2, §4.3, §6 |
| [server-side.md](server-side.md) | サーバー責務、Supabase 直結、将来 API サーバー化の境界 | §4.1, §4.3, §6 |
| [encounter-popup.md](encounter-popup.md) | 公園入口での対面挨拶（隊列、ハイタッチ、20 人上限・会いにいく） | §3.1, §3.2 A, §4.4 |
| [encounter-plaza.md](encounter-plaza.md) | ホーム画面（広場ビュー / アバターが歩き回る街並み） | §3.2 B |
| [profile.md](profile.md) | 自己プロフィール設定（保存時に Supabase へ即同期） | §3.2 C, §5 |
| [avatar.md](avatar.md) | アバター描画・パーツ体系・アニメ仕様（SVG + CSS） | §3.3, §4.2, §5 |
| [walk-mode.md](walk-mode.md) | iOS ウォークモード（省電力待機画面、自動終了なし） | §3.2 D, §4.1 |
| [sfx.md](sfx.md) | Web Audio API で合成する対面挨拶シーンの効果音 | §3.3 |
| [haptics.md](haptics.md) | `navigator.vibrate` 経由の触覚フィードバック | §3.3 |
| [regional-map.md](regional-map.md) | 出身県の任意登録 + 日本地図コレクションビュー (`/map`) | §3.2, §5, §6 |
