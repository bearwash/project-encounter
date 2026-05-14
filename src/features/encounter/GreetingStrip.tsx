'use client';

/**
 * 対面挨拶シーンの上部ストリップ UI。
 * spec: docs/specs/encounter-popup.md §4.3
 *
 * - 左:  「今日のすれ違い：N 人」
 * - 右:  進行インジケータ「i / N」
 * - 半透明の角丸バー (世界観内ではなくシステム UI として明示的に分離)
 */

type Props = {
  /** 今日の累計すれちがい人数 (全セッションを通した総数) */
  totalToday: number;
  /** 今これまで挨拶を済ませた人数 (0-based の "n 人目に対面中" を out) */
  doneCount: number;
};

export function GreetingStrip({ totalToday, doneCount }: Props) {
  return (
    <div
      className="absolute left-3 right-3 top-3 z-10 flex h-8 items-center justify-between rounded-full border border-cream-deep bg-cream-soft/85 px-4 shadow-toy backdrop-blur"
      data-testid="greeting-strip"
    >
      <span className="text-[11px] font-black tracking-widest text-ink">
        きょうのすれちがい {totalToday} 人
      </span>
      <span
        className="font-mono text-[11px] font-bold tracking-widest text-ink-muted"
        data-testid="greeting-strip-progress"
      >
        {Math.min(doneCount + 1, totalToday)} / {totalToday}
      </span>
    </div>
  );
}
