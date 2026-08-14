# 3D Performance — Messenger型の軽量3D描画仕様

> 関連: [encounter-plaza.md](encounter-plaza.md) / [avatar.md](avatar.md)

最終更新: 2026-06-23

## 1. ゴール

`EncounterPlaza3D` / `Plaza3DBackground` / `PlazaResident3D` を、Messenger
(`https://messenger.abeto.co/`) に近い「軽いのに密度がある」3D表現へ寄せる。

重要なのはモデルを単純に減らすことではなく、次の単位を軽くすること。

- 転送量: 初期表示で読むモデル・テクスチャを小さくする。
- 展開量: JS main thread でのデコード、JSON parse、画像展開を減らす。
- 描画量: draw call、material、texture bind、shadow pass を減らす。
- 更新量: React state と scene graph の毎フレーム更新を減らす。

この文書の結論:

1. Messenger は `.glb` を大量配置する作りではなく、`.drc` ジオメトリ、`.ktx2` GPU圧縮テクスチャ、Worker、instancing、LOD、カスタム shader/UI で成立している。
2. このリポジトリでは、まず **圧縮GLB + R3FのInstancedMesh/merged geometry** で同じ思想を実装する。
3. それでも足りない場合だけ、背景レイヤーを raw `.drc` + 独自Three.js runtime へ寄せる。

## 2. 調査方法

2026-06-23 に以下で確認した。

- Playwright CLI: `pnpm exec playwright test tmp/messenger-analysis.spec.mjs --reporter=line`
- Playwright MCP: 可視ブラウザでタイトル画面、`BEGIN` 後、`CONTINUE` 後を操作し、network/performance/DOM/WebGL creation hook を確認
- 保存済みバンドル: `messenger-App3D.js`, `messenger-network.txt`
- GitHub MCP: Hubs / Hyperfy / Webaverse の依存関係とコード検索
- Web調査: Three.js, glTF Transform, Draco, KTX, meshoptimizer 公式情報

補足: Browser MCP の Node REPL 経路は sandbox metadata エラーで使えなかったが、Playwright MCP の可視ブラウザ操作は使用できた。

注意: Messenger は DOM 上に通常の `canvas` が残らない/見えない状態でも描画が見える。したがって DOM snapshot の `canvas` 数だけを根拠にしない。資産ロード、WebGL context hook、network、bundle signature、可視スクリーンショットを合わせて判断する。

## 3. Messengerの観測結果

### 3.1 初期ロード

Playwright CLI の初期ロードでは 117-118 request 程度。

| 種別 | 件数 | 備考 |
|---|---:|---|
| document | 1 | HTML |
| css | 1 | スタイル |
| js/script | 11 | main bundle, webgl bundle, workers, wasm wrapper |
| `.ogg` | 53 | 音声を細かく分割 |
| `.icon` | 17 | UI icon/glyph系 |
| `.font` | 3 | 独自フォント/glyph |
| `.drc` | 16 | 初期intro用のDraco geometry |
| `.ktx2` | 10-11 | GPU圧縮テクスチャ |
| `.wasm` | 3 | Draco/Basis/Glyph |
| `.png` | 1 | atlas |

DOM は約 49 node。大量のReact/R3F componentをDOMやReact treeに並べる作りではない。

### 3.2 Playwright MCPで見た本編ロード後

可視ブラウザで `BEGIN` と `CONTINUE` を押した後、performance entries は 250 resource まで増えた。

| 種別 | 件数 | encodedBodySize合計 | 読み取り |
|---|---:|---:|---|
| `.drc` | 149 | 11,519,844 bytes | 本編world、LOD、avatar、NPC、VFXを細かく取得 |
| `.ktx2` | 13 | 662,463 bytes | LUT、noise、水、particle、eyeなど |
| `.ogg` | 53 | 3,668,846 bytes | 音声を細かく分割 |
| js | 9 | 636,325 bytes | main bundleとworker系 |
| font | 3 | 259,912 bytes | glyph/text描画 |
| icon | 17 | 29,648 bytes | UI icon |
| png | 2 | 3,426 bytes | 小さいatlas等 |
| wasm | 1以上 | 232,016 bytes | performance entry上で観測できたwasm分。実際の初期networkにはDraco/Basis/Glyph系がある |

重要なのは「初期タイトルで全部読む」のではなく、画面遷移に合わせて段階的に読むこと。初期ロードは intro 用の `.drc` が中心で、本編に入ってから次の資産が追加される。

