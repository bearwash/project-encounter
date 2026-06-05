# SFX — 対面挨拶シーンの効果音 (Web Audio 合成)

> 関連: [要件定義 §3.3](../要件定義.md) / [encounter-popup.md](encounter-popup.md) / [profile.md](profile.md)

## 1. ゴール (What & Why)
公園入口の対面挨拶シーン (`EncounterPopup`) と広場到着 (`gate-pass`) に **軽い効果音** を付け、無音の演出を視覚だけで支えていた状態を改善する。

- 外部音源は持たず **Web Audio API の Oscillator で合成**する。アプリバンドルに音声ファイルを同梱しない (size 0、ライセンス管理なし)。
- ノスタルジック・ポップ路線 (要件 §3.3) に合うシンプルな単音 / 短い和音で構成し、サイバーやネオン的な派手な SFX は避ける。
- ユーザーが切れる。設定は端末ローカル (`localStorage`) に保存。

`encounter-popup.md` §8 オープン課題「セッション終了時の SE の有無」を解消する。

## 2. 鳴らすタイミングと音色

| イベント | フェーズ | 音色 (合成パラメータ) | 体感 |
| --- | --- | --- | --- |
| 隊列の先頭が前に出てくる | `enter` 突入時 | triangle 380→220Hz × 2 (70ms 間隔 130ms) | コツコツ |
| 会釈 (初回) | `greet` の flash 時刻 | sine 520→340Hz, 220ms | ぺこっ |
| ハイタッチ (再会) | `greet` の flash 時刻 | square 1200Hz + sine 1600/2100Hz 重ね、70-110ms | ピロリンッ |
| ゲート通過 | `gate-pass` 突入時 | sine 800/1000/1300/1600Hz, 50ms ずらし和音 | シャラン |

すべて attack 5ms / volume ≤ 0.16 で破裂感は出さない。

## 3. 実装方針

### 3.1 `SFXEngine`
- `src/lib/audio/sfx.ts` に単一インスタンス `sfx` をエクスポート。
- `AudioContext` は **最初の `play*()` 呼び出し時に lazy 初期化**。autoplay policy 対策で、user gesture を伴うタップ後に初期化されることを期待する。
- `playFootstep()` / `playBow()` / `playHighFive()` / `playGate()` の 4 関数のみ公開。
- 内部 `burst()` で Oscillator + Gain を生成し、`exponentialRampToValueAtTime(0.0001, ...)` で envelope を作る。

### 3.2 ミュート設定
- `localStorage.encounter:sfx-muted` (`'1'` / `'0'`)。デフォルト **on (鳴らす)**。
- `setSfxMuted(boolean)` で切り替え、`useSfxMuted()` (React Hook) で購読。
- ミュート中は `ensureCtx()` が `null` を返し、Oscillator を作らない (リソース節約)。

### 3.3 UI
- プロフィール画面 (`ProfileForm`) の一言メッセージの下に「効果音」チェックボックスを配置。説明文は「あいさつシーンのコツコツ / ピロリン」。
- 設定は他画面と独立にトグルできる。EncounterPopup 自体にトグルは出さない (世界観優先)。

## 4. 受入基準
- [ ] 初回 (encounter_count == 1) の `greet` で「ぺこっ」が鳴り、再会 (>= 2) で「ピロリンッ」が鳴る
- [ ] `enter` 突入で「コツコツ」が 2 連鳴り、`gate-pass` で「シャラン」が鳴る
- [ ] プロフィール画面のトグルを OFF にすると、その後の挨拶シーンで音が鳴らない
- [ ] アプリ再起動後もミュート設定が維持される
- [ ] AudioContext が未対応の環境 (古いブラウザ等) でクラッシュしない

## 5. 依存・関連
- 上流: [encounter-popup.md](encounter-popup.md) §5.3 / §5.4 / §5.7
- 関連: [profile.md](profile.md) (トグル UI の置き場所)

## 6. オープン課題
- [ ] バックグラウンド (visibility hidden) のときは音を抑制すべきか — 現状は鳴らす方針
- [ ] iOS Safari WebView の AudioContext 振る舞い実機検証 (Phase 1.5)
- [ ] ハイタッチ / シャランのボリュームバランス微調整
