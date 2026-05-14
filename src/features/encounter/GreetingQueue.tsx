'use client';

/**
 * 対面挨拶シーンの隊列 (待機している次の相手たち)。
 * spec: docs/specs/encounter-popup.md §4.2 — 画面右奥に小さく 2〜3 人重なって並ぶ。
 *
 * 20 人並ぶ場合でも視覚上は省略表現として最大 3 人だけ表示する。
 */
import type { UnreadEncounter } from '@/types/encounter';
import { Avatar } from './Avatar';

const VISIBLE = 3;

type Props = {
  /** 次に挨拶を待っている残り (現在の相手は含めない) */
  upcoming: UnreadEncounter[];
};

export function GreetingQueue({ upcoming }: Props) {
  if (upcoming.length === 0) return null;
  const slots = upcoming.slice(0, VISIBLE);

  return (
    <div
      className="pointer-events-none absolute right-3 top-[18%] flex items-end"
      data-testid="greeting-queue"
      aria-label={`残り ${upcoming.length} 人`}
    >
      {slots.map((item, i) => (
        <div
          key={item.log_id}
          className="-ml-2"
          style={{
            opacity: 0.85 - i * 0.2,
            transform: `translateY(${i * 4}px) scale(${1 - i * 0.14})`,
            zIndex: VISIBLE - i,
          }}
        >
          <Avatar code={item.user.avatar_code} mode="idle" size={40} />
        </div>
      ))}
      {upcoming.length > VISIBLE && (
        <span className="ml-1 self-center rounded-full bg-cream-soft/80 px-2 py-0.5 text-[10px] font-black tracking-widest text-ink-soft shadow-toy">
          +{upcoming.length - VISIBLE}
        </span>
      )}
    </div>
  );
}
