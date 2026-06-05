/**
 * hifive — 両手を上げてハイタッチ準備のアニメ。
 *
 * 動き:
 *   - 両肩を上にぐっと上げる (rotation.x = -1.4)
 *   - 両肘は少し曲げて手が顔の少し上に
 *   - 軽く上下バウンス (期待感の表現)
 *   - 足は idle
 *
 * 利用想定: 2 体並んで両者 hifive モードにすると掌が空中で重なるイメージ。
 *           実際の「タッチ」演出は外側の effect で出す。
 */

import type { AnimationFn } from './types';

export const hifiveAnim: AnimationFn = (bones, ctx) => {
  const body = bones.body.current;
  if (!body) return;

  // 弾むようなバウンス
  const bounceT = ctx.t * 6;
  const bounce = Math.abs(Math.sin(bounceT));
  body.position.y = bounce * 0.08;
  body.rotation.z = 0;

  // 両肩を V 字に大きく開く (バンザイ + 前傾)。
  // 髪のサイドカーテン (X≈±0.5) と干渉しないよう Z 軸方向に大きく開く。
  //   - rotation.x = -2.3 (約 -132°): 上向き + 少し前
  //   - rotation.z = ±0.8 (約 ±46°): 大きく外側へ V 字
  if (bones.shoulderL.current) {
    bones.shoulderL.current.rotation.x = -2.3;
    bones.shoulderL.current.rotation.z = -0.8;
  }
  if (bones.shoulderR.current) {
    bones.shoulderR.current.rotation.x = -2.3;
    bones.shoulderR.current.rotation.z = 0.8;
  }
  // 肘は伸ばす (前腕も上向き)
  if (bones.elbowL.current) bones.elbowL.current.rotation.x = 0;
  if (bones.elbowR.current) bones.elbowR.current.rotation.x = 0;

  // 足は idle (足踏みしない)
  if (bones.hipL.current) bones.hipL.current.rotation.x = 0;
  if (bones.hipR.current) bones.hipR.current.rotation.x = 0;
};
