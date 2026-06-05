/**
 * アニメーション・レジストリ — mode (string) → AnimationFn のマップ。
 * Avatar3D は受け取った mode で対応関数を呼ぶだけになる。
 *
 * 新アニメを足すときは:
 *   1. animation/<name>.ts を作る (AnimationFn を export)
 *   2. このファイルにエントリ追加
 *   3. Avatar3DMode 型に文字列追加
 */

import { hifiveAnim } from './hifive';
import { idleAnim } from './idle';
import type { AnimationFn } from './types';
import { walkAnim } from './walk';
import { waveAnim } from './wave';

export type Avatar3DMode = 'idle' | 'walking' | 'wave' | 'hifive';

export const ANIMATIONS: Record<Avatar3DMode, AnimationFn> = {
  idle: idleAnim,
  walking: walkAnim,
  wave: waveAnim,
  hifive: hifiveAnim,
};

export type { AnimationFn, AnimationContext, SkeletonBones, BoneRef } from './types';