- `planets/present/full_0.drc` ... `full_9.drc`
- `planets/present/full-lod-1_0.drc` ... `full-lod-1_9.drc`
- `planets/present/full-lod-2_0.drc` ... `full-lod-2_9.drc`
- `planets/present/full-lod-3_0.drc` ... `full-lod-3_9.drc`
- `avatar/accessories/bottom*.drc`, `shoes*.drc`
- `deliveries/note.drc`, `postcard.drc`, `samplebox.drc`, `offering.drc`, `letterwet.drc`
- `emojis/1.drc` ... `emojis/10.drc`
- `npcs/present/<npc>/<npc>.drc`, `*-bones.drc`, `*-idle.drc`, `*-talk.drc`, `*-walk.drc`

LOD chunk のサイズは、近いLODほど大きく、遠いLODほど小さい。観測例では `full-lod-1_*` が約 209-302KB、`full-lod-2_*` が約 192-264KB、`full-lod-3_*` が約 151-197KB の範囲に収まっていた。chunk 9 のような小片は数KBだった。

NPCは mesh / bones / animation を分けている。例: `office-worker.drc` は約21KB、`office-worker-bones.drc` は約0.6KB、`office-worker-idle.drc` は約75KB。キャラクターを1つのGLBにまとめず、必要な差分だけ読む設計に見える。

可視ブラウザの `requestAnimationFrame` 計測では、120Hz環境で平均約8.33ms、約119.99fps、16ms超えframe 0を観測した。これはMessengerが常に全端末で120fpsという意味ではないが、少なくとも調査環境では本編ロード後でもframe budgetをほぼ使い切っていなかった。

スクリーンショット証跡:

- `messenger-mcp-current.png`: タイトル画面
- `messenger-mcp-after-begin-click2.png`: `BEGIN` 後
- `messenger-mcp-after-continue.png`: `CONTINUE` 後
- `messenger-mcp-after-insert-probe.png`: WebGL/DOM hook付き再読み込み

### 3.3 WebGL runtime とDOM UI

WebGL作成hookで、Three.js `WebGLRenderer` が `createElementNS('canvas')` 経由で canvas を作り、`webgl2` context を取得することを確認した。context attributes は次の通り。

```json
{
  "alpha": true,
  "depth": false,
  "stencil": false,
  "antialias": false,
  "premultipliedAlpha": true,
  "preserveDrawingBuffer": false,
  "powerPreference": "default",
  "failIfMajorPerformanceCaveat": false
}
```

読み取り:

- `antialias:false`: MSAAを切り、エッジの見え方は解像度、色面、shader、post/process側で作っている可能性が高い。
- `depth:false` / `stencil:false`: depth/stencil bufferのコストを避ける設定。Messengerは小惑星型の絵作りと `renderOrder` 制御で破綻を抑えている可能性がある。ただし一般的な3D広場でそのまま真似ると前後関係が壊れるので、Project Encounterでは背景/UI/透明VFXの専用passだけで検討する。
- `preserveDrawingBuffer:false`: screenshot用途の保持をせず、通常描画性能を優先。
- `alpha:true`: WebGL layer と透明DOM hit area を重ねやすい。

bundleには `OffscreenCanvas` と `transferControlToOffscreen` が存在する。ただし今回の可視MCP実測で直接観測できた `OffscreenCanvas` は、`WebGLTextures` から作られた 1x1 の2D canvas utility だけだった。したがって「主描画をOffscreenCanvas workerで行っている」と断定しない。正確には「bundle上はOffscreenCanvas/worker経路を持つが、観測runの主rendererはWebGLRendererのcanvas + WebGL2 context作成として見えた」と扱う。

DOMは約49 nodeで、視覚表現の大半は通常DOMではない。`#global-ui` には透明なabsolute divがあり、`side-button`, `dialog-button`, `emoji-bg`, `checklist-bg`, `continue-button` のようなhit targetを置いている。つまり、UIをDOMで見せるのではなく、WebGL/glyph側で見せ、DOMは入力領域として薄く使う設計に近い。

### 3.4 バンドル内の技術シグネチャ

`messenger-App3D.js` から確認した主な文字列:

| シグネチャ | 出現数 | 読み取り |
|---|---:|---|
| `REVISION="180"` | 1 | Three.js r180 系 |
| `OffscreenCanvas` | 3 | offscreen utility/worker経路の存在。主描画利用は今回未断定 |
| `transferControlToOffscreen` | 1 | canvasをworkerへ渡す経路の存在 |
| `Worker(` | 13 | decode/geometry/bitmap/glyph等を分離 |
| `postMessage(` | 20 | workerとの転送 |
| `KTX2Loader` | 32 | KTX2 texture pipeline |
| `DRACOLoader` | 4 | Draco geometry decode |
| `CompressedTexture` | 15 | GPU圧縮テクスチャ |
| `InstancedMesh` | 25 | 同一形状の一括描画 |
| `InstancedBufferGeometry` | 13 | 独自instancing |
| `drawElementsInstanced` | 1 | WebGL instanced draw |
| `matrixAutoUpdate` | 61 | 行列更新を手動管理 |
| `frustumCulled` | 63 | cullingの明示制御 |
| `renderOrder` | 44 | UI/transparentの描画順制御 |
| `full-lod-1/2/3` | 5 | LOD段階 |
| `hitmesh` | 1 | 見た目用と当たり判定用を分離 |

