'use client';

/**
 * GltfPart — GLB / GLTF ファイルをパーツとして読み込み描画する。
 *
 *   設計:
 *     - drei の `useGLTF` で GLB をキャッシュ付きで読み込む
 *     - `scene` を clone してから描画 (同一 GLB を複数インスタンス化するため)
 *     - 影 / マテリアルを必要に応じて override
 *
 *   モデル要件 (MagicaVoxel / Meshy AI 等で作成する際の前提):
 *     - 原点: 足元 (y=0)
 *     - スケール: 高さ約 2.0 unit (= Avatar3D の voxel スケールと整合)
 *     - 向き: +Z 方向を「正面」(顔がカメラに向かう)
 *     - パーツ単位の GLB (head / hair / outfit / base 等) は、それぞれの本来の位置で出力
 *
 *   呼び出し例:
 *     <GltfPart src="/avatars/parts/hair_05.glb" position={[0, 0, 0]} />
 */

import { useGLTF } from '@react-three/drei';
import { useMemo, type ComponentProps } from 'react';
import type { Group } from 'three';

type Vec3 = [number, number, number];

type Props = Omit<ComponentProps<'group'>, 'children'> & {
  /** public/ からの絶対パス (例: '/avatars/parts/hair_05.glb') */
  src: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3 | number;
};

export function GltfPart({ src, position, rotation, scale, ...groupProps }: Props) {
  const { scene } = useGLTF(src);
  // 1 ファイルを複数インスタンス化したいので clone する
  const cloned = useMemo(() => scene.clone(true) as Group, [scene]);

  return (
    <group position={position} rotation={rotation} scale={scale} {...groupProps}>
      <primitive object={cloned} />
    </group>
  );
}

/** Avatar3D の起動時に主要 GLB をプリロードしたいとき用ヘルパー。 */
export function preloadGltf(src: string) {
  useGLTF.preload(src);
}
