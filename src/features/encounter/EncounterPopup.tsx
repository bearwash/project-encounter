'use client';

import { useEffect, useState } from 'react';
import type { UnreadEncounter } from '@/types/encounter';
import { Avatar } from './Avatar';
import { useMarkRead } from './queries';

type Phase = 'enter' | 'show' | 'leave';

const ENTER_MS = 380;
const LEAVE_MS = 200;

export function EncounterPopup({
  items,
  onClose,
}: {
  items: UnreadEncounter[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('enter');
  const markRead = useMarkRead();
  const current = items[index];
  const isLast = index >= items.length - 1;

  // 入場 → 既読化 (spec §4.5: 入場アニメ完了時)
  useEffect(() => {
    if (!current) return;
    setPhase('enter');
    const toShow = window.setTimeout(() => setPhase('show'), 30);
    const toRead = window.setTimeout(() => {
      markRead.mutate(current.log_id);
    }, ENTER_MS);
    return () => {
      window.clearTimeout(toShow);
      window.clearTimeout(toRead);
    };
    // current.log_id が変わったタイミングで再発火
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.log_id]);

  if (!current) return null;

  const handleNext = () => {
    setPhase('leave');
    window.setTimeout(() => {
      if (isLast) {
        onClose();
      } else {
        setIndex((i) => i + 1);
      }
    }, LEAVE_MS);
  };

  // 入場: 左から歩いてくる感じ
  // 退場: 右にハケる
  const characterStyle =
    phase === 'show'
      ? { transform: 'translateX(0) translateY(0)', opacity: 1 }
      : phase === 'leave'
        ? { transform: 'translateX(40px) translateY(0)', opacity: 0 }
        : { transform: 'translateX(-48px) translateY(0)', opacity: 0 };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-cream/95 p-8 backdrop-blur-sm">
      <div className="animate-bounce-in rounded-toy border-2 border-pop-red bg-pop-red px-6 py-2 shadow-toy-lg">
        <h2 className="text-2xl font-black tracking-[0.2em] text-cream-soft">
          ENCOUNTER!
        </h2>
      </div>

      <div
        className="flex flex-col items-center gap-4 transition-all duration-300 ease-out"
        style={characterStyle}
      >
        <div className={phase === 'show' ? 'animate-toddle' : ''}>
          <Avatar code={current.user.avatar_code} size={160} animated />
        </div>
        <div className="text-2xl font-black tracking-wide text-ink">
          {current.user.display_name}
        </div>
        {current.user.message && (
          <div className="max-w-xs rounded-toy border border-cream-deep bg-cream-soft px-4 py-2 text-center text-sm text-ink-soft shadow-toy">
            {current.user.message}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleNext}
          className="rounded-toy border-2 border-pop-red bg-pop-red px-8 py-2.5 font-black tracking-wider text-cream-soft shadow-toy-lg transition active:translate-y-[3px] active:shadow-none"
        >
          {isLast ? '閉じる' : '次へ'}
        </button>
        <span className="text-xs font-bold tracking-widest text-ink-muted">
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  );
}