Worker名:

- `dracoworker-*.js`
- `geometryworker-*.js`
- `bitmapworker-*.js`
- `glyphworker-*.js`
- `collisionworker-*.js`
- `charactergeoworker-*.js`

これは「モデルロードをmain threadで順番に読む」設計ではなく、decode、geometry組み立て、bitmap/glyph処理、collision処理を分離していることを示す。特に `dracoworker`, `geometryworker`, `bitmapworker`, `glyphworker` は、描画資産の展開をmain threadから逃がすための分割として読むべき。

### 3.5 資産形式

バンドル内で見える固有資産:

- `.drc`: 96 unique
- `.ktx2`: 22 unique
- `.glb`: 初期ロード・抽出シグネチャ上は主役ではない

代表ファイルサイズ:

| URL末尾 | サイズ |
|---|---:|
| `planets/present/intro/planet.drc` | 336,980 bytes |
| `planets/present/intro/trees.drc` | 47,443 bytes |
| `planets/present/intro/water.drc` | 44,733 bytes |
| `npcs/present/office-worker/office-worker.drc` | 21,287 bytes |
| `npcs/present/office-worker/office-worker-idle.drc` | 74,972 bytes |
| `images/lut.ktx2` | 96,633 bytes |
| `images/clouds_noise_512.ktx2` | 74,409 bytes |
| `images/water-noises-highq.ktx2` | 212,083 bytes |

モデルの分割例:

- `planet.drc`, `water.drc`, `trees.drc`, `clouds.drc`
- `waterfall_vfx.drc`, `waterfallsplash_vfx.drc`, `beachfoam_vfx.drc`
- `npcs/present/<name>/<name>.drc`
- `npcs/present/<name>/<name>-bones.drc`
- `npcs/present/<name>/<name>-idle.drc`
- `npcs/present/<name>/<name>-talk.drc`
- `npcs/present/<name>/<name>-walk.drc`

推定: DCCツールで作ったキャラクターや環境を、GLBとして丸ごと配るのではなく、ジオメトリ・骨・アニメーション・VFX曲線を独自形式に近い単位で `.drc` 化している。これにより必要な場面だけ細かく読み、Workerでデコードできる。

### 3.6 見た目の軽さの作り方

Messengerの軽さは、単に低ポリだからではない。

- 小さい惑星/島に世界を圧縮し、視界内の範囲を制限している。
- 遠景は silhouette と色で読ませ、近景だけ形状情報を持つ。
- テクスチャは写真/PBRではなく、KTX2 noise、LUT、atlas、glyphでスタイルを作る。
- 影やポストエフェクトより、shader内の色・ノイズ・線・リムで密度を出す。
- UI、文字、アイコンもWebGL mesh/glyph側に寄せ、DOM UIを最小化している。
- 同じ形状は instancing または batched geometry にして、個別Object3Dを増やさない。

## 4. 現状との差分

対象ファイル:

- `src/features/encounter/EncounterPlaza3D.tsx`
- `src/features/encounter/Plaza3DBackground.tsx`
- `src/features/encounter/PlazaResident3D.tsx`
- `src/features/encounter/StylizedPlazaAvatar.tsx`
- `public/models/`

現状の良い点:

- `Plaza3DBackground.tsx` では `mergeGeometries` を使い始めている。
- テクスチャ設定で mipmap/anisotropy を抑える処理が入っている。
- `public/models` に背景モデルを分離している。

まだ重くなりやすい点:

- GLBを見た目単位で増やすと、ロード・parse・material・textureが増える。
- R3F componentとして背景部品を増やすと、React tree と Three scene graph の両方が重くなる。
- 背景オブジェクト、住人アバター、UIを同じ品質で描くと、人数より背景が支配的になる。
- 高木や生成キャラクターのような重いGLBをそのまま広場に置くと、Messenger型とは逆方向になる。

## 5. 実装方針

### 5.1 採用順

まず採用する:

1. 圧縮GLB: Meshopt/Draco + KTX2/WebP texture
2. `InstancedMesh`: 繰り返し配置する木、草、花、柵、街灯、石
3. `mergeGeometries`: 動かない近接装飾のdraw call削減
4. LOD: 近景GLB、中景簡略mesh、遠景billboard/手続きmesh
5. 低頻度state同期: 3Dの毎フレーム値はrefに閉じる
6. 当たり判定分離: render meshをcollisionに使わない

