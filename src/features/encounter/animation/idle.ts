/**
 * idle — 立って呼吸するだけのループアニメ。
 *
 * 動き:
 *   - 体が sin で上下に微弱バウンス (吸う→吐く)
 *   - 肩がそれに合わせて微小に上下
 *   - 肘 / 股関節は無動 (0 にリセット)
 */

import type { AnimationFn } from './types';

export const idleAnim: AnimationFn = (bones, ctx) => {
  const body = bones.body.current;
  if (!body) return;

  const breathT = ctx.t * ctx.breathSpeed + ctx.breathPhase;
  const breath = Math.sin(breathT);

  body.position.y = breath * 0.04;
  body.rotation.z = 0;

  if (bones.shoulderL.current) bones.shoulderL.current.rotation.x = breath * 0.03;
  if (bones.shoulderR.current) bones.shoulderR.current.rotation.x = -breath * 0.03;
  if (bones.elbowL.current) bones.elbowL.current.rotation.x = 0;
  if (bones.elbowR.current) bones.elbowR.current.rotation.x = 0;
  if (bones.hipL.current) bones.hipL.current.rotation.x = 0;
  if (bones.hipR.current) bones.hipR.current.rotation.x = 0;
};
