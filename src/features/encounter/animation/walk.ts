/**
 * walk — 歩行ループアニメ。
 *
 * 動き:
 *   - 体が sin で上下バウンス + 軽い左右傾き
 *   - 股関節が前後にスイング (左右逆位相)
 *   - 肩が逆位相で振れる (足が前 → 反対側の腕が前)
 *   - 肘は微小に曲げて自然さを足す
 */

import type { AnimationFn } from './types';

export const walkAnim: AnimationFn = (bones, ctx) => {
  const body = bones.body.current;
  if (!body) return;

  const walkT = ctx.t * 4.5 + ctx.walkPhase;
  const swing = Math.sin(walkT);

  body.position.y = Math.abs(swing) * 0.1;
  body.rotation.z = swing * 0.05;

  if (bones.hipL.current) bones.hipL.current.rotation.x = swing * 0.7;
  if (bones.hipR.current) bones.hipR.current.rotation.x = -swing * 0.7;

  if (bones.shoulderL.current) bones.shoulderL.current.rotation.x = -swing * 0.55;
  if (bones.shoulderR.current) bones.shoulderR.current.rotation.x = swing * 0.55;

  // 肘を歩行に合わせて軽く曲げる (歩いてるとき腕は伸びきらない)
  if (bones.elbowL.current) bones.elbowL.current.rotation.x = 0.3 + Math.abs(swing) * 0.2;
  if (bones.elbowR.current) bones.elbowR.current.rotation.x = 0.3 + Math.abs(swing) * 0.2;
};
