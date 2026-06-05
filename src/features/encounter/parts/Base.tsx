'use client';

/**
 * Base パーツ — 肌色違いの「素体」(頭/手 部分)。
 *
 * 体や脚は Outfit が色を持つので、Base は主に頭と手の skin を担当する。
 *
 * 参考: character-image3.png の "HEAD UNIT" に従い、頭は 0.85^3 の単一ボックス。
 *
 * Note: 腕や脚の構造は Avatar3D 本体側にアニメ用 ref と一緒に置く必要があるため、
 * 「skin 色だけを公開する」ヘルパーも export する。
 */

import { useRef, type RefObject } from 'react';
import type { Group } from 'three';
import { FlatBox } from './shared/FlatBox';
import { findBase, type PartId } from './catalog';

export type BaseProps = {
  id?: PartId;
};

/**
 * `skinColor(id)` — Avatar3D 本体や Outfit が腕/手の色を必要とするときに使う。
 */
export function skinColor(id?: PartId): string {
  return findBase(id).skin;
}

/** 頭の box (顔の Face は別パーツが上に乗せる)。 */
export function Base({ id }: BaseProps) {
  const skin = skinColor(id);
  return (
    <group>
      {/* 頭 (顔含む素体)。Face はこの前面に重ねる。 */}
      <FlatBox args={[0.85, 0.85, 0.85]} color={skin} position={[0, 1.5, 0]} />
    </group>
  );
}

/**
 * 腕 (上腕 + 前腕 + 手) — Outfit 色 + skin 色を組み合わせる。
 *
 * 骨格 (bone) 階層:
 *   shoulder (y=1.03)
 *     └─ upper arm box
 *     └─ elbow (y=-0.28 from shoulder = y=0.75 in world)
 *           └─ forearm box
 *           └─ hand box
 *
 * Avatar3D 本体が shoulderRef / elbowRef を制御してアニメさせる。
 */
export function Arm({
  side,
  shoulderRef,
  elbowRef,
  outfitColor,
  skinColor: skin,
}: {
  side: 'L' | 'R';
  shoulderRef: RefObject<Group | null>;
  elbowRef?: RefObject<Group | null>;
  outfitColor: string;
  skinColor: string;
}) {
  const sign = side === 'L' ? -1 : 1;
  const dx = sign * 0.04;
  return (
    <group ref={shoulderRef} position={[sign * 0.32, 1.03, 0]}>
      {/* 上腕 (shoulder の直下) */}
      <FlatBox args={[0.14, 0.3, 0.18]} color={outfitColor} position={[0, -0.13, 0]} />
      {/* 肘 group: 上腕の下端に置く。回転すると前腕 + 手が一緒に曲がる */}
      <group ref={elbowRef} position={[0, -0.28, 0]}>
        {/* 前腕 (elbow からの相対) */}
        <FlatBox args={[0.13, 0.28, 0.16]} color={outfitColor} position={[dx, -0.14, 0]} />
        {/* 手 (skin) */}
        <FlatBox args={[0.15, 0.12, 0.16]} color={skin} position={[dx, -0.34, 0]} />
      </group>
    </group>
  );
}

/** 内部の Group ref を 1 個作る簡易ヘルパー (Avatar3D 本体から呼ぶ用)。 */
export function useGroupRef(): RefObject<Group | null> {
  return useRef<Group>(null);
}
