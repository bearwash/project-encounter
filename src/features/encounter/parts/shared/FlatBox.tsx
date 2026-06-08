'use client';

/**
 * FlatBox — voxel パーツ用の基本プリミティブ。
 *
 *   boxGeometry + meshBasicMaterial (フラット) + drei Outlines (黒輪郭)。
 *   Outline 既定値は 0.04 (旧 0.05 から細く) で、カクカク感を少し抑える。
 *
 * 各パーツ (Hair / Outfit / Face / Base) は内部でこの FlatBox を組み上げる。
 */

import { Outlines } from '@react-three/drei';
import { INK, OUTLINE_DEFAULT } from './colors';

type Vec3 = [number, number, number];

export type FlatBoxProps = {
  args: [number, number, number];
  color: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
  /** Outlines の thickness。0 で無効化 (顔の点目など細かいパーツ向け)。 */
  outline?: number;
  /** 影を落とすか。Hair / Outfit は true、Face の点目は false が無難。 */
  castShadow?: boolean;
  /**
   * 影を受けるか。meshBasicMaterial は無光源なので影を受けず、このフラグは
   * 実質無視される。既定 false にして無駄な shadow-receive 計上を避ける
   * (地面など影を受けたい面は meshStandardMaterial を使う)。
   */
  receiveShadow?: boolean;
};

export function FlatBox({
  args,
  color,
  position,
  rotation,
  scale,
  outline = OUTLINE_DEFAULT,
  castShadow = true,
  receiveShadow = false,
}: FlatBoxProps) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={args} />
      <meshBasicMaterial color={color} />
      {outline > 0 && <Outlines thickness={outline} color={INK} />}
    </mesh>
  );
}
