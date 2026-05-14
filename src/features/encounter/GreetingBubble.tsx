'use client';

/**
 * 対面挨拶シーンの吹き出し + 名札 (PARK PASSPORT 風)。
 * spec: docs/specs/encounter-popup.md §5.5
 *
 * - 名札 (上): 角丸タグに display_name と累計回数スタンプ (★)
 * - 吹き出し (下): システムプレフィックス + 本人 message + ヒント
 *
 * 名札と吹き出しは別レイヤで縦に積み、両方とも bounce-in で「ポンッ」と
 * 出現させる (おもちゃ箱の手触り)。
 */

import { encounterStamp } from '@/lib/encounter/greeting';

type Props = {
  prefix: string;
  displayName: string;
  encounterCount: number;
  message?: string;
  hint?: string;
};

export function GreetingBubble({
  prefix,
  displayName,
  encounterCount,
  message,
  hint,
}: Props) {
  const stamp = encounterStamp(encounterCount);

  return (
    <div className="flex flex-col items-center gap-2" data-testid="greeting-bubble-stack">
      {/* 名札: PARK PASSPORT 風 */}
      <div
        className="animate-bounce-in flex items-center gap-2 rounded-full border-2 border-ink bg-cream-soft px-4 py-1 shadow-toy"
        data-testid="greeting-nameplate"
        style={{ animationDelay: '40ms' }}
      >
        <span className="text-[9px] font-black tracking-[0.25em] text-pop-red">
          PARK PASSPORT
        </span>
        <span className="h-3 w-px bg-cream-deep" />
        <span className="text-sm font-black tracking-wider text-ink">{displayName}</span>
        {stamp ? (
          <span className="rounded-full bg-pop-yellow/80 px-2 py-0.5 text-[10px] font-black tracking-widest text-ink shadow-inner">
            {stamp}
          </span>
        ) : null}
      </div>

      {/* 吹き出し本体 */}
      <div
        className="animate-bounce-in relative max-w-[300px] rounded-toy border-2 border-pop-red bg-cream-soft px-4 py-3 shadow-toy-lg"
        data-testid="greeting-bubble"
        style={{ animationDelay: '120ms' }}
      >
        <p className="text-[11px] font-black tracking-widest text-pop-red">{prefix}</p>
        {message ? (
          <p className="mt-1 text-sm leading-snug text-ink">{message}</p>
        ) : (
          <p className="mt-1 text-sm italic leading-snug text-ink-muted">
            ……
          </p>
        )}
        {hint ? (
          <p className="mt-2 text-right text-[10px] font-bold tracking-widest text-ink-muted">
            {hint} →
          </p>
        ) : null}

        {/* tail: 下向き三角 (吹き出しの尻尾) */}
        <span
          aria-hidden
          className="absolute -bottom-[7px] left-10 h-3 w-3 rotate-45 border-b-2 border-r-2 border-pop-red bg-cream-soft"
        />
      </div>
    </div>
  );
}