後で検討する:

1. raw `.drc` を直接読む背景レイヤー
2. OffscreenCanvas worker rendering。ただしMessengerでも今回のrunでは主描画利用を断定できないため、最後の手段にする
3. glyph/text UI のWebGL化
4. animationを独自geometry streamへ分割

### 5.2 なぜ最初から raw `.drc` にしないか

Messengerは raw `.drc` 中心だが、このリポジトリは Next.js + React Three Fiber + Three.js で、既にGLB資産がある。raw `.drc` へ急に寄せると、以下を自前実装する必要がある。

- material割り当て
- transform/scene階層
- animation/bone情報
- texture参照
- preload/cache
- error fallback

まずは glTF/GLB の標準構造を保ったまま、Meshopt/Draco/KTX2/instancing で80%の効果を取りに行く。raw `.drc` は背景の草・葉・VFXなど、materialが少なく静的なものに限定するとよい。

### 5.3 Messenger型をこのリポジトリへ写す具体仕様

Messengerの実測から、そのまま取り込むべき思想と、まだ取り込まない思想を分ける。

すぐ取り込む:

- 初期ロードは「広場の入口が成立する最低限」だけにする。
- 本編/詳細/近景に入ってから、chunk、LOD、住人、UI小物を追加ロードする。
- 静的背景は、1つの大きなGLBではなく、zone/chunk/LOD単位に切る。
- 木、草、花、石、街灯、柵は個別React componentにせず、同一geometry/materialごとのinstancingにする。
- NPC/住人は「本体mesh」「装備」「表情/顔texture」「animation」を分け、画面に必要なものだけ読む。
- DOM UIは操作hit areaに限定し、3D空間内ラベルやアイコンは可能ならWebGL texture/glyphへ寄せる。
- 音声や効果音は1ファイルにまとめず、必要場面ごとに分割する。

まだ取り込まない:

- 主描画OffscreenCanvas化。R3F/Next統合コストが高く、今回のMessenger観測でも主描画利用は未断定。
- raw `.drc` 中心の独自asset runtime。material/animation/texture参照を自前実装する必要があり、まずGLB最適化で十分に詰める。
- `depth:false` の全体適用。Messengerは描画順を強く制御している可能性があるが、汎用広場では前後関係の破綻リスクが高い。

推奨asset分割:

```text
public/models/source/plaza/
  plaza-landmark-gate.glb
  plaza-landmark-fountain.glb
  plaza-props-tree-a.glb
  plaza-props-flower-a.glb
  plaza-props-bench.glb
  plaza-hitmesh.glb

public/models/optimized/plaza/
  intro/
    plaza-intro-core.glb       # 初期表示に必要な最小背景
    plaza-intro-ui.glb         # 3Dタイトル/案内が必要な場合のみ
  chunks/
    plaza-full-0.glb
    plaza-full-1.glb
    plaza-full-2.glb
  lod/
    plaza-lod1-0.glb
    plaza-lod2-0.glb
    plaza-lod3-0.glb
  collision/
    plaza-hitmesh.glb
```

命名ルール:

- `intro-*`: 初期ロードで読んでよいもの。
- `full-*`: 本編の近景/標準品質chunk。
- `lod1-*`, `lod2-*`, `lod3-*`: 距離別の簡略chunk。
- `hitmesh-*`: 見た目に使わない当たり判定専用mesh。
- `avatar-*`: 住人の共有body/髪/服/靴。個人ごとにGLBを作らない。

Messengerの `.drc` 分割に近づけるなら、最終的には `full_0..9`, `full-lod-1_0..9` のようにchunk番号で管理する。ただしこのリポジトリでは、まずGLB内にDraco/Meshoptを入れた `optimized/*.glb` として運用する。

## 6. モデル制作パイプライン

### 6.1 Blender / DCC側のルール

環境モデル:

- 1 asset = 1 意味単位にする。例: `tree_low`, `bench_low`, `lamp_low`, `fence_segment_low`
- transformをapplyする。scaleは `(1,1,1)`、rotationはゼロ基準。
- originは接地点または配置中心に置く。
- material slot は原則 1-3 個まで。
- PBR前提にしない。色は material factor / vertex color / palette texture で持つ。
- 近景ランドマーク以外は normal map / roughness map を使わない。
- 影を前提に形状を作らない。シルエットと色面で読めるようにする。
- 木、草、花は揺れをshader/refで付ける前提で、ボーンは入れない。

キャラクター:

