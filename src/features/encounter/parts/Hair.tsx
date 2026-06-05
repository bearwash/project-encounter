'use client';

/**
 * Hair パーツ — 6 バリアント。すべて HelmetShell を共通ベースとし、
 * その上にバリアント固有のディテール (ぴょこん、ロング垂れ、スパイク等) を加算する。
 *
 *   spec: docs/specs/avatar.md §3 / §10
 *   reference: character-image3.png の "HAIR UNIT" (緑/桃バイカラーの 4 面図)
 *
 * 役割分担:
 *   - HelmetShell が「禿げ無し」を保証 (頭をぴったり覆う多面シェル)
 *   - 各 variant は装飾レイヤを足すだけ
 */

import { Suspense } from 'react';
import { FlatBox } from './shared/FlatBox';
import { HelmetShell } from './shared/HelmetShell';
import { findHair, type PartId } from './catalog';
import { GltfPart } from './glb/GltfPart';

export type HairProps = {
  /** PartId ('01' .. '06'). 未指定/未知は h01 にフォールバック。 */
  id?: PartId;
};

export function Hair({ id }: HairProps) {
  const def = findHair(id);
  const primary = def.colors.primary;
  const secondary = def.colors.secondary ?? primary;

  // GLB 指定があれば voxel をスキップして GLB を描画 (失敗時は voxel にフォールバック)。
  if (def.gltf) {
    return (
      <Suspense fallback={<HelmetShell colorL={primary} colorR={secondary} />}>
        <GltfPart src={def.gltf} />
      </Suspense>
    );
  }

  switch (def.shape) {
    case 'bicolor':
      return <HairBicolor colorL={primary} colorR={secondary} />;
    case 'long':
      return <HairLong color={primary} />;
    case 'spike':
      return <HairSpike color={primary} />;
    case 'verysHort':
      return <HairVeryShort color={primary} />;
    case 'fluffy':
      return <HairFluffy color={primary} />;
    case 'short':
    default:
      return <HairShort color={primary} />;
  }
}

// =============================================================
// h05: バイカラー (緑/桃) — S001
//
//   HelmetShell (左右 split) + 個性レイヤ:
//   - 頂上のぴょこん 5 個 (G/G/G/P/P)
//   - サイドの "毛束" ロック (顎下で内向きに跳ねる)
//   - 顎下まで降りる「ロング垂れ」(side curtains)
// =============================================================

function HairBicolor({ colorL, colorR }: { colorL: string; colorR: string }) {
  return (
    <group>
      <HelmetShell colorL={colorL} colorR={colorR} />

      {/* 頂上のぴょこん 5 個 (左 2 + 中央 1 + 右 2) */}
      <FlatBox
        args={[0.16, 0.22, 0.16]}
        color={colorL}
        position={[-0.36, 2.14, 0.1]}
        rotation={[0.04, 0, 0.22]}
      />
      <FlatBox
        args={[0.2, 0.28, 0.2]}
        color={colorL}
        position={[-0.18, 2.24, 0.06]}
        rotation={[0.04, 0, 0.1]}
      />
      <FlatBox
        args={[0.22, 0.32, 0.22]}
        color={colorL}
        position={[-0.02, 2.28, 0.02]}
      />
      <FlatBox
        args={[0.2, 0.28, 0.2]}
        color={colorR}
        position={[0.16, 2.24, 0]}
        rotation={[0.02, 0, -0.1]}
      />
      <FlatBox
        args={[0.16, 0.22, 0.16]}
        color={colorR}
        position={[0.34, 2.13, 0.08]}
        rotation={[0.02, 0, -0.22]}
      />

      {/*
       * ロング垂れ (side curtain): 顎下まで降りるサイドの長い髪。
       * Z 厚みを 0.10 まで詰めて横顔から見たときの「板」感を抑える。
       * Z 中心を -0.05 にして顔の前面より少し後ろに寄せる (= 横顔で頬の前に出ない)。
       */}
      <FlatBox
        args={[0.1, 0.55, 0.5]}
        color={colorL}
        position={[-0.46, 1.0, -0.05]}
      />
      <FlatBox
        args={[0.1, 0.55, 0.5]}
        color={colorR}
        position={[0.46, 1.0, -0.05]}
      />

      {/* 顎ライン付近の "毛束" — 内向きに跳ねる (G/P 継続) */}
      <FlatBox
        args={[0.12, 0.14, 0.12]}
        color={colorL}
        position={[-0.4, 0.78, 0.18]}
        rotation={[0, 0, -0.32]}
      />
      <FlatBox
        args={[0.12, 0.14, 0.12]}
        color={colorR}
        position={[0.4, 0.78, 0.18]}
        rotation={[0, 0, 0.32]}
      />

      {/*
       * 前髪 (バング) — 額をふんわり覆う左右分割の太い帯。
       * z=0.56 で頭前面 (0.425+輪郭) より十分手前に出して Z-fighting 回避。
       * Y=1.78 中心 / 高 0.26 = y 1.65〜1.91 で目より上のみカバー (目を出す)。
       */}
      <FlatBox
        args={[0.5, 0.26, 0.12]}
        color={colorL}
        position={[-0.22, 1.78, 0.56]}
      />
      <FlatBox
        args={[0.5, 0.26, 0.12]}
        color={colorR}
        position={[0.22, 1.78, 0.56]}
      />
    </group>
  );
}

