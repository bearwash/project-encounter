# Avatar — レンダリング・パーツ・アニメーション・編集 UI 仕様

> 関連: [要件定義 §3.3, §4.2, §5](../要件定義.md) / [profile.md](profile.md) / [encounter-popup.md](encounter-popup.md) / [encounter-plaza.md](encounter-plaza.md)

## 1. ゴール (What & Why)
すれ違い相手とユーザー自身を表現する **アバター** の描画方式・パーツ体系・アニメーション・編集 UI を規定する。
要件: BLE で受信した `user_id` から Supabase 経由で取得した `avatar_code` (15 文字) を、**クラッシュなく** 軽量に描画でき、ポップアップでも広場ビューでも編集画面でも **常に愛嬌のある動き** を見せること。

## 2. 描画方式
- **SVG パーツの重ね合わせ + CSS `@keyframes` アニメーション** をコア描画方式とする。
- React コンポーネントとして `<Avatar code="b01_h01_o01_f01" mode="idle | walking | popup" />` の単一インターフェースを提供。
- Canvas / WebGL / Lottie は MVP では使用しない。
- 採用理由:
  - `avatar_code` から `<Base id="01"/> <Hair id="01"/> <Outfit id="01"/> <Face id="01"/>` のように **コンポーネント合成だけで描画完結** する。
  - 色変えは SVG `fill` 属性に props を渡すだけで無限に増やせる（容量ゼロ）。
  - 「呼吸」「まばたき」「歩行」など **部分アニメは CSS のみ** で実装でき、JS タイマーや重いランタイムが不要。

### 2.0 「2.5D」のテイスト
完全な 3D（Three.js / WebGL）ではなく、**SVG 内のグラデーション・ドロップシャドウ・ハイライトで軽い立体感**を出す **「2.5D」** 路線を採用する。Memoji / Apple Mimoji / 最近の Discord アバターに近いテイスト。

- ベタ塗りだけでは「ペラっとして安っぽい」印象になりがち。SVG `<linearGradient>` / `<radialGradient>` / `<filter>` を活用して以下を入れる:
  - **頭・顔の側面に薄い影**（左から光源を仮定し、右側にやや暗いトーン）
  - **頬や額のハイライト**（白を 30% 透明度で乗せる）
  - **服の襟元・袖口に薄い影**（折り返しの立体感）
  - **足元に楕円ドロップシャドウ**（地面との接地感）
- ただし **太い黒の輪郭線は維持**（ポップさの担保、フラットアートとの地続き感）。
- 過度な質感（メタル、ガラス、木目等）は採用しない。常に「おもちゃ箱の中のフィギュア」のような統一感を保つ。
- パフォーマンス上、SVG filter は重くなりやすいため、**シャドウ/ハイライトは事前焼き付け**（パーツ SVG 自体に含める）して、ランタイムでは filter 計算を発生させない。

### 2.1 Framer Motion の棲み分け
- **Avatar コンポーネント自体の常時アニメ**（呼吸・まばたき・歩行）→ **CSS `@keyframes`**（広場で 30 体同時描画するため軽量必須）
- **AvatarEditor 等の編集 UI のリアクション**（パーツ切替で「ポンッ」と弾む等）→ **Framer Motion**（編集中は 1 体だけ、おもちゃ箱感の核）

両者は親コンポーネント側で使い分け、Avatar コンポーネント自体は Framer Motion 非依存に保つ。

## 3. パーツ体系

### 3.1 軸の定義
| 軸 | コード | 種類数 (MVP) | 役割 |
| --- | --- | --- | --- |
| Base | `b` | 4 | 体型・肌色・頭の輪郭 |
| Hair | `h` | 4 | 髪型・髪色 |
| Outfit | `o` | 4 | 服装 |
| Face | `f` | **4** | 表情（スマイル / 驚き / どや顔 / ウインク） |

組み合わせ: 4 × 4 × 4 × 4 = **256 通り**（MVP）

将来 `a{NN}`（accessory）軸を追加する場合は Phase 3 の AVATAVI STORE と同時リリース予定。

