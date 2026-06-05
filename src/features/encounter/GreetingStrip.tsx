'use client';

/**
 * 対面挨拶シーンの上部ストリップ UI。
 * spec: docs/specs/encounter-popup.md §4.3
 *
 * - 左:  「{N 日ぶり} きょうのすれちがい：N 人」
 * - 右:  進行インジケータ「i / N」
 * - 半透明の角丸バー (世界観内ではなくシステム UI として明示的に分離)
 *
 * `daysSince` は「前回アプリを開いた日」からの日数。
 * 1 以上のときだけ "◯日ぶり" タグを左端に出す (3DS 時代の "久しぶりに開けた喜び" 再現)。
 */

type Props = {
  /** 今日の累計すれちがい人数 (全セッションを通した総数) */
  totalToday: number;
  /** 今これまで挨拶を済ませた人数 (0-based の "n 人目に対面中" を out) */
  doneCount: number;
  /** 前回アプリ起動からの整数日 (24h ごと)。1 以上で「{N}日ぶり」タグを出す。 */
  daysSince?: number | null;
};

export function GreetingStrip({ totalToday, doneCount, daysSince }: Props) {
  const showSinceBadge = daysSince !== null && daysSince !== undefined && daysSince >= 1;
  return (
    <div
      className="absolute left-3 right-3 top-3 z-10 flex h-8 items-center justify-between rounded-full border border-cream-deep bg-cream-soft/85 px-4 shadow-toy backdrop-blur"
      data-testid="greeting-strip"
    >
      <span className="flex items-center gap-2">
        {showSinceBadge && (
          <span
            className="rounded-full bg-pop-red px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-cream-soft"
            data-testid="greeting-strip-since"
          >
            {daysSince}日ぶり
          </span>
        )}
        <span className="text-[11px] font-black tracking-widest text-ink">
          きょうのすれちがい {totalToday} 人
        </span>
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
