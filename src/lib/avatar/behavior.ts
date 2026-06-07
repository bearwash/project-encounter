/**
 * 広場ビューでの住人の自律行動 (有限状態機械)。
 *
 * spec: docs/specs/encounter-plaza.md §4.3, docs/specs/avatar.md §5
 *
 * - walking → standing or looking (50/50)
 * - standing → walking
 * - looking → walking
 *
 * 各状態の duration / 移動目的地は呼び出し側が渡す rng (mulberry32) で決定論的に。
 */

export type PlazaBehaviorState = 'walking' | 'standing' | 'looking';

export function pickNextState(
  rng: () => number,
  current: PlazaBehaviorState,
): PlazaBehaviorState {
  if (current === 'walking') return rng() < 0.5 ? 'standing' : 'looking';
  return 'walking';
}

/** 次の状態の継続時間 (ms) */
export function pickDurationMs(rng: () => number, state: PlazaBehaviorState): number {
  switch (state) {
    case 'walking':
      return 3000 + rng() * 5000; // 3-8 秒
    case 'standing':
      return 2000 + rng() * 3000; // 2-5 秒
    case 'looking':
      return 1000 + rng() * 2000; // 1-3 秒
    default: {
      // 将来 state を追加したらコンパイルエラーで気付けるように網羅性チェック
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * 歩行先 (絶対 x) と向きを決める。
 * - 移動量は 60〜180px の範囲
 * - 範囲外に出ないようパディング (端 30px)
 */
export function pickWalkTarget(
  rng: () => number,
  currentX: number,
  stageWidth: number,
  padding = 30,
): { targetX: number; direction: 1 | -1 } {
  const range = 60 + rng() * 120;
  const tryDir = rng() < 0.5 ? -1 : 1;
  let target = currentX + tryDir * range;
  const min = padding;
  const max = Math.max(padding, stageWidth - padding);
  if (target < min) target = Math.min(max, currentX + range);
  if (target > max) target = Math.max(min, currentX - range);
  target = Math.max(min, Math.min(max, target));
  const direction: 1 | -1 = target < currentX ? -1 : 1;
  return { targetX: target, direction };
}