- 遠景住人は skinned mesh を使わず、頭・胴・髪などの単純part transformで表現する。
- 近景/詳細プレビューだけ skinned/高詳細を許可する。
- 髪型や服は追加GLBを増やしすぎず、共有geometry + material/scale差分を優先する。
- 顔は小さいKTX2/PNG atlas、または既存SVGをtexture化して使う。

### 6.2 変換コマンド

まず必ず inspect する。

```bash
pnpm exec gltf-transform inspect public/models/source/foo.glb
```

背景の標準最適化:

```bash
pnpm exec gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 1024 \
  --instance true \
  --join true \
  --palette true
```

Draco優先の静的メッシュ:

```bash
pnpm exec gltf-transform optimize input.glb output.glb \
  --compress draco \
  --texture-compress ktx2 \
  --texture-size 1024 \
  --instance true \
  --join true
```

繰り返しノードが含まれるGLB:

```bash
pnpm exec gltf-transform instance input.glb output.glb --min 5
```

互換primitiveを結合してdraw callを減らす:

```bash
pnpm exec gltf-transform join input.glb output.glb
```

注意:

- `join` は同じmeshを大量再利用している場合、頂点数を増やすことがある。繰り返し配置は `instance` を優先する。
- `--texture-compress ktx2` はVRAM/描画性能寄り。転送量最優先なら WebP/AVIF も候補だが、Messenger型のGPU圧縮とは違う。
- 透明葉テクスチャを多用すると overdraw が増える。木は板ポリ大量より低ポリ塊を優先する。

### 6.3 出力ディレクトリ

推奨:

```text
public/models/source/          # 元GLB。アプリから直接読まない
public/models/optimized/       # 圧縮済みGLB
public/models/lod/             # LOD用派生
public/models/collision/       # hitmesh / navmesh
public/models/previews/        # editor thumbnail
```

アプリから読むのは `optimized/`, `lod/`, `collision/` のみ。

## 7. ランタイム設計

### 7.1 Sceneを3層に分ける

| 層 | 目的 | 実装 |
|---|---|---|
| LandmarkLayer | 噴水、門、滑り台など意味のある近景 | 圧縮GLB、少数mesh |
| PropInstanceLayer | 木、草、花、石、柵、街灯 | `InstancedMesh` / `InstancedBufferGeometry` |
| CollisionLayer | 移動制約・当たり判定 | 2D circle/segment/低ポリhitmesh |

住人アバターは別レイヤーにし、背景の最適化と混ぜない。

### 7.2 Renderer設定

MessengerのWebGL2 contextは `antialias:false`, `preserveDrawingBuffer:false`, `stencil:false`, `depth:false` だった。Project Encounterでは次を初期値にする。

```tsx
<Canvas
  gl={{
    antialias: false,
    alpha: true,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  }}
  dpr={[1, 1.5]}
  frameloop="always"
>
  {/* layers */}
</Canvas>
```

注意:

- `depth:false` は全体では採用しない。通常の3D広場では前後関係が必要。
- UI overlay や背景専用の別canvas/passを作る場合だけ、depthなしを検討する。
- mobileでは `dpr={[1, 1.25]}` まで落とす。
- shadow map はデフォルト無効。主役1-2個だけ必要時にbaked shadowまたはblob shadowで代替する。
- postprocessは最初は使わない。LUT風の色調整はmaterial/shader内で軽く行う。

### 7.3 InstancedMeshの基本形

```tsx
function InstancedProps({
  geometry,
  material,
  placements,
}: {
  geometry: BufferGeometry;
  material: Material;
  placements: Array<{ position: Vector3Tuple; rotationY: number; scale: number }>;
}) {
  const ref = useRef<InstancedMesh>(null);
  const temp = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    placements.forEach((placement, index) => {
      temp.position.fromArray(placement.position);
      temp.rotation.set(0, placement.rotationY, 0);
      temp.scale.setScalar(placement.scale);
      temp.updateMatrix();
      mesh.setMatrixAt(index, temp.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements, temp]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placements.length]}
      frustumCulled
      castShadow={false}
      receiveShadow={false}
    />
  );
}
```

ルール:

- `placements` は `useMemo` で固定する。
- `setMatrixAt` は初期化時だけ。毎フレーム更新しない。
- instanceごとの色が必要なら `setColorAt` または `InstancedBufferAttribute` を使う。
- 風揺れは各Object3Dを動かさず、shader uniform + instance attributeで処理する。

### 7.4 merged geometryの使いどころ

向いている:

- 動かない小物
- materialが同じ
- 数が多いが個別culling不要
- 一度配置したら変わらない

向かない:

- 同じmeshを大量再利用しているもの。`InstancedMesh` の方がよい。
- 個別に表示/非表示したいもの。
- 距離LODを別々に切り替えたいもの。

### 7.5 LOD基準

初期値:

