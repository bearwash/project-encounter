'use client';

/**
 * Outfit パーツ — 4 バリアント (tee / hoodie / dress / jacket)。
 *
 * 役割: トルソ (シャツ) + 脚部 (パンツ) + 靴 を 1 セットで描画する。
 *
 * 参考: character-image3.png の各 UNIT に従い、
 *   - SWEATER (黒パーカー o04): 胸〜胴を覆う黒、ネックライン (フード紐) 装飾あり
 *   - LEG UNIT (デニム): 腿〜脛をブルーで、足首にロールアップ (cuff) 装飾
 *   - FOOT UNIT (ハイカット): dark upper + white sole + 紐ライン
 *
 * Avatar3D 本体は脚部のアニメ (歩行スイング) のために hip ref を必要とするため、
 * Leg は別 export して本体側で組み立てる。
 */

import { type RefObject } from 'react';
import type { Group } from 'three';
import { FlatBox } from './shared/FlatBox';
import { findOutfit, type PartId } from './catalog';

export type OutfitProps = {
  id?: PartId;
};

/** Outfit のトルソ部分 (シャツ系)。脚と靴は Leg で別途。 */
export function OutfitTorso({ id }: OutfitProps) {
  const def = findOutfit(id);
  const top = def.colors.top;

  switch (def.shape) {
    case 'hoodie':
      return <HoodieTorso color={top} />;
    case 'dress':
      return <DressTorso color={top} />;
    case 'jacket':
      return <JacketTorso color={top} />;
    case 'tee':
    default:
      return <TeeTorso color={top} />;
  }
}

/**
 * Outfit カラー読み取りヘルパー — 腕/脚/靴の色を Avatar3D 本体に伝える。
 */
export function outfitColors(id?: PartId) {
  const def = findOutfit(id);
  return def.colors;
}

// =============================================================
// o04: パーカー (黒) — S001 の "SWEATER PIXELS"
//
//   多面化: 胴体 + 首ガード (頭の下に届かせて首の skin を隠す) +
//   フード覗き + 裾のリブ。
// =============================================================
function HoodieTorso({ color }: { color: string }) {
  return (
    <group>
      {/* 胴体本体 — 幅を 0.58 まで広げて頭 (0.85) とのバランス改善 */}
      <FlatBox
        args={[0.58, 0.5, 0.38]}
        color={color}
        position={[0, 0.8, 0]}
      />
      {/* === 首ガード ===
       *   y=1.075 (頭底面) まで届くようにして「首の肌色」を隠す。
       *   y=1.0 中心、高 0.18 → y=0.91 〜 1.09 で頭の下端に重なる。 */}
      <FlatBox
        args={[0.42, 0.18, 0.32]}
        color={color}
        position={[0, 1.0, 0]}
      />
      {/* フード覗き (首元の前方、深い V 字風) */}
      <FlatBox
        args={[0.16, 0.06, 0.04]}
        color={color}
        position={[0, 1.07, 0.18]}
      />
      {/* 裾 (リブの段差) */}
      <FlatBox
        args={[0.6, 0.06, 0.4]}
        color={color}
        position={[0, 0.55, 0]}
      />
    </group>
  );
}

/** 首の skin を隠す共通ネックガード。各 Torso の中で呼ぶ。 */
function NeckGuard({ color }: { color: string }) {
  return (
    <FlatBox
      args={[0.4, 0.16, 0.3]}
      color={color}
      position={[0, 1.0, 0]}
    />
  );
}

// =============================================================
// o01: T シャツ (青) — シンプルな半袖
// =============================================================
function TeeTorso({ color }: { color: string }) {
  return (
    <group>
      <FlatBox
        args={[0.56, 0.46, 0.36]}
        color={color}
        position={[0, 0.78, 0]}
      />
      <NeckGuard color={color} />
      {/* 襟 (浅い V 字風) */}
      <FlatBox
        args={[0.14, 0.05, 0.04]}
        color={color}
        position={[0, 1.04, 0.19]}
      />
    </group>
  );
}

