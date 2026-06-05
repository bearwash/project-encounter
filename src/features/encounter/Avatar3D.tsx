'use client';

/**
 * Avatar3D — R3F による 3D アバター本体。
 *
 *   spec: docs/specs/avatar.md §10
 *   reference: character-image1.png / character-image2.png / character-image3.png
 *
 * 役割は 3 つ:
 *   1. 4 軸 (base/hair/outfit/face) のパーツを `parts/*` から呼んで組み立てる
 *   2. 骨 (bone) ref を宣言し、`<group ref={...} />` で骨格階層を構築する
 *   3. `mode` に応じて `animation/*` のアニメ関数を毎フレーム呼ぶ
 *
 * 骨格 (Phase M):
 *   body (体全体)
 *     ├─ hipL/hipR (脚) — Leg コンポーネント内部に upper leg / lower leg / 靴
 *     ├─ chest (固定的、上半身)
 *     │    ├─ shoulderL → elbowL → forearm/hand
 *     │    └─ shoulderR → elbowR → forearm/hand
 *     └─ head (固定的、表情とヘア)
 *
 * Phase M では膝/首/胸の "細い骨" は省略 (アニメで使ってないため)。必要になったら追加。
 */

import { useFrame, type ThreeElements } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { makeRng } from '@/lib/avatar/random';
import { parseAvatarCode } from '@/lib/avatar/parse';
import { ANIMATIONS, type Avatar3DMode, type SkeletonBones } from './animation';
import { Arm, Base, skinColor } from './parts/Base';
import { Face } from './parts/Face';
import { Hair } from './parts/Hair';
import { Leg, OutfitTorso, outfitColors } from './parts/Outfit';

export type { Avatar3DMode };

type GroupProps = ThreeElements['group'];

type Props = GroupProps & {
  avatarCode: string;
  userId?: string;
  mode?: Avatar3DMode;
};

export function Avatar3D({
  avatarCode,
  userId,
  mode = 'idle',
  ...groupProps
}: Props) {
  const parts = parseAvatarCode(avatarCode);
  const skin = skinColor(parts.base);
  const outfit = outfitColors(parts.outfit);

  // 個体差ジッタ (userId シードで決定論的)
  const ind = useMemo(() => {
    const rng = makeRng(userId ?? avatarCode);
    return {
      heightScale: 0.96 + rng() * 0.1,
      widthScale: 0.96 + rng() * 0.08,
      breathPhase: rng() * Math.PI * 2,
      walkPhase: rng() * Math.PI * 2,
      breathSpeed: 1.8 + rng() * 0.6,
    };
  }, [userId, avatarCode]);

  // === 骨 (bone) refs ===
  const bones: SkeletonBones = {
    body: useRef<Group>(null),
    hipL: useRef<Group>(null),
    hipR: useRef<Group>(null),
    shoulderL: useRef<Group>(null),
    shoulderR: useRef<Group>(null),
    elbowL: useRef<Group>(null),
    elbowR: useRef<Group>(null),
  };

  // === アニメ実行 ===
  useFrame((state) => {
    const animFn = ANIMATIONS[mode] ?? ANIMATIONS.idle;
    animFn(bones, {
      t: state.clock.elapsedTime,
      walkPhase: ind.walkPhase,
      breathPhase: ind.breathPhase,
      breathSpeed: ind.breathSpeed,
    });
  });

  return (
    <group {...groupProps}>
      <group ref={bones.body} scale={[ind.widthScale, ind.heightScale, ind.widthScale]}>
        {/* 脚 (hip 骨が Leg 内部の group ref) */}
        <Leg
          side="L"
          hipRef={bones.hipL}
          bottom={outfit.bottom}
          shoeUpper={outfit.shoeUpper}
          shoeSole={outfit.shoeSole}
        />
        <Leg
          side="R"
          hipRef={bones.hipR}
          bottom={outfit.bottom}
          shoeUpper={outfit.shoeUpper}
          shoeSole={outfit.shoeSole}
        />

        {/* 胴体 */}
        <OutfitTorso id={parts.outfit} />

        {/* 腕 (shoulder + elbow 骨) */}
        <Arm
          side="L"
          shoulderRef={bones.shoulderL}
          elbowRef={bones.elbowL}
          outfitColor={outfit.top}
          skinColor={skin}
        />
        <Arm
          side="R"
          shoulderRef={bones.shoulderR}
          elbowRef={bones.elbowR}
          outfitColor={outfit.top}
          skinColor={skin}
        />

        {/* 頭素体 → 顔 → 髪 (前後関係: 髪が手前) */}
        <Base id={parts.base} />
        <Face id={parts.face} />
        <Hair id={parts.hair} />
      </group>
    </group>
  );
}