| 距離 | 表現 | 例 |
|---:|---|---|
| 0-8m | 近景GLB/instanced mesh | ベンチ、門、噴水、近い木 |
| 8-18m | 簡略mesh | 木を塊化、柵を線/箱にする |
| 18m+ | billboard/merged silhouette | 遠い木、草、建物影 |

カメラが俯瞰気味なら、遠景は形状より色面と高さ差で読ませる。

Messenger型に寄せる場合のchunk LOD:

```ts
type PlazaChunkLod = {
  id: `chunk-${number}`;
  center: [number, number, number];
  radius: number;
  full: string;
  lod1: string;
  lod2: string;
  lod3: string;
};
```

切り替え初期値:

- `0-10m`: `full`
- `10-22m`: `lod1`
- `22-38m`: `lod2`
- `38m+`: `lod3` または非表示

小惑星/俯瞰カメラでは、画面端の密度はLOD3のsilhouetteで十分に見える。すべてを近景品質で置かない。

### 7.6 当たり判定

見た目meshを当たり判定に使わない。

優先順:

1. 2D circle / capsule / segment
2. 手書き nav polygon
3. 低ポリ `hitmesh.glb`
4. `three-mesh-bvh` は最後。大量triangleに対するraycastが必要な場合だけ。

このアプリの広場なら、ほとんどは2D shapeで足りる。

```ts
type CollisionShape =
  | { kind: 'circle'; x: number; z: number; radius: number }
  | { kind: 'box'; x: number; z: number; width: number; depth: number; rotationY: number }
  | { kind: 'segment'; ax: number; az: number; bx: number; bz: number; radius: number };
```

### 7.7 React stateを毎フレーム更新しない

やる:

- player position: `useRef`
- animation time: `useFrame`
- UI同期: 5-10Hzにthrottle
- placements: `useMemo`
- asset cache: module-level cache or `useGLTF.preload`

やらない:

- `setState` で毎フレーム座標更新
- `map()` で毎レンダー配置配列を再生成
- hover/idle animationのためにReact propsを毎フレーム変える
- 背景全体をSuspense境界ごと頻繁にmount/unmountする

## 8. 予算

広場画面の当面の予算:

| 項目 | desktop | mobile |
|---|---:|---:|
| 平均fps | 50+ | 45+ |
| 25ms超えframe | 5%未満 | 10%未満 |
| 初期3D資産転送 | 3MB未満 | 2MB未満 |
| 同時draw call | 80未満 | 60未満 |
| material数 | 25未満 | 20未満 |
| texture数 | 20未満 | 14未満 |
| 最大texture | 1024px | 1024px |
| DPR | 1.5以下 | 1.25以下 |
| shadow casting | 主役1-2個のみ | 原則なし |

モデル単体の目安:

| 種別 | 目標 |
|---|---:|
| ランドマークGLB | 300KB未満 |
| 繰り返しprop GLB | 50KB未満 |
| 遠景LOD | 10KB未満 |
| 住人遠景 | 20KB未満/人相当 |
| 顔/目/口texture | 256-512px |
| noise/LUT texture | KTX2 64-512px |

### 8.1 計測手順

モデル投入前:

```bash
pnpm exec gltf-transform inspect public/models/source/plaza/foo.glb
```

見る項目:

- mesh/primitive数
- vertex count / triangle count
- material数
- texture数と最大解像度
- extension: `KHR_draco_mesh_compression` または `EXT_meshopt_compression`
- `EXT_mesh_gpu_instancing` が付いているか

最適化後:

```bash
pnpm exec gltf-transform inspect public/models/optimized/plaza/foo.glb
```

差分で確認すること:

- ファイルサイズが減っている。
- textureが1024px以下に収まっている。
- material数が増えていない。
- 繰り返し配置は `instance` 化されている。
- `join` 後にvertex countが不自然に増えていない。

実機/ブラウザ:

```bash
BASE_URL=http://localhost:1421 node scripts/3d-check.mjs
node scripts/3d-fps.mjs
```

2026-06-24 のローカル `BASE_URL=http://localhost:1420` 実測:

| scenario | viewport | avg FPS | max ms | 16.7ms超え | 33.4ms超え | 判定 |
|---|---:|---:|---:|---:|---:|---|
| `home-opening-mobile` | 390x844 | 120.0 | 9.4 | 0 | 0 | OK |
| `home-begin-mobile` | 390x844 | 120.0 | 9.4 | 0 | 0 | OK |
| `plaza-opening` | 1200x900 | 120.0 | 9.4 | 0 | 0 | OK |
| `plaza-begin-8` | 1200x900 | 57.8 | 32.4 | 119 | 0 | 平均fps OK、spike要監視 |
| `plaza-begin-60` | 1200x900 | 48.0 | 80.6 | 145 | 8 | 平均fps OK、spike改善余地あり |