### 3.2 パーツコードのフォーマット
- 文字列フォーマット: `b{NN}_h{NN}_o{NN}_f{NN}`（**固定 15 文字**）
- `NN` は 2 桁ゼロ埋めの 10 進数（`01`〜`99`）
- 例: `b01_h02_o03_f01`
- 軸の順序は **base → hair → outfit → face** で固定。
- 将来 accessory 軸 (`a{NN}`) を追加する場合、後ろに `_a{NN}` を append（パーサは未知軸を無視する）。

### 3.3 表情 (Face) の MVP 4 種
| ID | 表情 | 用途・ニュアンス |
| --- | --- | --- |
| `f01` | **スマイル** | デフォルト。口角上げ + 目細め。普段の表情 |
| `f02` | **驚き** | 目を見開く + 口がすぼまる。「！」を表現したいとき |
| `f03` | **どや顔** | 自慢げ。口角片方上げ + 目細め。Phase 2 の関係性表現で使う想定 |
| `f04` | **ウインク** | 片目だけ閉じる。ハイタッチ／「やっと N 回目！」演出と相性 |

挨拶ポップアップ ([encounter-popup.md](encounter-popup.md)) では基本 `f01` で表示し、ハイタッチ成立時に **一瞬 `f04` (ウインク) に切り替えて戻す** 演出を入れる（実装で確定）。

### 3.4 パーツの物理構成（SVG レイヤ順）
下から順に重ねる:
1. `<Base />`（影 + 体 + 頭）
2. `<Outfit />`（服。base の体に重なる）
3. `<Face />`（顔パーツ: 目 + 口。head の上に乗る）
4. `<Hair />`（髪。head + face に重なる）
5. （将来）`<Accessory />`（眼鏡・帽子等。Phase 3）

各パーツは `<svg viewBox="0 0 64 96">` を共有し、相対座標で配置を合わせる（base の頭の中心を基準点に）。

### 3.5 マニフェスト
利用可能なパーツは `public/avatars/manifest.json` に記載する。素材 SVG はクライアント同梱（Supabase Storage は使わない）。

```json
{
  "base": [
    { "id": "01", "file": "base/01.svg", "label": "標準" },
    { "id": "02", "file": "base/02.svg", "label": "小柄" }
  ],
  "hair":   [...],
  "outfit": [...],
  "face":   [
    { "id": "01", "file": "face/01.svg", "label": "スマイル" },
    { "id": "02", "file": "face/02.svg", "label": "驚き" },
    { "id": "03", "file": "face/03.svg", "label": "どや顔" },
    { "id": "04", "file": "face/04.svg", "label": "ウインク" }
  ]
}
```

未知 ID 受信時の挙動は §6 を参照。

### 3.6 パーツ素材の調達方針
MVP の 16 パーツ（base 4 + hair 4 + outfit 4 + face 4）は **「コード」と「ベクター AI」のハイブリッド** で作る。手作業のトレースを極小化する。

- **アプローチ A — Cursor / LLM に SVG コードを直接書かせる**:
  - ベース体型、輪郭、シンプルな服（T シャツ等）、シンプルな表情パーツ向け
  - 例: 「太い黒の輪郭線、丸みを帯びたポップな『ツンツンヘア (h01)』を React の SVG コンポーネントで」と指示 → `fill={color}` props 付きの完成品が出る
  - メリット: Figma 不要、props 化込みで出力、調整が会話駆動
- **アプローチ B — Recraft.ai (ベクター生成 AI) で SVG 直接生成**:
  - 特徴的な髪型、表情、装飾性のある服向け
  - プロンプト例: `Vector art, thick outline, flat colors, pop style, avatar hair`
  - メリット: トレース不要、SVG をそのまま React にコピペ可能
- **Phase 3**: AVATAVI STORE に入った段階で初めてイラストレーターに外注、「公式プレミアムアセット」を作る

