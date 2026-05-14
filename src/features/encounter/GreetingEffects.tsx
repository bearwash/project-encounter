'use client';

/**
 * 対面挨拶シーンの装飾エフェクト群。
 * spec: docs/specs/encounter-popup.md §3.3 (おもちゃ箱の手触り)
 *
 * 軽量のため CSS @keyframes に寄せ、JS は座標のばらつきだけを担当する。
 * - OpeningStamp: 「きょうのすれちがい N 人」スタンプの落下 (シーン冒頭 1.2s)
 * - ExclaimBubble: 相手登場時の頭上「!」吹き出し
 * - ConfettiBurst: ハイタッチ瞬間の紙吹雪 (8 個)
 */
import { useMemo } from 'react';

// =============================================================
// OpeningStamp — シーン冒頭の「きょうのすれちがい N 人」
// =============================================================
export function GreetingOpeningStamp({ count }: { count: number }) {
  return (
    <div
      className="greeting-opening-stamp pointer-events-none absolute left-1/2 top-[34%] z-30"
      data-testid="greeting-opening-stamp"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-1 rounded-toy border-[3px] border-pop-red bg-cream-soft px-7 py-4 shadow-toy-lg">
        <span className="text-[10px] font-black tracking-[0.4em] text-pop-red">
          TODAY
        </span>
        <span className="text-2xl font-black tracking-widest text-ink">
          きょうのすれちがい
        </span>
        <span className="text-5xl font-black leading-none tracking-wider text-pop-red">
          {count}
          <span className="ml-1 text-xl text-ink">人</span>
        </span>
      </div>
    </div>
  );
}

// =============================================================
// ExclaimBubble — 相手の頭上に「!」が一瞬出る
// =============================================================
export function GreetingExclaim() {
  return (
    <span
      className="greeting-exclaim pointer-events-none absolute left-1/2 top-[-12px] z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-ink bg-pop-yellow font-black text-ink shadow-toy"
      data-testid="greeting-exclaim"
      aria-hidden
    >
      !
    </span>
  );
}

// =============================================================
// ConfettiBurst — ハイタッチ瞬間に 14 個の紙吹雪が飛び散る
// =============================================================
const CONFETTI_COLORS = [
  '#E55A4C', // pop-red
  '#FFD23F', // pop-yellow
  '#5DA9E9', // pop-blue
  '#76C25B', // pop-green
  '#A47BC0', // pop-purple
  '#F5A623', // pop-orange
];

type ConfettiBurstProps = {
  /** burst の中心位置 (CSS 値、例: { left: '50%', top: '42%' }) */
  origin?: React.CSSProperties;
};

type ConfettiShape = 'square' | 'circle' | 'bar';

export function GreetingConfetti({ origin }: ConfettiBurstProps) {
  const pieces = useMemo(() => {
    const COUNT = 14;
    return Array.from({ length: COUNT }, (_, i) => {
      // 14 方向に均等 + ばらつき
      const baseAngle = (i / COUNT) * Math.PI * 2;
      const angle = baseAngle + (Math.random() - 0.5) * 0.5;
      const dist = 70 + Math.random() * 60;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 22; // 上にバイアス強め (放物線感)
      const rot = (Math.random() * 720 - 360).toFixed(0);
      const dur = 620 + Math.random() * 360;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      const size = 8 + Math.random() * 6;
      const shapes: ConfettiShape[] = ['square', 'circle', 'bar'];
      const shape = shapes[i % shapes.length]!;
      return { dx, dy, rot, dur, color, size, shape };
    });
  }, []);

  return (
    <div
      className="pointer-events-none absolute z-20"
      data-testid="greeting-confetti"
      style={{ left: '50%', top: '46%', ...origin }}
      aria-hidden
    >
      {pieces.map((p, i) => {
        const w = p.shape === 'bar' ? p.size * 0.6 : p.size;
        const h = p.shape === 'bar' ? p.size * 1.6 : p.size;
        const radius =
          p.shape === 'circle'
            ? '999px'
            : p.shape === 'bar'
              ? '2px'
              : '2px';
        return (
          <span
            key={i}
            className="greeting-confetti-dot absolute block"
            style={
              {
                width: `${w}px`,
                height: `${h}px`,
                backgroundColor: p.color,
                borderRadius: radius,
                left: `${-w / 2}px`,
                top: `${-h / 2}px`,
                boxShadow: '0 1px 0 rgba(59,48,36,0.18)',
                ['--confetti-dx' as string]: `${p.dx}px`,
                ['--confetti-dy' as string]: `${p.dy}px`,
                ['--confetti-rot' as string]: `${p.rot}deg`,
                ['--confetti-dur' as string]: `${p.dur}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