このrunでは、通常ホーム体験は120Hz環境でほぼ上限に張り付き、`plaza-60` も平均45fpsを超えた。ただし大量住人プレビューでは33.4ms超えframeが残るため、「Messenger同等」と言い切るには継続して spike を削る。

Playwrightで見る項目:

- WebGL canvasが非blank。
- 画面内の主要ランドマークが欠けていない。
- mobile viewportでUIと3Dラベルが重ならない。
- frame intervalの25ms超え比率。
- networkで初期3D資産が予算内か。

Chrome DevToolsで見る項目:

- Performance: long task がロード直後に集中しすぎていないか。
- Memory: 画面遷移後にgeometry/textureが解放されるか。
- Rendering: FPS meter、paint flashing。
- Network: `.glb`, `.ktx2`, `.wasm`, 音声の取得順。

## 9. 実装ステップ

### Phase 1: 棚卸し

1. `public/models/*.glb` を `gltf-transform inspect` で一覧化する。
2. vertex count, draw call, material count, texture size を表にする。
3. `tree_high*.glb`, `character1-converted.glb` のような重い資産を広場背景から外す。
4. 背景で繰り返し配置しているものをカテゴリ化する。

成果物:

- `docs/specs/3d-performance.md` の資産表を更新
- `public/models/source/` と `public/models/optimized/` の運用開始

### Phase 2: 繰り返し背景のinstancing

対象:

- 木
- 草
- 花
- 柵
- 石
- 街灯
- ベンチ

実装:

- `PropInstanceLayer` を作る。
- 同一geometry/materialごとに1 `InstancedMesh`。
- placementはseed固定で生成し、`useMemo` で固定する。
- 個別React componentを廃止する。

完了条件:

- 背景propのReact node数が増えない。
- draw callがprop数に比例しない。
- 見た目の密度が現状以上。

### Phase 3: 圧縮GLB/KTX2

実装:

- 元GLBは `public/models/source/`。
- アプリ読み込みは `public/models/optimized/`。
- `gltf-transform optimize` をnpm script化する。

候補script:

```json
{
  "scripts": {
    "models:inspect": "gltf-transform inspect",
    "models:optimize": "gltf-transform optimize"
  }
}
```

必要なら専用Node scriptで一括処理する。

完了条件:

- 広場で読むGLBがすべて圧縮済み。
- 1024px超のtextureが広場で読まれない。
- `gltf-transform inspect` でmaterial/texture/draw callが予算内。

### Phase 4: LOD

実装:

- `LODGroup` または独自距離判定で切り替える。
- 近景/中景/遠景を別assetにする。
- 遠景はできるだけ shader/geometry primitive で作る。

完了条件:

- カメラから遠いpropのtriangle数が大きく落ちる。
- LOD切替でポップが目立たない。
- mobileで平均45fps以上。

### Phase 5: 住人アバター軽量化

実装:

- 遠景住人は skinned mesh なし。
- 体・頭・髪を共有geometry化。
- 歩き/待機はboneではなくpart transformかshaderで表現。
- 近景詳細だけ高品質モデルを遅延ロード。

完了条件:

- `plaza-60` のfpsが住人数に比例して崩れない。
- 住人60人でもmaterial/textureが増え続けない。

### Phase 6: raw DRC / worker化

Phase 1-5で足りない場合だけ行う。

候補:

- 静的背景propを `.drc` BufferGeometry として直接読む。
- Draco decodeをworkerに寄せる。
- OffscreenCanvasは最後。Next/R3Fとの統合コストが高い。

## 10. 類似サービス・OSS

### Hubs

Repository: `https://github.com/Hubs-Foundation/hubs`

特徴:

- A-Frame + Three.js系のmulti-user virtual spaces。
- `networked-aframe`, `three-mesh-bvh`, `three-pathfinding`, `three-gltf-extensions`, `ammo.js`, `three-ammo` を使う。
- glTF scene、physics、network同期、WebRTC/mediasoup 周りが強い。

使える点:

- multi-user空間、当たり判定、pathfinding、avatar/network同期の参考。

Messengerとの違い:

- VR/social room寄りで、Messengerほど小さく密な1画面ゲームに特化していない。
- A-Frame/scene graphの抽象が厚い。

### Hyperfy

Repository: `https://github.com/hyperfy-xyz/hyperfy`

特徴:

- Three.js, `three-mesh-bvh`, `@pixiv/three-vrm`, LiveKit, msgpackr を使うworld building platform。
- custom client/viewer/serverを持つ。

使える点:

- world/avatar/networkを現代的なThree.jsで組む参考。
- `three-mesh-bvh` の使いどころ。

