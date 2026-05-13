'use client';

import { useEffect, useState } from 'react';
import type { UnreadEncounter } from '@/types/encounter';
import { Avatar } from './Avatar';
import { useMarkRead } from './queries';

type Phase = 'enter' | 'show' | 'leave';

const ENTER_MS = 320;
const LEAVE_MS = 180;

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

  const phaseClass =
    phase === 'show'
      ? 'opacity-100 scale-100 translate-y-0'
      : phase === 'leave'
        ? 'opacity-0 scale-95 -translate-y-2'
        : 'opacity-0 scale-90 translate-y-6';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/95 p-8 backdrop-blur-sm">
      <h2
        className="text-5xl font-black tracking-[0.3em] text-neon"
        style={{ textShadow: '0 0 12px rgba(57,255,20,0.7), 0 0 28px rgba(57,255,20,0.4)' }}
      >
        ENCOUNTER!
      </h2>

      <div
        className={`flex flex-col items-center gap-4 transition-all duration-300 ease-out ${phaseClass}`}
      >
        <Avatar code={current.user.avatar_code} size={160} />
        <div className="text-2xl font-bold tracking-wide text-white">
          {current.user.display_name}
        </div>
        {current.user.message && (
          <div className="max-w-xs text-center text-sm text-neutral-300">
            {current.user.message}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleNext}
          className="rounded border border-neon bg-neon/10 px-8 py-2 font-bold tracking-widest text-neon transition hover:bg-neon hover:text-black"
        >
          {isLast ? '閉じる' : '次へ'}
        </button>
        <span className="text-xs tracking-widest text-neutral-500">
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  );
}