トーン基準: **太い黒の輪郭線 + ベタ塗りベース + グラデ/シャドウ/ハイライトで軽い立体感（2.5D）+ 角丸**。Mii / Memoji / Apple Mimoji / Telegram スタンプの中間ゾーン。生成プロンプトには `vector art, thick outline, flat colors with subtle shading, soft highlights, pop style, 2.5D` を含めるとブレにくい。詳細トーンは要件定義 §3.3。

## 4. ポップアップ用アニメーション

ポップアップ画面（[encounter-popup.md](encounter-popup.md)）で使用するモーション。

| 名前 | トリガー | 仕様 |
| --- | --- | --- |
| `entrance-walk` | 隊列から前に出る | 画面奥（隊列）から手前（相手の定位置）へ `translateX/Y` で移動（500ms）。同時に下部の足パーツに `step` アニメ |
| `breathing` | 中央停止後（待機） | body グループに `translateY: 0 → -2px → 0` を 2 秒周期 |
| `blink` | 中央停止後（待機） | 5〜8 秒に一度、目パーツに `scaleY(1) → scaleY(0.1) → scaleY(1)` を 100ms |
| `wink-flash` | ハイタッチ成立 | 100ms だけ Face を `f04` (ウインク) に差し替えて戻す |
| `bow` | 初回（会釈） | 首パーツを `rotate: 0° → 15° → 0°` で 400ms |
| `high-five` | 2 回目以降 | 内側の腕パーツを上にスイング → 中央で両手が触れる → 戻る（合計 450ms） |
| `exit-walk` | 「次へ」押下 | 画面右へ `translateX` で歩き去る（300ms）。`step` アニメ継続 |

### 4.1 `step`（足踏み）の実装方針
- 左右の足パーツ（`<g id="leg-l">`, `<g id="leg-r">`）に **180° 位相がずれた `rotate` アニメ**を適用。
- 各足は `transform-origin: 上端`（股関節）を基準に `±15°` 揺らす。
- 周期 400ms。歩行中はループ、停止時は 0° で固定。

## 5. 広場ビュー用アニメーション

広場ビュー（[encounter-plaza.md](encounter-plaza.md)）で使用するモーション。

### 5.1 状態機械
各住人は以下の状態を確率遷移する:

```
walking ──5s後──┬──> standing ──3s後──┬──> walking
                │                       │
                └──> looking ──2s後────┘
```

- `walking`: 左右どちらかにランダム速度（0.5〜1.5 px/frame）で移動。`step` アニメ ON。
- `standing`: その場に立つ。`breathing` + `blink` のみ。
- `looking`: 立ったまま、首パーツを `rotate: -10° → +10°` で 1 秒ごとに揺らす。

### 5.2 個体差の出し方
- 各住人の状態遷移は **`mulberry32(seed)`** で再現可能な乱数列を生成する。
- シード派生: **`user_id` (UUID 文字列) を FNV-1a 32-bit ハッシュに通したもの** を mulberry32 の初期シードに採用。これにより:
  - 同じ `user_id` のアバターは、再起動しても **似た行動傾向**（移動の頻度、立ち止まり時間の長さ）になる → "個性" の演出
  - 軽量、依存ライブラリ不要（数行で実装可能）

### 5.3 端で反転
- ステージの左右端 + 余白 8px に達したら、`scaleX: 1 → -1` で向きを反転して内側に歩く。

## 6. 未知パーツ受信時のフォールバック
- `avatar_code` のパース失敗時 → デフォルトコード `b01_h01_o01_f01` で描画。
- 軸の値（例: `h99`）がマニフェストに存在しない場合 → その軸だけデフォルト（`h01`）に置換。
- 軸自体が欠けている場合（例: 旧形式 11 文字 `b01_h01_o01`）→ 欠けた軸のみデフォルトで補完（**前方互換**）。
- 未知の軸（例: `_a{NN}`）→ パーサが無視（**後方互換**）。
- いずれも UI にエラー表示はせず、サイレントにフォールバック（クラッシュ禁止）。

