'use client';

/**
 * Face パーツ — 4 バリアント (smile / surprised / smug / wink)。
 *
 * 参考: character-image3.png の "FACIAL FEATURES" に従い、
 *   - 眉毛 (EYEBROW POSITION): 目より上 0.1 unit に細い水平バー
 *   - 目  (EYE POSITION): 黒い方形ドット
 *   - 口  (MOUTH): バリアントごとに変える
 *
 * 頭中心 y=1.5、頭前面 z=0.425 + 輪郭 0.05 ≒ 0.475 のすぐ前 (z=0.46) に貼る。
 */

import { FlatBox } from './shared/FlatBox';
import { INK } from './shared/colors';
import { findFace, type PartId } from './catalog';

export type FaceProps = {
  id?: PartId;
};

const Z = 0.46;
const FACE_OUT = 0.018;

export function Face({ id }: FaceProps) {
  const def = findFace(id);

  const isSurprised = def.shape === 'surprised';
  const isSmug = def.shape === 'smug';
  const isWink = def.shape === 'wink';

  const eyeSize: [number, number, number] = isSurprised
    ? [0.12, 0.12, 0.03]
    : [0.1, 0.1, 0.03];
  const eyeScaleY = isSmug ? 0.25 : 1;
  const eyeY = 1.58;
  const eyeX = 0.17;
  const browY = eyeY + 0.16;
  const mouthY = 1.32;

  return (
    <group>
      {/* === 眉毛 (左右 — 軽く内側下がり / どや顔は上がり) === */}
      <FlatBox
        args={[0.14, 0.025, 0.03]}
        color={INK}
        position={[-eyeX, browY, Z]}
        rotation={[0, 0, isSmug ? -0.18 : 0.08]}
        outline={FACE_OUT}
      />
      <FlatBox
        args={[0.14, 0.025, 0.03]}
        color={INK}
        position={[eyeX, browY, Z]}
        rotation={[0, 0, isSmug ? 0.18 : -0.08]}
        outline={FACE_OUT}
      />

      {/* === 目 === */}
      <FlatBox
        args={eyeSize}
        color={INK}
        position={[-eyeX, eyeY, Z]}
        scale={[1, eyeScaleY, 1]}
        outline={FACE_OUT}
      />
      {isWink ? (
        <FlatBox
          args={[0.14, 0.025, 0.03]}
          color={INK}
          position={[eyeX, eyeY, Z]}
          outline={FACE_OUT}
        />
      ) : (
        <FlatBox
          args={eyeSize}
          color={INK}
          position={[eyeX, eyeY, Z]}
          scale={[1, eyeScaleY, 1]}
          outline={FACE_OUT}
        />
      )}

      {/* === 口 === */}
      {isSurprised ? (
        <FlatBox
          args={[0.09, 0.09, 0.03]}
          color={INK}
          position={[0, mouthY, Z]}
          outline={FACE_OUT}
        />
      ) : isSmug ? (
        <FlatBox
          args={[0.16, 0.025, 0.03]}
          color={INK}
          position={[0.02, mouthY, Z]}
          rotation={[0, 0, -0.28]}
          outline={FACE_OUT}
        />
      ) : (
        <FlatBox
          args={[0.16, 0.03, 0.03]}
          color={INK}
          position={[0, mouthY, Z]}
          outline={FACE_OUT}
        />
      )}
    </group>
  );
}
