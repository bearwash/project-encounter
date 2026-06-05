'use client';

/**
 * 広場ビューの 1 住人 (3D 版)。
 * spec: docs/specs/encounter-plaza.md §4.3 / docs/specs/avatar.md §10
 *
 * 役割は 2D 版 `PlazaResident.tsx` と等価:
 *   - user_id をシードに自律歩行 (walking → standing/looking ループ)
 *   - 合流アニメ (joinDelayMs > 0) でゲート位置 (x = -stageWidth/2 + 0.5) から
 *     initialX まで歩いてくる
 *   - タップで onTap()
 *
 * 違い: 表現が 3D プリミティブの組み立て (Avatar3D) に置換される。
 *   - 横移動は useFrame で position.x を lerp 補間
 *   - 向きは rotation.y を 0 (右向き) / Math.PI (左向き) にスナップ
 *   - 「歩いている」感は Avatar3D mode='walking' に丸投げ (足ぶらぶら)
 *
 * x / z は **R3F 空間 (unit ≈ m)** で扱う。stageWidth は呼び出し側で決める
 * (`EncounterPlaza3D` が画面幅と residents 数から算出)。
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import { Avatar3D } from './Avatar3D';
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
  /** 初期 x (3D 空間)。stageWidth と整合する範囲内に置く。 */
  initialX: number;
  /** 奥行きジッタ。手前 = 正、奥 = 負。 */
  initialZ?: number;
  /** ステージ幅 (3D unit)。端反転の判定に使う。 */
  stageWidth: number;
  onTap?: () => void;
  /**
   * 合流アニメの遅延 ms (spec encounter-plaza.md §4.4)。
   * > 0 のとき、画面左端のゲート位置から initialX へ歩いてくる。
   */
  joinDelayMs?: number;
};

/** ゲート位置 (3D 空間)。ステージ左端のちょい内側。 */
function gateX(stageWidth: number) {
  return -stageWidth / 2 + 0.5;
}
/** 合流時にゲートから initialX まで歩いてくる時間 (ms)。個体差ジッタを乗せる。 */
const JOIN_WALK_MS_BASE = 1400;
const JOIN_WALK_MS_JITTER = 500;
const JOIN_REST_MS = 300;

export function PlazaResident3D({
  userId,
  avatarCode,
  initialX,
  initialZ = 0,
  stageWidth,
  onTap,
  joinDelayMs = 0,
}: Props) {
  const isJoining = joinDelayMs > 0;
  const startX = isJoining ? gateX(stageWidth) : initialX;

  const [state, setState] = useState<PlazaBehaviorState>(
    isJoining ? 'walking' : 'standing',
  );
  // 補間用: 目標 x (walking 時) と現在 x の差を lerp で詰める。
  const [targetX, setTargetX] = useState(startX);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [visible, setVisible] = useState(!isJoining);
  /** walking 中 1 単位 (unit) あたりの所要秒。0 なら静止。 */
  const speedRef = useRef(0);

  const groupRef = useRef<Group>(null);
  const xRef = useRef(startX);
  const stageWidthRef = useRef(stageWidth);
  stageWidthRef.current = stageWidth;
  const timerRef = useRef<number | null>(null);

  // 状態機械
  useEffect(() => {
    const rng = makeRng(userId);

    const tick = (current: PlazaBehaviorState) => {
      const next = pickNextState(rng, current);
      const dur = pickDurationMs(rng, next);

      if (next === 'walking') {
        // stageWidth (3D unit) を 2D の px 文脈の幅に渡して target を決める。
        // 実際には pickWalkTarget は単位を選ばないので、unit ベースで直接渡す。
        // ただし pickWalkTarget は 60〜180 単位移動 (px 想定) なので、
        // 3D unit に換算 (1 unit = 80px と仮定) して 0.75〜2.25 unit に圧縮。
        const stagePx = stageWidthRef.current * 80;
        const xPx = (xRef.current + stageWidthRef.current / 2) * 80;
        const { targetX: tPx, direction: dir } = pickWalkTarget(rng, xPx, stagePx);
        const targetUnit = tPx / 80 - stageWidthRef.current / 2;
        const distance = Math.abs(targetUnit - xRef.current);
        speedRef.current = distance / (dur / 1000); // unit / sec
        setDirection(dir);
        setTargetX(targetUnit);
      } else {
        speedRef.current = 0;
      }
      setState(next);
      timerRef.current = window.setTimeout(() => tick(next), dur);
    };

    if (isJoining) {
      // 合流: gate → initialX まで歩いてくる
      const walkMs = JOIN_WALK_MS_BASE + Math.floor(rng() * JOIN_WALK_MS_JITTER);
      const dx = initialX - gateX(stageWidth);
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
        setDirection(initialX > gateX(stageWidth) ? 1 : -1);
        setTargetX(initialX);
        speedRef.current = Math.abs(dx) / (walkMs / 1000);
        setState('walking');
        timerRef.current = window.setTimeout(() => {
          tick('standing');
        }, walkMs + JOIN_REST_MS);
      }, joinDelayMs);
    } else {
      const startDelay = rng() * 1500;
      timerRef.current = window.setTimeout(() => tick('standing'), startDelay);
    }

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // userId 単位で乱数列が決まる。マウント時のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isJoining]);

  // 横移動の補間: 毎フレーム position.x を targetX に近づける (linear)
  useFrame((_, delta) => {
    const grp = groupRef.current;
    if (!grp) return;
    if (state === 'walking' && speedRef.current > 0) {
      const cur = xRef.current;
      const step = speedRef.current * delta;
      const remaining = targetX - cur;
      const move = Math.sign(remaining) * Math.min(step, Math.abs(remaining));
      const nx = cur + move;
      xRef.current = nx;
      grp.position.x = nx;
    } else {
      // 静止: 念のため position を targetX に合わせて保持
      grp.position.x = xRef.current;
    }
    // 向き: 右 = 0, 左 = π
    grp.rotation.y = direction === -1 ? Math.PI : 0;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onTap?.();
  };

  const mode = state === 'walking' ? 'walking' : 'idle';

  return (
    <group
      ref={groupRef}
      position={[startX, 0, initialZ]}
      onClick={handleClick}
      // R3F は visible prop でレンダリング ON/OFF
      visible={visible}
    >
      {/*
       * 受け取った avatarCode をそのまま描画する。
       * パーツカタログ (parts/catalog.ts) が各 ID の色を持つので color override 不要。
       * 個別差は userId シードによる呼吸 / 歩行位相 / 微小スケール (Avatar3D 内) で出す。
       */}
      <Avatar3D avatarCode={avatarCode} userId={userId} mode={mode} />
    </group>
  );
}
