'use client';

/**
 * 対面挨拶セッション終了パネル。
 * spec: docs/specs/encounter-popup.md §5.6.2
 *
 * - 残数 > 0: 「あと N 人に会いにいく」(プライマリ)
 * - 残数 = 0: 「広場へ入る」(プライマリ)
 * - 共通: 下に小さく「あとで広場で見る」(セカンダリ)
 *
 * 「会いにいく」連打防止のため、押下後 1 秒 disable する (§5.9)。
 */
import { useState } from 'react';

type Props = {
  /** このセッション後に未表示で残ってる人数 */
  remaining: number;
  onSummonNext: () => void;
  onEnterPlaza: () => void;
  onLater: () => void;
};

const DISABLE_MS = 1000;

export function GreetingSessionEnd({
  remaining,
  onSummonNext,
  onEnterPlaza,
  onLater,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handlePrimary = () => {
    if (busy) return;
    setBusy(true);
    window.setTimeout(() => setBusy(false), DISABLE_MS);
    if (remaining > 0) onSummonNext();
    else onEnterPlaza();
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-cream/85 backdrop-blur-sm"
      data-testid="greeting-session-end"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="animate-bounce-in flex flex-col items-center gap-5 rounded-toy border-2 border-pop-red bg-cream-soft px-8 py-6 shadow-toy-lg">
        <p className="text-sm font-bold tracking-wider text-ink-soft">
          {remaining > 0
            ? `まだ ${remaining} 人ならんでるみたい！`
            : 'みんなとあいさつできた！'}
        </p>
        <button
          type="button"
          onClick={handlePrimary}
          disabled={busy}
          data-testid="greeting-session-primary"
          className={`rounded-toy border-2 px-6 py-2.5 font-black tracking-wider text-cream-soft shadow-toy-lg transition active:translate-y-[3px] active:shadow-none disabled:opacity-50 ${
            remaining > 0
              ? 'border-pop-red bg-pop-red'
              : 'border-pop-blue bg-pop-blue'
          }`}
        >
          {remaining > 0 ? `あと ${remaining} 人にあいにいく` : '広場へはいる'}
        </button>
        <button
          type="button"
          onClick={onLater}
          className="text-[11px] font-bold tracking-widest text-ink-muted underline underline-offset-2"
        >
          あとで広場で見る
        </button>
      </div>
    </div>
  );
}
