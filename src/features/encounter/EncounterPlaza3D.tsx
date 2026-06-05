'use client';

/**
 * 横スクロール 2D の広場ビューを 3D に置き換えた版。
 * spec: docs/specs/encounter-plaza.md / docs/specs/avatar.md §10.6
 *
 * - <Canvas> + 固定アングル横視点 (3DS Mii 広場の "賑わい" 寄せ)
 * - drag でカメラ x を ±N まで動かす軽量 controller (`<CameraPanController>`)
 * - 背景 (空・地面・街灯・ベンチ・桜) は `Plaza3DBackground.tsx`
 * - 住人は `PlazaResident3D` × N。userId シードで個体差・状態機械が決定論的
 * - 詳細パネル / 空状態 / トーストは HTML overlay (Canvas の上に absolute)
 * - 既存 `<EncounterPlaza>` (2D) と同じ Props 形 (residents / joiningIds) なので
 *   HomePage / preview からは差し替えのみで動く。
 */

import { Canvas, useThree } from '@react-three/fiber';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hapticTap } from '@/lib/haptics';
import type { HistoryItem } from '@/types/encounter';
import { Plaza3DBackground } from './Plaza3DBackground';
import { PlazaDetailPanel } from './PlazaDetailPanel';
import { PlazaResident3D } from './PlazaResident3D';
import { SakuraPetals } from './SakuraPetals';

type Props = {
  residents: HistoryItem[];
  /** 直近で対面挨拶を済ませた住人 (合流アニメ対象、§4.4)。 */
  joiningIds?: string[];
};

/** 1 unit ≈ 80px 換算。住人 1 体あたり 0.7 unit の余白を取る。 */
const PX_PER_UNIT = 80;
const MIN_STAGE_UNITS = 12; // 画面 1 枚に収まる最小幅
const PER_RESIDENT_UNIT = 0.7;
const JOIN_STAGGER_MS = 200;

export function EncounterPlaza3D({ residents, joiningIds }: Props) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  const joinOrder = useMemo(() => {
    const m = new Map<string, number>();
    if (joiningIds) joiningIds.forEach((id, i) => m.set(id, i));
    return m;
  }, [joiningIds]);

  // ステージ幅 (3D unit): 住人数に応じて広がる。30 人ごとに +1 画面ぶん。
  const stageWidth = useMemo(
    () =>
      Math.max(
        MIN_STAGE_UNITS,
        residents.length * PER_RESIDENT_UNIT + 4,
      ),
    [residents.length],
  );

  // 住人配置: userId ハッシュで x / z をジッタ
  const placed = useMemo(() => {
    const margin = 1.0;
    const usable = stageWidth - margin * 2;
    const step = usable / Math.max(1, residents.length);
    return residents.map((r, i) => {
      let acc = 0;
      for (const c of r.user_id) acc = (acc * 31 + c.charCodeAt(0)) >>> 0;
      const jitterX = ((acc % 60) - 30) / 100; // ±0.3 unit
      const jitterZ = (((acc >>> 6) % 40) - 20) / 100; // ±0.2 unit
      const baseX = -stageWidth / 2 + margin + step * (i + 0.5);
      return {
        item: r,
        x: baseX + jitterX,
        z: jitterZ,
        joinIndex: joinOrder.get(r.user_id),
      };
    });
  }, [residents, stageWidth, joinOrder]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="encounter-plaza-3d"
      style={{
        // 夕焼け (要件 §3.2 B / §4.1.1) を CSS で。3D 内に sky sphere は不要
        background:
          'linear-gradient(to bottom, #FFB07A 0%, #FFC9B0 30%, #FFE9CE 60%, #FAF1E0 95%)',
      }}
    >
      <Canvas
        shadows
        // 3DS Mii 広場の固定カメラ感 (横視点、地面少し下)
        // 人型化で身長 ~2.2 unit。広場全体を見渡せるよう後退 + fov 拡大
        camera={{ position: [0, 2.0, 10], fov: 38 }}
      >
        <SceneLights />
        <Plaza3DBackground stageWidth={stageWidth} />
        {placed.map((p) => {
          const joinDelayMs =
            p.joinIndex !== undefined ? p.joinIndex * JOIN_STAGGER_MS : 0;
          return (
            <PlazaResident3D
              key={p.item.user_id}
              userId={p.item.user_id}
              avatarCode={p.item.avatar_code}
              initialX={p.x}
              initialZ={p.z}
              stageWidth={stageWidth}
              joinDelayMs={joinDelayMs}
              onTap={() => {
                hapticTap();
                setSelected(p.item);
              }}
            />
          );
        })}
        <CameraPanController stageWidth={stageWidth} />
      </Canvas>

      {/* 桜の花びら (2D overlay)。3D particle 化は spec §7 オープン課題 */}
      <SakuraPetals count={18} durationRange={[12, 22]} className="z-[5]" />

      {/* 空状態 — 住人 0 のとき HTML overlay で表示 */}
      {residents.length === 0 && <EmptyOverlay />}

      {/* 詳細パネル */}
      <PlazaDetailPanel resident={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// =============================================================
// ライト (太陽光 + 環境光)
//   - directionalLight で長い影 (夕方の傾いた光)
//   - hemisphereLight で空のオレンジを淡く反射
// =============================================================
function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight
        args={['#FFD3A0', '#7BB35E', 0.4]}
        position={[0, 5, 0]}
      />
      <directionalLight
        castShadow
        position={[5, 7, 3]}
        intensity={1.0}
        color="#FFE9CE"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={6}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
      />
    </>
  );
}

