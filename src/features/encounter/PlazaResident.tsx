'use client';

/**
 * 広場ビューの 1 住人。
 *
 * spec: docs/specs/encounter-plaza.md §4.3, docs/specs/avatar.md §5
 *
 * 各住人は user_id をシードに mulberry32 で状態遷移する。
 * - walking: 次の目的地 x へ CSS transition で滑らかに移動 (3-8s)
 * - standing: その場で idle (2-5s)
 * - looking: standing と同じ見た目 (1-3s)。首振りアニメは将来追加 (§7 オープン課題)
 */
import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { makeRng } from '@/lib/avatar/random';
import {
  pickDurationMs,
  pickNextState,
  pickWalkTarget,
  type PlazaBehaviorState,
} from '@/lib/avatar/behavior';

type Props = {
  userId: string;
  avatarCode: string;
  initialX: number;
  stageWidth: number;
  size?: number;
  onTap?: () => void;
};

export function PlazaResident({
  userId,
  avatarCode,
  initialX,
  stageWidth,
  size = 64,
  onTap,
}: Props) {
  const [state, setState] = useState<PlazaBehaviorState>('standing');
  const [x, setX] = useState(initialX);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [transitionMs, setTransitionMs] = useState(0);

  const xRef = useRef(initialX);
  const stageWidthRef = useRef(stageWidth);
  stageWidthRef.current = stageWidth;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const rng = makeRng(userId);

    const tick = (current: PlazaBehaviorState) => {
      const next = pickNextState(rng, current);
      const dur = pickDurationMs(rng, next);

      if (next === 'walking') {
        const { targetX, direction: dir } = pickWalkTarget(
          rng,
          xRef.current,
          stageWidthRef.current,
        );
        setDirection(dir);
        setX(targetX);
        xRef.current = targetX;
        setTransitionMs(dur);
      } else {
        setTransitionMs(0);
      }
      setState(next);
      timerRef.current = window.setTimeout(() => tick(next), dur);
    };

    // 個体差: 0-1.5s ずらして開始 (全員一斉に動き出すのを避ける)
    const startDelay = rng() * 1500;
    timerRef.current = window.setTimeout(() => tick('standing'), startDelay);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // userId 単位で乱数列が決まる。初期化は mount 時のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const mode = state === 'walking' ? 'walking' : 'idle';

  return (
    <button
      type="button"
      onClick={onTap}
      data-testid={`plaza-resident-${userId}`}
      data-state={state}
      className="absolute bottom-0 left-0 origin-bottom focus:outline-none"
      style={{
        transform: `translateX(${x - size / 2}px) scaleX(${direction === -1 ? -1 : 1})`,
        transition: transitionMs > 0 ? `transform ${transitionMs}ms linear` : 'none',
      }}
      aria-label={`avatar ${userId}`}
    >
      <Avatar code={avatarCode} mode={mode} size={size} />
    </button>
  );
}
