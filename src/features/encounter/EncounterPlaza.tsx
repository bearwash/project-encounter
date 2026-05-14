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
  /**
   * 直近で対面挨拶を済ませて広場に合流したばかりの user_id 集合。
   * spec: docs/specs/encounter-plaza.md §4.4
   * 含まれる住人だけ「ゲートから順次フレームイン」する。
   */
  joiningIds?: string[];
};

/** 合流アニメで 1 人ずつフレームインする間隔 (§4.4 ステップ 1) */
const JOIN_STAGGER_MS = 200;

export function EncounterPlaza({ residents, joiningIds }: Props) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  // 3 層パララックス用: ステージのスクロール量を保持し、遠景に slow factor を当てる
  const [scrollX, setScrollX] = useState(0);

  // 合流対象を順序付きの Map に変換 (user_id → 何番目)
  const joinOrder = useMemo(() => {
    const map = new Map<string, number>();
    if (joiningIds) {
      joiningIds.forEach((id, i) => map.set(id, i));
    }
    return map;
  }, [joiningIds]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-testid="encounter-plaza"
      style={{
        background:
          'linear-gradient(to bottom, #FFB07A 0%, #FFC9B0 30%, #FFE9CE 60%, #FAF1E0 95%)',
      }}
    >
      {/* 遠景: 木立シルエット (パララックス遅め、スクロールに対して 0.3 倍) */}
      <DistantTrees scrollX={scrollX} />

      {/* 桜の花びら (中景手前) */}
      <SakuraPetals count={18} durationRange={[12, 22]} className="z-[1]" />

      {/* 中景〜前景: 横スクロールの公園ステージ */}
      <PlazaStage
        residents={residents}
        joinOrder={joinOrder}
        onTap={setSelected}
        onScrollChange={setScrollX}
      />

      {/* 空状態 overlay (residents 0 のとき) */}
      {residents.length === 0 && <EmptyOverlay />}

      {/* 詳細パネル (ボトムシート) */}
      <PlazaDetailPanel resident={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// =============================================================
// 遠景: 木立シルエット — 中景より遅くスクロールするパララックス。
// 視差効果のため translateX(-scrollX * factor) を当てる。factor は 0.3 = 観察者
// から見ると遠くの木がゆっくり流れる感じ。
// =============================================================
const PARALLAX_FACTOR = 0.3;

function DistantTrees({ scrollX }: { scrollX: number }) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-[44%] h-[18%]"
      aria-hidden
      style={{
        transform: `translateX(${-scrollX * PARALLAX_FACTOR}px)`,
        willChange: 'transform',
      }}
    >
      <svg
        // 中景より広めの SVG にして横スクロール時の "切れ" を防ぐ (1.5x)
        className="absolute left-0 h-full"
        style={{ width: '150%' }}
        viewBox="0 0 360 40"
        preserveAspectRatio="none"
      >
        <path
          d="M0 40 L8 28 L16 32 L26 18 L40 30 L52 22 L64 30 L78 14 L92 28 L106 22 L120 30 L134 18 L148 28 L162 22 L178 30 L194 18 L210 28 L224 22 L240 28 L254 22 L268 30 L282 16 L298 28 L312 22 L326 28 L344 18 L360 28 L360 40 Z"
          fill="#7A5A8C"
          opacity="0.55"
        />
      </svg>
    </div>
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
  joinOrder,
  onTap,
  onScrollChange,
}: {
  residents: HistoryItem[];
  joinOrder: Map<string, number>;
  onTap: (r: HistoryItem) => void;
  onScrollChange: (x: number) => void;
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
      onScroll={(e) => onScrollChange(e.currentTarget.scrollLeft)}
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
        {residents.map((r, i) => {
          const joinIndex = joinOrder.get(r.user_id);
          // 合流対象なら index に応じて 200ms ずつ遅延 (§4.4)
          const joinDelayMs =
            joinIndex !== undefined ? joinIndex * JOIN_STAGGER_MS : 0;
          return (
            <PlazaResident
              key={r.user_id}
              userId={r.user_id}
              avatarCode={r.avatar_code}
              initialX={positions[i]!}
              stageWidth={stageWidth}
              size={RESIDENT_SIZE}
              onTap={() => onTap(r)}
              joinDelayMs={joinDelayMs}
            />
          );
        })}
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
