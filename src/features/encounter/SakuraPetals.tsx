'use client';

/**
 * 桜の花びらを舞わせる装飾レイヤ。
 * spec: docs/specs/encounter-plaza.md §4.1.1 (前景の桜の木 + 季節感アクセント)
 *
 * - SVG `<path>` をベースに、`@keyframes` で y 軸落下 + x 軸スイング + 自転
 * - 枚数 (count) と速度 (speedRange) は呼び出し側で指定 — 公園入口は控えめ、
 *   広場は賑やかに
 * - user_id を持たない (装飾なので個性不要) → Math.random で散布
 */
import { useEffect, useState } from 'react';

type Props = {
  /** 同時に画面内に存在する枚数 */
  count?: number;
  /** 落下速度の範囲 (秒) */
  durationRange?: [number, number];
  className?: string;
};

type Petal = {
  left: number;
  delay: number;
  duration: number;
  size: number;
  swing: number;
  tint: string;
};

export function SakuraPetals({
  count = 14,
  durationRange = [9, 16],
  className = '',
}: Props) {
  // Math.random は SSR と CSR で異なるため、mount 後にだけ生成する。
  // SSR では何も描画しない (装飾なので問題ない)。
  const [petals, setPetals] = useState<Petal[] | null>(null);
  const [minDur, maxDur] = durationRange;

  useEffect(() => {
    const next: Petal[] = Array.from({ length: count }, (_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * maxDur;
      const duration = minDur + Math.random() * (maxDur - minDur);
      const size = 10 + Math.random() * 10;
      const swing = 18 + Math.random() * 22;
      const tint = i % 3 === 0 ? '#FFD3D9' : i % 3 === 1 ? '#FFB7C2' : '#FFE4E8';
      return { left, delay, duration, size, swing, tint };
    });
    setPetals(next);
  }, [count, minDur, maxDur]);

  if (!petals) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
      data-testid="sakura-petals"
    >
      {petals.map((p, i) => (
        <span
          key={i}
          className="sakura-petal absolute -top-6 block"
          style={
            {
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `-${p.delay}s`,
              // CSS 変数で横スイング幅を渡す
              ['--sakura-swing' as string]: `${p.swing}px`,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path
              d="M12 2c2.5 2 3 5 1.8 7.5 2.6-.4 5 1 5.8 3.6.5 1.8-.4 3.6-1.8 4.6 1.6.5 2.5 2.4 2 4-2 1-4.5.5-6-1.4-.8 2.4-3.2 4-5.8 3.8-1.8-.2-3.4-1.6-3.8-3.4-1.8 1.4-4.4 1.4-6-.4-1-1.3-1-3 0-4.4-1.8-1.2-2.4-3.6-1.3-5.5 1-1.8 3.2-2.7 5.2-2.3C5 5.2 7.8 2 10 2c.7 0 1.4.2 2 .5z"
              fill={p.tint}
              opacity="0.85"
            />
            <circle cx="12" cy="12" r="2" fill="#FF7B96" opacity="0.6" />
          </svg>
        </span>
      ))}
    </div>
  );
}
