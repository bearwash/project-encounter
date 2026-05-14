'use client';

/**
 * 横スクロール 2D の広場ビュー (夕方の公園)。
 *
 * spec: docs/specs/encounter-plaza.md §4.1, §4.1.1
 *
 * 親要素の領域いっぱいに広がる (HomePage では fullscreen、Preview では card)。
 * 背景は中で完結 — 親に背景クラスを付ける必要はない。
 *
 * レイヤ (奥 → 手前):
 *   1. 夕焼け空のグラデーション
 *   2. 遠景: 木立シルエット (固定、横スクロール非追従)
 *   3. 桜の花びら (装飾レイヤ)
 *   4. 中景〜前景: 横スクロールの公園ステージ (地面 + 街灯 + ベンチ + 桜の木 + 住人)
 *   5. 空状態 overlay (住人 0 人のとき、中央に誘導 UI)
 *
 * MVP: 3 層パララックスは「遠景固定 / 中景+前景は横スクロール一括」で擬似的に表現。
 * 厳密なスクロール速度差は §8 オープン課題で別途検討。
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { HistoryItem } from '@/types/encounter';
import { PlazaDetailPanel } from './PlazaDetailPanel';
import { PlazaResident } from './PlazaResident';
import { SakuraPetals } from './SakuraPetals';

const MIN_STAGE_WIDTH = 800;
const PX_PER_RESIDENT = 50;
const RESIDENT_SIZE = 72;
const GROUND_HEIGHT_PCT = 28; // ステージ高さに対する地面の比率

type Props = {
  residents: HistoryItem[];
};

export function EncounterPlaza({ residents }: Props) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="encounter-plaza"
      style={{
        background:
          'linear-gradient(to bottom, #FFB07A 0%, #FFC9B0 30%, #FFE9CE 60%, #FAF1E0 95%)',
      }}
    >
      {/* 遠景: 木立シルエット (スクロール非追従) */}
      <DistantTrees />

      {/* 桜の花びら */}
      <SakuraPetals count={18} durationRange={[12, 22]} className="z-[1]" />

      {/* 横スクロールの中景〜前景 */}
      <PlazaStage
        residents={residents}
        onTap={setSelected}
      />

      {/* 空状態 overlay (residents 0 のとき) */}
      {residents.length === 0 && <EmptyOverlay />}

      {/* 詳細パネル (ボトムシート) */}
      <PlazaDetailPanel resident={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// =============================================================
// 遠景: 木立シルエット — 横一杯に並び、スクロール非追従 (画面端固定)
// =============================================================
function DistantTrees() {
  return (
    <svg
      className="pointer-events-none absolute left-0 right-0 top-[44%] h-[18%] w-full"
      viewBox="0 0 240 40"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 40 L8 28 L16 32 L26 18 L40 30 L52 22 L64 30 L78 14 L92 28 L106 22 L120 30 L134 18 L148 28 L162 22 L178 30 L194 18 L210 28 L224 22 L240 28 L240 40 Z"
        fill="#7A5A8C"
        opacity="0.55"
      />
    </svg>
  );
}

// =============================================================
// 空状態 overlay
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

// =============================================================
// 中景〜前景: 横スクロールの公園ステージ (地面 + 街灯 + ベンチ + 桜 + 住人)
// =============================================================
function PlazaStage({
  residents,
  onTap,
}: {
  residents: HistoryItem[];
  onTap: (r: HistoryItem) => void;
}) {
  const stageWidth = Math.max(MIN_STAGE_WIDTH, residents.length * PX_PER_RESIDENT);

  const positions = useMemo(() => {
    const margin = 60;
    const usable = stageWidth - margin * 2;
    const step = usable / Math.max(1, residents.length);
    return residents.map((r, i) => {
      const baseX = margin + step * (i + 0.5);
      let acc = 0;
      for (const c of r.user_id) acc = (acc * 31 + c.charCodeAt(0)) >>> 0;
      const jitter = (acc % 40) - 20;
      return baseX + jitter;
    });
  }, [residents, stageWidth]);

  return (
    <div
      className="absolute inset-0 overflow-x-auto overflow-y-hidden"
      data-testid="plaza-stage-scroll"
    >
      <div
        className="relative h-full"
        style={{ width: stageWidth }}
        data-testid="plaza-stage"
      >
        {/* 地面 (芝生 + 散歩道のグラデ) */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${GROUND_HEIGHT_PCT}%`,
            background:
              'linear-gradient(to bottom, #9FCB7A 0%, #76B25C 70%, #5DA04A 100%)',
          }}
        />

        {/* 街灯 (3 本) */}
        <PlazaLamp xPct={12} />
        <PlazaLamp xPct={56} />
        <PlazaLamp xPct={92} />

        {/* ベンチ (Phase 2 で座る挙動を入れる前提の見た目だけ) */}
        <PlazaBench xPct={30} />
        <PlazaBench xPct={78} />

        {/* 桜の木 (季節アクセント、2 本) */}
        <PlazaSakuraTree xPct={20} />
        <PlazaSakuraTree xPct={70} />

        {/* 住人レイヤ */}
        {residents.map((r, i) => (
          <PlazaResident
            key={r.user_id}
            userId={r.user_id}
            avatarCode={r.avatar_code}
            initialX={positions[i]!}
            stageWidth={stageWidth}
            size={RESIDENT_SIZE}
            onTap={() => onTap(r)}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================
// 公園オブジェクト (街灯 / ベンチ / 桜)
// =============================================================
function PlazaLamp({ xPct }: { xPct: number }) {
  return (
    <div
      className="absolute"
      style={{ left: `${xPct}%`, bottom: `${GROUND_HEIGHT_PCT - 4}%` }}
      aria-hidden
    >
      <svg width="28" height="140" viewBox="0 0 28 140">
        {/* 柱 */}
        <rect x="13" y="20" width="3" height="120" fill="#5B4A3B" />
        {/* 笠 */}
        <path d="M2 18 L26 18 L22 6 L6 6 Z" fill="#5B4A3B" />
        {/* 灯り (柔らかい黄色 + ハロー) */}
        <circle cx="14" cy="18" r="11" fill="#FFE17A" opacity="0.35" />
        <circle cx="14" cy="14" r="6" fill="#FFE17A" />
        <rect x="11" y="0" width="6" height="6" fill="#5B4A3B" />
      </svg>
    </div>
  );
}

function PlazaBench({ xPct }: { xPct: number }) {
  return (
    <div
      className="absolute"
      style={{ left: `${xPct}%`, bottom: `${GROUND_HEIGHT_PCT - 12}%` }}
      aria-hidden
    >
      <svg width="52" height="22" viewBox="0 0 52 22">
        <rect x="0" y="6" width="52" height="5" rx="2" fill="#9C6B45" />
        <rect x="0" y="6" width="52" height="2" rx="1" fill="#B6855E" />
        <rect x="6" y="11" width="3" height="10" fill="#5B4A3B" />
        <rect x="43" y="11" width="3" height="10" fill="#5B4A3B" />
      </svg>
    </div>
  );
}

function PlazaSakuraTree({ xPct }: { xPct: number }) {
  return (
    <div
      className="absolute"
      style={{ left: `${xPct}%`, bottom: `${GROUND_HEIGHT_PCT - 16}%` }}
      aria-hidden
    >
      <svg width="120" height="160" viewBox="0 0 120 160">
        {/* 幹 */}
        <path
          d="M58 158 L56 80 L40 50 M62 158 L64 80 L82 46"
          stroke="#5B4A3B"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        {/* 花のかたまり (4 つ重ねて柔らかさ) */}
        <circle cx="42" cy="48" r="26" fill="#FFC0CB" opacity="0.85" />
        <circle cx="68" cy="40" r="28" fill="#FFD3D9" opacity="0.9" />
        <circle cx="86" cy="54" r="22" fill="#FFB7C2" opacity="0.85" />
        <circle cx="60" cy="62" r="22" fill="#FFE4E8" opacity="0.85" />
      </svg>
    </div>
  );
}
