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
  /**
   * 合流アニメ (encounter-plaza.md §4.4) の遅延 ms。
   * > 0 のときは画面左端 (ゲート位置) から walking で initialX へ歩いてくる
   * 演出を入れる。0 / undefined のときは通常通り initialX で出現。
   */
  joinDelayMs?: number;
};

/** ゲートの x 座標 (画面左端から少し内側) */
const GATE_X = 20;
/** 合流時に initialX まで歩いてくる時間 */
const JOIN_WALK_MS = 1400;
/** join walk 完了後、アイドリング開始までの余裕 */
const JOIN_REST_MS = 300;

export function PlazaResident({
  userId,
  avatarCode,
  initialX,
  stageWidth,
  size = 64,
  onTap,
  joinDelayMs = 0,
}: Props) {
  const isJoining = joinDelayMs > 0;
  const [state, setState] = useState<PlazaBehaviorState>(
    isJoining ? 'walking' : 'standing',
  );
  const [x, setX] = useState(isJoining ? GATE_X : initialX);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [transitionMs, setTransitionMs] = useState(0);
  // joining 中は最初に透明 → フレームインで opacity 1
  const [visible, setVisible] = useState(!isJoining);

  const xRef = useRef(isJoining ? GATE_X : initialX);
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

    if (isJoining) {
      // 合流アニメ: GATE_X → initialX (右へ) → 通常 tick
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
        setDirection(initialX > GATE_X ? 1 : -1);
        setTransitionMs(JOIN_WALK_MS);
        setX(initialX);
        xRef.current = initialX;
        // walking 表示
        setState('walking');

        // フレームイン完了後にアイドリングへ
        timerRef.current = window.setTimeout(() => {
          tick('standing');
        }, JOIN_WALK_MS + JOIN_REST_MS);
      }, joinDelayMs);
    } else {
      // 通常: 0-1.5s ずらしてアイドリング開始
      const startDelay = rng() * 1500;
      timerRef.current = window.setTimeout(() => tick('standing'), startDelay);
    }

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
      data-joining={isJoining ? 'true' : undefined}
      className="absolute bottom-0 left-0 origin-bottom focus:outline-none"
      style={{
        transform: `translateX(${x - size / 2}px) scaleX(${direction === -1 ? -1 : 1})`,
        opacity: visible ? 1 : 0,
        transition: [
          transitionMs > 0 ? `transform ${transitionMs}ms linear` : 'transform 0ms',
          `opacity 320ms ease-out`,
        ].join(', '),
      }}
      aria-label={`avatar ${userId}`}
    >
      <Avatar code={avatarCode} mode={mode} size={size} />
    </button>
  );
}