// =============================================================
// o02: ワンピース (桃) — 上下一体
// =============================================================
function DressTorso({ color }: { color: string }) {
  return (
    <group>
      {/* 胴部 */}
      <FlatBox
        args={[0.56, 0.45, 0.36]}
        color={color}
        position={[0, 0.8, 0]}
      />
      <NeckGuard color={color} />
      {/* スカート部 (やや裾広がり) */}
      <FlatBox
        args={[0.62, 0.22, 0.42]}
        color={color}
        position={[0, 0.48, 0]}
      />
    </group>
  );
}

// =============================================================
// o03: ジャケット (白) — フォーマル風
// =============================================================
function JacketTorso({ color }: { color: string }) {
  return (
    <group>
      <FlatBox
        args={[0.58, 0.52, 0.38]}
        color={color}
        position={[0, 0.8, 0]}
      />
      <NeckGuard color={color} />
      {/* ラペル (襟、両側) */}
      <FlatBox
        args={[0.06, 0.16, 0.04]}
        color={color}
        position={[-0.16, 0.96, 0.2]}
        rotation={[0, 0, 0.15]}
      />
      <FlatBox
        args={[0.06, 0.16, 0.04]}
        color={color}
        position={[0.16, 0.96, 0.2]}
        rotation={[0, 0, -0.15]}
      />
    </group>
  );
}

// =============================================================
// Leg — 太もも + 脛 + 靴 (+ 紐ライン + ロールアップ cuff)
//   Avatar3D 本体が hipRef を制御し、歩行スイングを乗せる
// =============================================================

/**
 * Leg — 脚 + 靴を組み立てる。group は y=0.55 (= 股関節) を原点に持ち、
 * すべて世界 Y=0 で靴底が地面に乗るよう調整してある。
 *
 * 世界 Y レイアウト (group ロカル相対 = world Y − 0.55):
 *   sole       y = 0.00 〜 0.06   (h=0.06, c=0.03   → 相対 -0.52)
 *   shoe upper y = 0.06 〜 0.22   (h=0.16, c=0.14   → 相対 -0.41)   ハイカット感
 *   cuff       y = 0.22 〜 0.28   (h=0.06, c=0.25   → 相対 -0.30)
 *   shin       y = 0.28 〜 0.45   (h=0.17, c=0.365  → 相対 -0.185)
 *   thigh      y = 0.45 〜 0.55   (h=0.10, c=0.50   → 相対 -0.05)
 *
 *  紐 (lace) は upper 上部に 1 本貼って "ハイカット" を表現。
 */
export function Leg({
  side,
  hipRef,
  bottom,
  shoeUpper,
  shoeSole,
}: {
  side: 'L' | 'R';
  hipRef: RefObject<Group | null>;
  bottom: string;
  shoeUpper: string;
  shoeSole: string;
}) {
  const sign = side === 'L' ? -1 : 1;
  const dx = sign * 0.02;
  return (
    <group ref={hipRef} position={[sign * 0.13, 0.55, 0]}>
      {/* 太もも */}
      <FlatBox
        args={[0.18, 0.1, 0.2]}
        color={bottom}
        position={[0, -0.05, 0]}
      />
      {/* 脛 */}
      <FlatBox
        args={[0.16, 0.17, 0.18]}
        color={bottom}
        position={[dx, -0.185, 0]}
      />
      {/* デニムのロールアップ (cuff) — 脛の足首部分に少し太い帯 */}
      <FlatBox
        args={[0.18, 0.06, 0.2]}
        color={bottom}
        position={[dx, -0.3, 0]}
      />
      {/* === 靴 === */}
      {/* upper (ハイカット部分、dark): 高め (0.16) でボリューム up */}
      <FlatBox
        args={[0.22, 0.16, 0.32]}
        color={shoeUpper}
        position={[dx, -0.41, 0.06]}
      />
      {/* sole (白): 厚め (0.06) で接地感 up */}
      <FlatBox
        args={[0.24, 0.06, 0.34]}
        color={shoeSole}
        position={[dx, -0.52, 0.06]}
      />
      {/* 靴紐ライン (白の細い帯) — upper 上面に貼る */}
      <FlatBox
        args={[0.2, 0.03, 0.1]}
        color={shoeSole}
        position={[dx, -0.36, 0.18]}
        outline={0}
      />
    </group>
  );
}