## 7. パフォーマンス指針
- 1 体あたりの DOM ノード数: **40 個以下**（base + outfit + hair + face で 4 階層、目鼻口含む）
- アニメーションは **すべて CSS `@keyframes`**。JS の `requestAnimationFrame` は広場の状態遷移（数秒〜十数秒間隔）でのみ使用。
- 同時表示の上限:
  - ポップアップ: 主役 1 体 + 隊列の小さな省略表現 2〜3 体
  - 広場ビュー: 30 体（[encounter-plaza.md](encounter-plaza.md) §4.8）
- 中位 Android 端末で **30fps 以上** を維持できる構成にすること。

## 8. AvatarEditor — 編集 UI 仕様

プロフィール画面（[profile.md](profile.md)）で利用する、自分のアバターを組み立てる画面。

### 8.1 技術スタック
- Next.js (App Router) + Tailwind CSS + Framer Motion

### 8.2 レイアウト

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│             [大きく表示]              │  上部: プレビューエリア (60vh)
│             <Avatar />                │  選択中のアバターを大きく描画
│                                      │
│                                      │
├──────────────────────────────────────┤
│  [Base] [Hair] [Outfit] [Face]       │  タブ
│  ┌──┐┌──┐┌──┐┌──┐                    │  パーツ選択ボタングリッド
│  │01││02││03││04│                    │  （アクティブなタブの軸のみ表示）
│  └──┘└──┘└──┘└──┘                    │
└──────────────────────────────────────┘
```

- 画面を上下で分割。
- 上部: プレビューエリア。`<Avatar code={...} mode="idle" />` を中央大写し。
- 下部: タブ + パーツ選択グリッド。

### 8.3 状態管理
- `useState` で `base` (`'b01'`), `hair` (`'h01'`), `outfit` (`'o01'`), `face` (`'f01'`) を独立管理。
- 派生値として `avatar_code = ${base}_${hair}_${outfit}_${face}` (15 文字) を生成。
- 「保存」ボタン押下で [profile.md](profile.md) §4.5 の保存フロー（ローカル UPSERT + Supabase PUT）へ。

### 8.4 アニメーション
- パーツ選択ボタン押下で対応する軸の state を更新 → プレビューの `<Avatar />` を再レンダリング。
- 同時に **Framer Motion の `animate` で上部のアバターコンテナを `y: 0 → -12 → 0`（バウンス）**、`type: "spring", stiffness: 400, damping: 12` 程度のばね設定。
- パーツボタン自体も押下時に `scale: 1 → 0.9 → 1.05 → 1` の小バウンス（おもちゃ箱感）。
- タブ切替もフェード + 横スライド（150ms）。

### 8.5 UX 詳細
- パーツボタンには各パーツの **小さなプレビュー SVG** を表示（マニフェストの `label` はツールチップ）。
- 現在選択中のパーツは枠線が太く + 軽い `breathing` アニメ。
- タブ間の切替は左右スワイプにも反応（モバイル UX）。
- 編集中の `avatar_code` は画面下部に **小さくモノスペースで表示**（デバッグ + マニア向け）。

### 8.6 受入基準
- [ ] Base / Hair / Outfit / Face の 4 タブを切り替えてパーツを変更できる
- [ ] パーツを変更するたびに上部のアバターが上に跳ねる（Framer Motion バウンス）
- [ ] 「保存」を押すと `b01_h01_o01_f01` 形式の文字列が生成され、`my_profile` と Supabase `profiles` 両方に反映される
- [ ] 不正な状態（軸が欠ける）にはなれない（必ず 4 軸が選ばれている）
- [ ] パーツ変更が 60fps を維持して滑らかに動く
- [ ] 編集中のアバターは `idle` モードで呼吸・まばたきしている

## 9. 受入基準（Avatar コンポーネント全体）
- [ ] `b01_h02_o03_f01` 形式の文字列を渡すと、対応する SVG パーツが正しく重なって表示される
- [ ] 不正なフォーマット（例: `xyz`, `b01_h99_o03_f01`）でもクラッシュせず、デフォルトパーツで描画される
- [ ] 旧形式 `b01_h02_o03` (11 文字) を渡しても crash せず、`f01` で補完される
- [ ] ポップアップ画面で `entrance-walk → breathing + blink → high-five + wink-flash → exit-walk` が滑らかに繋がる
- [ ] 広場ビューで `walking / standing / looking` の 3 状態を確率的に遷移する
- [ ] 同じ `user_id` のアバターを 2 回起動して並べると、似た傾向の動きをする
- [ ] 30 体同時表示で中位 Android 端末で 30fps を下回らない

## 10. 依存・関連
- 上流: [contracts/ble-payload.schema.json](../contracts/ble-payload.schema.json)（user_id のみ受信）, [profile-sync.md](profile-sync.md)（avatar_code の取得元）
- 下流: [encounter-popup.md](encounter-popup.md), [encounter-plaza.md](encounter-plaza.md), [profile.md](profile.md)

## 10. Phase 2 プロトタイプ: 3D アバター (`Avatar3D`)

要件定義 §7 Phase 2「アバターの完全 3D 化: React Three Fiber + glTF への進化」の前段階として、**幾何プリミティブだけで構成された 3D アバター** `src/features/encounter/Avatar3D.tsx` を用意する。MVP の 2.5D SVG (§2.0) と共存し、選択的に置換可能なインターフェースで設計する。

### 10.1 設計方針
- 既存の `<Avatar code="..." mode="..." />` (2.5D) と並列に、`<Avatar3D avatarCode="..." userId="..." mode="idle|walking" />` を提供。
- 形状はすべて **R3F (`@react-three/fiber` v8) + drei (v9)** のプリミティブ (`sphere` / `cylinder` / `box` / `cone` / `torus` / `plane`) で構成。glTF / FBX は使わない (Phase 2 後半で導入)。
- `<Canvas>` は呼び出し側が用意する想定で、`<Avatar3D>` 自身は **R3F group を返すコンポーネント**。複数アバターを 1 Canvas に並べる前提。
- `avatar_code` のパースは既存の `parseAvatarCode` を流用 (`b/h/o/f` の 4 軸、未知 ID は `01` フォールバック)。
- 個体差は `userId` をシード (`makeRng` = mulberry32 + fnv1a32) に決定論的に生成。同じ `userId` は再起動しても同じ姿。

### 10.2 形状マッピング (V4 = ボックス voxel 化済み、2026-05-18)

**設計方針**: 3.5 等身のずんぐり可愛い voxel キャラ (Crossy Road / Designer Toy 路線)。`sphereGeometry` は完全排除し、すべて `boxGeometry` または `cylinderGeometry radialSegments=6` で構成する。

| 軸 | 値 | 形状 |
| --- | --- | --- |
| 頭 (固定) | — | `boxGeometry` 0.7×0.7×0.7 (大きく、ほぼ立方体) |
| 首 (固定) | — | `boxGeometry` 0.22×0.1×0.22 (薄い箱、skin 色) |
| 胴 (トップス) | outfit | `boxGeometry` 0.62-0.7 幅、高さ 0.55 |
| 腰 | outfit と連動 | `boxGeometry` (ボトムス色)、トップスとの境界 |
| 腕 | — | 肩 box (0.2×0.18×0.22) + 上腕 `cylinderGeometry` radialSegments=6 + 手 box (0.16³) |
| 足 | — | 太もも〜脛 `cylinderGeometry` radialSegments=6 (太め) + 靴 box (0.22×0.14×0.34、つま先方向に伸びる) |
| hair `h01` | 短髪 + バング | 扁平 box × 1 + バング box + ぴょこん box × 3 |
| hair `h02` | 長めボブ | 大箱 + 左右の垂れ box × 2 + 流し前髪 box |
| hair `h03` | ツンツン | 扁平 box + 縦長 box × 3 (中央 + 左右) |
| hair `h04` | ふんわりショート | 扁平大箱 + V 字前髪 box × 2 |
| face | 点目 + ミニマル口 | 黒 box × 2 (点目) + box (口) のみ。Sphere や torus は使わない |
| outfit `o01` / `o03` | スタンダード / 細身 | `cylinderGeometry` (トップス、上下わずかに先細り) |
| outfit `o02` / `o04` | スタンダード / 細身 | `boxGeometry` (トップス) |
| ボトムス | outfit と連動 | デニム / チャコール / カーキ / ベージュの 4 色をボトムス + 足の cylinder に塗る |
| hair `h01` | 短髪ぴょこん + 浅いサイドバング | 頭頂の `boxGeometry` × 4 + 前髪の薄い `boxGeometry` |
| hair `h02` | 長めボブ | 頭を包む `sphereGeometry` + 左右に張り出した `boxGeometry` × 2 + サイドに流す前髪 |
| hair `h03` | ツンツン | 扁平 `sphereGeometry` (頭頂ベース) + `coneGeometry` × 3 (棘) |
| hair `h04` | ふんわりショート | 扁平 `cylinderGeometry` + 中央分け前髪 `boxGeometry` × 2 |
| base `b01-b04` | 肌色 4 種 | 頭・首・手・耳 (将来) の色違い |
| face `f01` スマイル | 丸い目 + 半 torus の U 字口 | `sphereGeometry` (R=0.05) + `torusGeometry` (半周) |
| face `f02` 驚き | 大きい丸目 + 「o」型口 | `sphereGeometry` (R=0.07) + `torusGeometry` (1 周) |
| face `f03` どや | 細目 (scaleY 0.3) + 斜めの口 | `sphereGeometry` + 細い `boxGeometry` を回転 |
| face `f04` ウインク | 左目: 丸 / 右目: 横向き細線 | `sphereGeometry` + 横方向の `boxGeometry` |

### 10.2.1 個体差ジッタ (userId シード)
| パラメータ | 範囲 | 用途 |
| --- | --- | --- |
| `heightScale` | 0.92 〜 1.10 | 体全体の Y スケール (身長) |
| `widthScale` | 0.94 〜 1.08 | 体全体の X / Z スケール (体格) |
| `breathPhase` | 0 〜 2π | 呼吸の初期位相 |
| `breathSpeed` | 1.8 〜 2.4 rad/s | 呼吸サイクルの速さ |
| `walkPhase` | 0 〜 2π | 歩行サイクルの初期位相 |

→ 30 体並べたとき、全員が同期して上下する不自然さを解消する。

### 10.3 アニメーション

`useFrame` で `mode` に応じて body group の transform を毎フレーム更新する。

#### idle (デフォルト)
- `position.y = sin(t * breathSpeed + breathPhase) * 0.05`
- 足は静止 (`rotation.x = 0`)

#### walking (V4 = 1 セグメント化)
- `body.position.y = abs(sin(t * 4 + walkPhase)) * 0.06` (踏み込みで沈む)
- `body.rotation.z = sin(walkT) * 0.03` (微小な傾き)
- 股関節 (`hipLRef` / `hipRRef`) `rotation.x = ±sin(walkT) * 0.4` (前後スイング)
- 肩 (`shoulderLRef` / `shoulderRRef`) `rotation.x = ±sin(walkT) * 0.36` (足と逆位相)

V2 / V3 では膝・肘の屈伸も振っていたが、V4 (3.5 等身) ではシルエットを優先して **1 セグメント (肩-腕 / 股関節-脚)** に簡略化。voxel テイストにはこちらの方が合う。

#### 共通: idle 時の腕の揺らぎ
idle 時も呼吸に合わせて腕を ±0.03 rad 程度振らすことで「生きている感」を強化。

30 体並べても **位相と速度が個体ごとに異なる** ので、群衆としての自然さが出る (10.2.1)。

### 10.3.1 アウトライン (drei `<Outlines>` V4)
- マテリアルは **`meshToonMaterial`**（フラットなアニメ塗り）。ライトに反応するが metalness / specular は 0。
- すべての主要 mesh に drei `<Outlines thickness={0.03} color="#181410" />` を付ける (world-space)。
- **`screenspace={true}` は使わない**: drei v10 + three 0.184 では画面全体を覆ってしまう挙動を確認 (要報告)。world-space で十分にローポリ・トゥーン感が出る。
- 目・口 (点目 box) には輪郭をつけない (visibility 重視)。
- drei v9 + three 0.169 では `Outlines` が `onFirstUse` で `.trim()` null crash していたが、**drei v10 + three 0.184 で解消済み**。当時暫定で実装した「背面フリンジ法」は撤去済み。

### 10.4 影とライト
- すべての `mesh` に `castShadow` と `receiveShadow` を設定。
- 呼び出し側 (`/avatar3d-preview`) では:
  - `<Canvas shadows>` を必須
  - `<ambientLight>` + `<hemisphereLight>` + `<directionalLight castShadow>` (太陽光)
  - 地面 `<planeGeometry>` (`receiveShadow`) で接地感を出す
- Phase 2 で広場 (`EncounterPlaza`) を 3D 化する際は、上記 light setup を `EncounterPlaza` 側でも共通化する想定。

### 10.5 検証ページ
`/avatar3d-preview`:
- **単体プレビュー** — avatar_code 直接入力 + `idle / walking` モード切替 + OrbitControls
- **FACE 軸** — f01-f04 (スマイル / 驚き / どや / ウインク) を **1 Canvas に 4 体並列**
- **SAMPLES** — 代表的なコード組み合わせ 8 種を **1 Canvas に 4×2 (前後 z 奥行き)** で並べる
- **CROWD** — 30 体を 1 Canvas で生成 (40% を walking、残り idle)
- **フォールバック** — 不正コードでも b01/h01/o01 にフォールバック (1 Canvas)

#### Canvas 統合と WebGL context 上限
Chromium の WebGL context は最大 16 個。各セクションが 1 個の Canvas を持つと容易に上限を超え、最初に作られた Canvas から context を奪われる (Avatar3D 単体プレビューが空表示になる)。V4 では **計 5 Canvas** に集約 (単体 1 + FACE 1 + SAMPLES 1 + CROWD 1 + Fallback 1) し、上限内に収めている。

#### CameraLook ヘルパー
`camera={{ position: [...] }}` だけだと PerspectiveCamera の forward が `(0,0,-1)` 固定で、アバター中心 (y ≈ 1.0) より高い位置に camera を置くと頭がフレームアウトする。`useThree` で camera を取って `camera.lookAt(at)` を明示的に呼ぶヘルパー `<CameraLook at={[0, 1.0, 0]} />` を全 Canvas に入れている。

`avatar-preview/layout.tsx` と同じ dev ガード (`NEXT_PUBLIC_ENABLE_DEV_PAGES`) を適用。

### 10.6 既存 2.5D との切替戦略 (Phase 2 計画)
1. **Phase 2 前半 (現在)**: 既存 `<Avatar>` を主、`<Avatar3D>` はプレビューのみ。広場や挨拶シーンには未投入。
2. **Phase 2 中盤**: 広場 (`EncounterPlaza`) を Canvas ベースに置き換え。`<Avatar3D>` を 30 体並べてフレームレートを実測する。
3. **Phase 2 後半**: glTF + Mixamo アニメーションへ移行。`Avatar3D.tsx` は段階的に「プリミティブ → glTF ボーン」に置換する。

## 11. オープン課題
- [ ] mulberry32 + FNV-1a の参照実装（Rust と TS の両方で揃える）
- [ ] 個別パーツ SVG のデザインバリエーション最終確定（base/hair/outfit/face 各 4 種）
- [ ] AvatarEditor の「ガチャ」ボタンの要否（ランダム生成）
- [ ] 表情を `f01` 以外で永続的に保存させるか、状況依存で切り替えるか（現状: ユーザーが Face タブで選んだ表情が永続）
- [ ] アクセサリ軸 `a{NN}` の追加タイミング（Phase 3 想定）
- [ ] 髪と帽子の z-index 衝突問題（accessory 追加時）
