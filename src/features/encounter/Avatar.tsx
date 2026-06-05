'use client';

/**
 * Avatar — avatar_code に従って 3D アバターを描画する 2D ラッパー。
 *
 * 内部で <Canvas> + <Avatar3D> を構築し、UI 側からは旧 SVG 時代の API
 * (`code` / `mode` / `size` / `className`) で呼べる。
 *
 *   - パーツカタログ (parts/catalog.ts) が各 ID の色を持つので color override 不要
 *   - 受け取った `code` をそのまま Avatar3D に渡し、avatarCode に対応する見た目を出す
 *
 *   - mode='idle'    : 呼吸 + アイドル
 *   - mode='walking' : 足踏み (Avatar3D の walking)
 *   - mode='popup'   : walking (簡易: 入場アニメは外側のラッパー側で付ける)
 *
 * size は 64×96 (viewBox 比率) を維持する。
 */

import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Avatar3D, type Avatar3DMode } from './Avatar3D';

/** Canvas 初期化時に lookAt を明示する (Avatar3D は y=0 起点ではないため)。 */
function CameraLook({ at }: { at: [number, number, number] }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(at[0], at[1], at[2]);
    camera.updateProjectionMatrix();
  }, [camera, at]);
  return null;
}

export type AvatarMode = 'idle' | 'walking' | 'popup';

type Props = {
  code: string;
  mode?: AvatarMode;
  /** 描画幅 (px)。高さは旧 SVG viewBox 比率 (64:96) に合わせる */
  size?: number;
  className?: string;
};

function toAvatar3DMode(mode: AvatarMode): Avatar3DMode {
  return mode === 'walking' || mode === 'popup' ? 'walking' : 'idle';
}

export function Avatar({ code, mode = 'idle', size = 64, className = '' }: Props) {
  const height = Math.round((size * 96) / 64);
  const userId = code || 'avatar';

  return (
    <div
      className={`avatar-root avatar-mode-${mode} ${className}`}
      style={{ width: size, height }}
      aria-label={`avatar ${code}`}
      role="img"
    >
      <Canvas
        camera={{ position: [0, 1.4, 5.6], fov: 26 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <CameraLook at={[0, 1.15, 0]} />
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#FFE9CE', '#B4A595', 0.4]} position={[0, 5, 0]} />
        <directionalLight position={[3, 6, 4]} intensity={0.9} />
        <Avatar3D
          avatarCode={code}
          userId={userId}
          mode={toAvatar3DMode(mode)}
          position={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}
