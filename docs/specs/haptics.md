# Haptics — 触覚フィードバック (`navigator.vibrate`)

> 関連: [要件定義 §3.3](../要件定義.md) / [encounter-popup.md](encounter-popup.md) / [sfx.md](sfx.md) / [profile.md](profile.md)

## 1. ゴール (What & Why)
視覚 (UI) と聴覚 (`sfx.md`) で補えない「触り心地」を、スマートフォンの振動で補強する。
要件 §3.3「ボタンを押したときのポンッという心地よい感触」を物理ハードウェアで上乗せする。

3DS 時代の「物理ボタンを押した感」「すれちがった瞬間の "ブルッ"」を、`navigator.vibrate()` の短いパルスで再現する。

## 2. 発火タイミング

| イベント | プリセット | パターン (ms) | 体感 |
| --- | --- | --- | --- |
| 公園挨拶: `meet` → `greet` タップ | `tap` | `8` | コッ |
| 公園挨拶: `speak` → `leave` タップ | `tap` | `8` | コッ |
| 公園挨拶: 会釈 (初回) | `bow` | `16` | ぺこっ |
| 公園挨拶: ハイタッチ (再会) | `highfive` | `[12, 60, 18]` | タンッ! (2 連打) |
| ゲート通過 (gate-pass 突入) | `gate` | `[20, 80, 30]` | ブルブルッ |
| プロフィール保存成功 | `success` | `[10, 60, 10]` | コンッ・コン |
| 広場の住人タップ → 詳細パネル | `tap` | `8` | コッ |
| 日本地図のタイルタップ | `tap` | `8` | コッ |

## 3. 実装方針

### 3.1 `HapticsEngine`
- `src/lib/haptics/index.ts` に単一インスタンス `haptics`。
- 公開関数: `play(pattern)` および `hapticTap / hapticBow / hapticHighFive / hapticGate / hapticSuccess` のショートカット。
- `navigator.vibrate()` を try/catch でラップ。`user gesture` 外での失敗は静かに無視する。
- 未対応環境 (デスクトップ Safari / Firefox など) では no-op。

### 3.2 ミュート設定
- `localStorage.encounter:haptics-muted` (`'1'` / `'0'`)。デフォルト **on (鳴らす)**。
- `setHapticsMuted(boolean)` / `useHapticsMuted()` で React 統合。
- Profile 画面の「効果音」トグルの下に「振動」トグルを並列配置。

### 3.3 UX 原則
- **連打しない**: 「タップごとに振動」だと五月蝿い。挨拶シーンでは phase 遷移 = タップ間隔最低 200ms (デバウンス) があるため、自然と間隔が空く。
- **音と同期**: SFX が鳴るタイミングと振動を合わせると体感統合度が上がる。`playHighFive()` の直後に `hapticHighFive()` を呼ぶ。
- **未対応環境の劣化**: PC ブラウザでは音だけ、モバイルでは音+振動。

## 4. 受入基準
- [ ] iOS Safari / Android Chrome で公園挨拶のハイタッチ瞬間に振動が来る (実機検証は Phase 1.5)
- [ ] プロフィール画面のトグル OFF で全イベントの振動が止まる
- [ ] 振動 API 未対応の環境で例外を吐かず no-op で続行する
- [ ] `localStorage` が無効 (private mode 等) でも例外なく動作する
- [ ] アプリ再起動後もミュート設定が維持される

## 5. 依存・関連
- 上流: [encounter-popup.md](encounter-popup.md), [sfx.md](sfx.md)
- 関連: [profile.md](profile.md) (トグル UI)

## 6. オープン課題
- [ ] iOS Safari の `navigator.vibrate` は **対応していない** (2026 時点)。Phase 1.5 で Tauri 経由の native haptics プラグイン (`UIImpactFeedbackGenerator`) に置換する設計余地を確保する
- [ ] Android では `vibrate()` 単発パターンの体感差を実機で検証 (12ms / 18ms の差は機種依存)
- [ ] バッテリー消費影響 — ウォークモード中は振動を抑制すべきか
