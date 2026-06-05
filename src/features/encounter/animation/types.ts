/**
 * アバターの骨 (bone) 一式。Avatar3D 本体が宣言し、各アニメに渡す。
 * 各 ref は `<group ref={...} />` で R3F が埋める。Null チェックは各アニメ側で行う。
 *
 *   骨階層:
 *     body                       全身の上下バウンス / 軽い傾き
 *       ├─ hipJointL → upperLegL → kneeL (ある場合) → footL
 *       ├─ hipJointR → upperLegR → kneeR (ある場合) → footR
 *       └─ chest (体の傾き) → shoulderL → upperArmL → elbowL → handL
 *                          └─ shoulderR → upperArmR → elbowR → handR
 *
 * Phase M: 必要最小限 (body / hipL,R / shoulderL,R / elbowL,R)。
 *          首/胸/膝 はあとで追加余地。
 */

import type { RefObject } from 'react';
import type { Group } from 'three';

export type BoneRef = RefObject<Group | null>;

export type SkeletonBones = {
  /** 体全体 (位置 / Z 軸傾き) */
  body: BoneRef;
  /** 股関節 (前後スイング) */
  hipL: BoneRef;
  hipR: BoneRef;
  /** 肩 (前後/上下スイング) */
  shoulderL: BoneRef;
  shoulderR: BoneRef;
  /** 肘 (前腕を曲げる) */
  elbowL: BoneRef;
  elbowR: BoneRef;
};

/** 個体差ジッタ (userId シード由来)。アニメに渡してフェーズを変える。 */
export type AnimationContext = {
  /** clock.elapsedTime (秒) */
  t: number;
  /** 0〜2π のオフセット (個体差) */
  walkPhase: number;
  breathPhase: number;
  breathSpeed: number;
};

/** 各アニメは「骨 + 文脈」を受け取って毎フレーム呼ばれる純関数。 */
export type AnimationFn = (bones: SkeletonBones, ctx: AnimationContext) => void;