// =============================================================
// h01: ショート (茶) — シンプルな男児ショート
// =============================================================
function HairShort({ color }: { color: string }) {
  return (
    <group>
      <HelmetShell colorL={color} />
      {/* 頂のぴょこん 2 個 */}
      <FlatBox
        args={[0.18, 0.18, 0.18]}
        color={color}
        position={[-0.14, 2.1, 0.1]}
      />
      <FlatBox
        args={[0.16, 0.16, 0.16]}
        color={color}
        position={[0.16, 2.08, 0.06]}
      />
      {/* 前髪 (短め、目より上) */}
      <FlatBox
        args={[0.78, 0.16, 0.1]}
        color={color}
        position={[0, 1.84, 0.52]}
      />
    </group>
  );
}

// =============================================================
// h02: ロング (黒) — 肩近くまで降りる長髪
// =============================================================
function HairLong({ color }: { color: string }) {
  return (
    <group>
      <HelmetShell colorL={color} />
      {/* サイドのロング垂れ (肩までしっかり降りる) */}
      <FlatBox
        args={[0.16, 0.78, 0.5]}
        color={color}
        position={[-0.49, 0.85, -0.04]}
      />
      <FlatBox
        args={[0.16, 0.78, 0.5]}
        color={color}
        position={[0.49, 0.85, -0.04]}
      />
      {/* 中央分け前髪 (流す) */}
      <FlatBox
        args={[0.4, 0.18, 0.12]}
        color={color}
        position={[-0.18, 1.82, 0.55]}
        rotation={[0, 0, 0.2]}
      />
      <FlatBox
        args={[0.4, 0.18, 0.12]}
        color={color}
        position={[0.18, 1.82, 0.55]}
        rotation={[0, 0, -0.2]}
      />
    </group>
  );
}

// =============================================================
// h03: スパイク (金) — ツンツン直立
// =============================================================
function HairSpike({ color }: { color: string }) {
  return (
    <group>
      <HelmetShell colorL={color} />
      {/* 大型スパイク 3 本 (中央が一番高い) */}
      <FlatBox
        args={[0.16, 0.42, 0.16]}
        color={color}
        position={[-0.24, 2.27, 0.05]}
        rotation={[0, 0, 0.2]}
      />
      <FlatBox
        args={[0.2, 0.5, 0.2]}
        color={color}
        position={[0, 2.34, 0.02]}
      />
      <FlatBox
        args={[0.16, 0.42, 0.16]}
        color={color}
        position={[0.24, 2.27, 0.05]}
        rotation={[0, 0, -0.2]}
      />
    </group>
  );
}

// =============================================================
// h04: ベリショ (赤) — 頭にぴったり、前髪短め
// =============================================================
function HairVeryShort({ color }: { color: string }) {
  return (
    <group>
      <HelmetShell colorL={color} />
      {/* 小さな前髪 — 額の半分だけ */}
      <FlatBox
        args={[0.56, 0.1, 0.08]}
        color={color}
        position={[0, 1.86, 0.5]}
      />
    </group>
  );
}

// =============================================================
// h06: ふんわり (銀) — ボリュームのある柔らかい髪
// =============================================================
function HairFluffy({ color }: { color: string }) {
  return (
    <group>
      <HelmetShell colorL={color} />
      {/* ふんわりした頂のボリューム (ぴょこん 4 個) */}
      <FlatBox
        args={[0.22, 0.18, 0.22]}
        color={color}
        position={[-0.26, 2.08, 0.04]}
      />
      <FlatBox
        args={[0.24, 0.22, 0.24]}
        color={color}
        position={[-0.08, 2.12, 0.0]}
      />
      <FlatBox
        args={[0.24, 0.22, 0.24]}
        color={color}
        position={[0.12, 2.12, -0.02]}
      />
      <FlatBox
        args={[0.22, 0.18, 0.22]}
        color={color}
        position={[0.3, 2.08, 0.02]}
      />
      {/* 前髪 (中央分けで両側に流す) */}
      <FlatBox
        args={[0.38, 0.22, 0.12]}
        color={color}
        position={[-0.18, 1.8, 0.54]}
        rotation={[0, 0, 0.28]}
      />
      <FlatBox
        args={[0.38, 0.22, 0.12]}
        color={color}
        position={[0.18, 1.8, 0.54]}
        rotation={[0, 0, -0.28]}
      />
    </group>
  );
}
