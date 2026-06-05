# Regional Map — 出身県の登録 + 日本地図コレクション

> 関連: [要件定義 §3.2 / §3.3 / §5](../要件定義.md) / [profile.md](profile.md) / [profile-sync.md](profile-sync.md) / [encounter-popup.md](encounter-popup.md) / [encounter-plaza.md](encounter-plaza.md)

## 1. ゴール (What & Why)
GPS / 位置情報を一切取らない縛り (要件 §6) のもとで、3DS 時代の **「都道府県別すれちがいピンバッジ」感** を再現する。

- ユーザーは **任意で** 自分の出身県を 1 つだけ登録できる。未設定 (= 非公開) も明示的に許容。
- すれちがった相手の出身県が広場挨拶の吹き出しと住人詳細パネルに **📍 表示** される。
- 広場 (`EncounterPlaza`) のヘッダーから **🗾 日本地図ビュー (`/map`)** に遷移できる。地図上では「会った県=色付き」「未訪県=グレー」「自分の県=黄枠」で表示し、タップで該当県の住人リストが下からスライドアップする。

「位置情報を取らないのに、知らない遠くの誰かと擦れ違った驚き」を体験の核に据える。

## 2. ユーザーストーリー
- ユーザーとして、自分の出身県を任意で登録したい。登録したくない場合は空欄のままにできてほしい。
- ユーザーとして、すれちがった相手の出身県が分かると、「東京から来た人だ」のような小さな発見がある。
- ユーザーとして、47 県のうちどれだけ集めたかを地図ビューで一目で確認したい。
- ユーザーとして、未訪の県を見ると「次はそこの人とすれちがいたい」と感じる動機が湧く。
- ユーザーとして、出身県を後から変更・解除できる。

## 3. スコープ

### In Scope
- プロフィール画面の **任意項目** として「出身地」セレクタを追加 (47 県 + 「未設定（非公開）」)。
- `my_profile` / `users_cache` / `profile_sync_queue` に `home_prefecture TEXT NULL` 列を追加。
- Supabase `profiles` テーブルに `home_prefecture TEXT NULL` 列を追加。
- 公園挨拶 (`GreetingBubble`) と広場詳細パネル (`PlazaDetailPanel`) に「📍◯◯」を表示。
- 広場ヘッダーに 🗾 ボタンを追加し、`/map` ページへ遷移。
- `RegionalMap` コンポーネント: 12 行 × 10 列のタイルマップで日本列島を近似し、`users_cache` の集計を可視化。

### Out of Scope
- 県別のソート / 検索機能 (Phase 2)
- 47 県完全コレクション達成時の演出 (Phase 2)
- 都道府県以外の地域単位 (市区町村 / 国外 など) の扱い (Phase 3)
- 地理座標を伴う地図 (例: Mapbox / OSM) — 採用しない。位置情報非取得ポリシー (要件 §6) と整合を最優先とする。

## 4. データ仕様

### 4.1 県コード
- 値は **ISO 3166-2:JP の下 2 桁** (`"01"` 北海道 〜 `"47"` 沖縄)。
- 未設定は SQL の NULL / TS の `null` で表す。
- 列追加マイグレーション: `src-tauri/migrations/0003_home_prefecture.sql` (schema_version → 3)。

### 4.2 タイルマップ座標
- `src/lib/prefecture/data.ts` に `PREFECTURES` 配列で 47 件をハードコード。
- 各県は `tile: { row, col }` を持ち、**12 行 × 10 列のグリッド** に収まる。
- 右上が北海道、左下が九州・沖縄。地理的に厳密ではなく Wikipedia "Tile maps of Japan" 風の簡略配置。
- 拡張 (`a{NN}` accessory 軸と同様、後方互換) のために未知コードはパーサが無視する方針 (避けるよりは、UI 側でフォールバック「未訪」扱い)。

### 4.3 同期フロー
- 自プロフィール保存 (`saveProfile`):
  - ローカル `my_profile` 先行 UPSERT、その後 Supabase `profiles` upsert。
  - オフライン時は `profile_sync_queue` に enqueue され、`home_prefecture` も一緒に保持される。