// =============================================================
// CameraPanController
//   - drag (pointer) でカメラ x を ±N まで動かす
//   - OrbitControls だとぐりぐり回ってしまうので、自前で水平パンだけ実装
//   - 慣性は無し (シンプル + 30fps 維持)
// =============================================================
function CameraPanController({ stageWidth }: { stageWidth: number }) {
  const { camera, gl } = useThree();
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const camXRef = useRef(camera.position.x);

  const maxX = useMemo(
    () => Math.max(0, (stageWidth - MIN_STAGE_UNITS) / 2),
    [stageWidth],
  );

  // 初期マウント時に target を明示的に見る (forward=-z default で頭が見切れるのを防ぐ)
  useEffect(() => {
    camera.lookAt(camera.position.x, 1.0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      // ターゲットがアバター click の場合は preventDefault 不要 (R3F が stopPropagation 済)
      draggingRef.current = true;
      lastXRef.current = e.clientX;
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      // 画面 1px = 0.01 unit 換算 (画面横幅 約 80% を 8 unit に対応)
      const move = -dx * 0.01;
      const nx = Math.max(-maxX, Math.min(maxX, camXRef.current + move));
      camXRef.current = nx;
      camera.position.x = nx;
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      el.releasePointerCapture?.(e.pointerId);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, maxX]);

  // stageWidth が縮んだ場合、可動域外にカメラがいたら戻す
  useEffect(() => {
    if (Math.abs(camera.position.x) > maxX) {
      camera.position.x = Math.max(-maxX, Math.min(maxX, camera.position.x));
      camXRef.current = camera.position.x;
    }
  }, [maxX, camera]);

  return null;
}

// =============================================================
// 空状態 overlay (HTML)
// =============================================================
function EmptyOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8">
      <div className="pointer-events-auto flex flex-col items-center gap-4 rounded-toy border-2 border-cream-deep bg-cream-soft/95 px-7 py-5 text-center shadow-toy-lg backdrop-blur">
        <p className="text-base font-black tracking-wider text-ink">
          まだだれもいないみたい
        </p>
        <p className="text-xs font-bold text-ink-soft">
          歩き出すと、ここに住人が増えていくよ
        </p>
        <Link
          href="/walk"
          className="rounded-toy border-2 border-pop-blue bg-pop-blue px-5 py-2 font-black tracking-wider text-cream-soft shadow-toy-lg transition active:translate-y-[3px] active:shadow-none"
        >
          ウォークモードへ
        </Link>
      </div>
    </div>
  );
}
