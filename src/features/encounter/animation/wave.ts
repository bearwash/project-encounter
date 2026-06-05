/**
 * wave — 右手を振るアニメ。
 *
 * 動き:
 *   - 右肩を上に回転 (rotation.x = -1.6 で腕が頭横まで上がる)
 *   - 右肘は伸びぎみ
 *   - 右前腕 (= 肘の rotation.z) を sin で左右に揺らす → 手を振ってる風
 *   - 左腕は idle
 *   - 体は軽く前傾 (挨拶っぽさ)
 */

import type { AnimationFn } from './types';

export const waveAnim: AnimationFn = (bones, ctx) => {
  const body = bones.body.current;
  if (!body) return;

  const waveT = ctx.t * 5;
  const wave = Math.sin(waveT);

  // 体の微小なバウンス + 軽い前傾
  const breath = Math.sin(ctx.t * ctx.breathSpeed + ctx.breathPhase);
  body.position.y = breath * 0.04;
  body.rotation.z = 0;

  // 左側は idle
  if (bones.shoulderL.current) bones.shoulderL.current.rotation.x = breath * 0.03;
  if (bones.elbowL.current) bones.elbowL.current.rotation.x = 0;
  if (bones.hipL.current) bones.hipL.current.rotation.x = 0;
  if (bones.hipR.current) bones.hipR.current.rotation.x = 0;

  // 右肩を高く上げる (腕が天井へ)
  if (bones.shoulderR.current) {
    bones.shoulderR.current.rotation.x = -2.4; // 約 -137 度: 腕がほぼ垂直
    bones.shoulderR.current.rotation.z = 0.25; // 体から少し外に開く
  }
  // 右肘で前腕を左右に振る
  if (bones.elbowR.current) {
    bones.elbowR.current.rotation.x = -0.3;
    bones.elbowR.current.rotation.z = wave * 0.6; // ←→ ヒラヒラ
  }
};