- 受信時 (`flushPendingProfiles`):
  - Supabase 一括 fetch の SELECT 句に `home_prefecture` を追加 (`SELECT_COLS`)。
  - `users_cache` の UPSERT で `home_prefecture` をマージ。
- Rust mock (`profile_resolver::resolve`):
  - `user_id` から決定論的に `home_prefecture` を割り当てる (約 10% は None で「未設定の人」も再現)。

## 5. UI 仕様

### 5.1 プロフィール画面
- 一言メッセージの下に **「🗾 出身地（任意）」** ラベル + `<PrefectureSelect>`。
- セレクタ先頭は「未設定（非公開）」、その後地方ごとの optgroup で 47 県。

### 5.2 公園挨拶シーンの吹き出し
- 名札 (PARK PASSPORT 風) に display_name の右隣に小さく「📍◯◯」を表示。
- 未設定の人には何も追加しない (= 「未設定の人なんだな」と暗黙に分かる)。

### 5.3 広場 詳細パネル
- ボトムシートの display_name のすぐ下に「📍◯◯」を表示。
- 未設定なら省略。

### 5.4 日本地図ビュー (`/map`)
- ヘッダー: 「🗾 すれちがい日本地図」 / 進捗 `{visitedCount} / 47`。
- 中央: 12×10 のタイル。各タイルは `36 × 36` 正方形、`4px` ギャップ。
- フィル色: 地方ごとの差し色 (北海道 = 水色, 関東 = 黄, 近畿 = 赤系, etc.)。未訪はベージュグレー。
- 自分の出身県は **黄枠 + 黄色いハロー** (`box-shadow`) で強調。
- タイル中に県名 + 出会った人数 (バッジ風)。0 人なら数字なし。
- タイルタップ → ボトムシート (`PrefectureSheet`) が下から出る。
  - 県名 + 地方ラベル + 「あなたの出身」バッジ (該当時)
  - 住人カードのリスト (avatar / display_name / 相対時刻・累計回数 / message)
  - 0 件時は「この県の人とは、まだすれちがっていません。」
- パネル外タップで閉じる。閉じるボタンは右上 ×。

### 5.5 広場ヘッダーの導線
- `PlazaTopBar` 右側、プロフィールアイコンの左に **🗾 ボタン** (`/map` へ Link)。

## 6. 受入基準
- [ ] プロフィール画面で出身地を選び保存できる。未設定のまま保存できる。
- [ ] 保存後、即 Supabase の `profiles.home_prefecture` に反映される。
- [ ] オフライン時に保存すると `profile_sync_queue` に積まれ、復帰時に同じ値が送られる。
- [ ] すれちがった相手で home_prefecture が設定済みの人は、吹き出し / 詳細パネルに「📍◯◯」が出る。
- [ ] 未設定の人は何も表示されない (空文字や「未設定」を見せない)。
- [ ] `/map` で 47 県のタイルが日本列島型に並んでいる。
- [ ] 自分の県が黄枠で強調される。
- [ ] 既訪県が色付き、未訪はグレー。
- [ ] タイルタップで該当県の住人リストが下からスライドアップする。
- [ ] 住人 0 件の県をタップしても「まだすれちがっていません」が出てクラッシュしない。
- [ ] スキーマ migration 0003 が schema_version=2 → 3 で適用される。

## 7. 依存・関連
- 上流: [profile.md](profile.md) (フォーム), [profile-sync.md](profile-sync.md) (Supabase 同期)
- 下流: [encounter-popup.md](encounter-popup.md) (吹き出し), [encounter-plaza.md](encounter-plaza.md) (詳細パネル + ヘッダー)
- 契約: [contracts/db-schema.sql](../contracts/db-schema.sql), [contracts/supabase-schema.sql](../contracts/supabase-schema.sql)

## 8. オープン課題
- [ ] 47 県コンプリート時の演出 (記念バッジ等) — Phase 2
- [ ] 国外 (海外旅行先・在外居住) の扱い — Phase 3
- [ ] タイルマップ座標の微調整 (実機の縦サイズでの見栄え)
- [ ] 「自分の県だけ非公開にしたい」要望が出たら、`home_prefecture` を NULL に戻す UI を強調する