Messengerとの違い:

- ユーザー生成world/VRM寄り。小さな固定世界を極限まで軽く作る思想とは違う。

### Webaverse

Repository: `https://github.com/webaverse-studios/webaverse`

特徴:

- Three.js fork, `@pixiv/three-vrm`, troika text, engine package。
- avatar/metaverse sandbox寄り。

使える点:

- VRM/avatarやengine分割の参考。

Messengerとの違い:

- GLB/VRM/汎用コンテンツ寄りで、Messengerのようなraw `.drc` + 独自shader最適化とは方向が違う。

### PlayCanvas

Repository: `https://github.com/playcanvas/engine`

特徴:

- OSSのWebGL engine。商用editorもある。
- asset pipeline, batching, material, mobile向け調整が成熟している。

使える点:

- エンジンとしての最適化思想、モバイルWebGL予算。

Messengerとの違い:

- このリポジトリに導入するには大きすぎる。直接移行対象ではない。

## 11. OSSツール候補

| ツール | 用途 | 採用判断 |
|---|---|---|
| Three.js | 描画基盤 | 既に採用 |
| React Three Fiber | React統合 | 既に採用。背景は薄く使う |
| glTF Transform | inspect/optimize/instance/join/KTX2 | 採用 |
| Draco | geometry圧縮 | GLB内圧縮から採用。raw `.drc` は後段 |
| meshoptimizer / gltfpack | meshopt圧縮、頂点最適化、LOD | 採用候補 |
| KTX-Software / BasisU | KTX2 texture | 採用 |
| three-mesh-bvh | 複雑collision/raycast | 必要時のみ |
| gltfjsx | React component化 | 背景大量配置には使わない |
| Blender | source model制作 | 採用 |

根拠:

- Dracoは3D mesh/point cloudの圧縮・転送改善用ライブラリ。
- KTX2はOpenGL/Vulkan等のGPU API向けtexture containerで、Basis Universal形式を含められる。
- meshoptimizerはGPU pipeline向けにmeshを小さく速くする最適化群と `gltfpack` を提供する。
- glTF Transform CLIは `optimize`, `inspect`, `instance`, `join`, `texture-compress ktx2` を提供する。

## 12. やらないこと

- 背景を豪華にするためだけにGLBを追加する。
- 全propにshadow/outline/postprocessを付ける。
- 見た目用meshをそのままcollisionに使う。
- 住人全員に高詳細skinned meshを使う。
- React stateで毎フレーム3D座標を更新する。
- いきなりR3Fを捨てて独自engineへ全面移行する。

## 13. 受入基準

- [x] `plaza-8` が平均50fps以上。
- [x] `plaza-60` が平均45fps以上。
- [ ] 25ms超えframeが desktop 5%未満、mobile 10%未満。
- [ ] 初期3D資産転送が desktop 3MB未満、mobile 2MB未満。
- [ ] 広場のdraw callが desktop 80未満、mobile 60未満。
- [x] 噴水、門、ベンチ、街灯は見て意味が分かる。
- [ ] 滑り台などの詳細ランドマークは軽量本編背景では常時表示しない。詳細背景/別モードで扱う。
- [x] 木・草・花は抽象化しても、公園の密度が保たれている。
- [x] 重い `tree_high*.glb` と `character1-converted.glb` を広場背景に直接使わない。
- [ ] 広場で読むモデルが `source/` ではなく `optimized/` 由来。
- [ ] `pnpm typecheck` と `pnpm lint` が通る。
- [x] `BASE_URL=http://localhost:1421 node scripts/3d-check.mjs` 相当がエラーなしで通る。
- [x] `node scripts/3d-fps.mjs` の結果をこの文書に追記している。

## 14. 参考リンク

- Messenger: `https://messenger.abeto.co/`
- Three.js InstancedMesh: `https://threejs.org/docs/#api/en/objects/InstancedMesh`
- Three.js DRACOLoader: `https://threejs.org/docs/#examples/en/loaders/DRACOLoader`
- Three.js KTX2Loader: `https://threejs.org/docs/#examples/en/loaders/KTX2Loader`
- glTF Transform CLI: `https://gltf-transform.dev/cli`
- Google Draco: `https://github.com/google/draco`
- Khronos KTX-Software: `https://github.com/KhronosGroup/KTX-Software`
- meshoptimizer: `https://github.com/zeux/meshoptimizer`
- Hubs: `https://github.com/Hubs-Foundation/hubs`
- Hyperfy: `https://github.com/hyperfy-xyz/hyperfy`
- Webaverse: `https://github.com/webaverse-studios/webaverse`
- PlayCanvas engine: `https://github.com/playcanvas/engine`
