'use client';

import Link from 'next/link';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTodayEncounterCount, useEncounterHistory } from '@/features/encounter/queries';

const EncounterPlaza3D = dynamic(
  () => import('@/features/encounter/EncounterPlaza3D').then((m) => m.EncounterPlaza3D),
  { ssr: false }
);

export default function V0HomePage() {
  const [devOpen, setDevOpen] = useState(false);
  const { data: todayCount = 0 } = useTodayEncounterCount();
  const { data: history = [] } = useEncounterHistory();

  return (
    <main className="game-screen fixed inset-0 overflow-hidden">
      <div className="absolute inset-0">
        <EncounterPlaza3D residents={history} joiningIds={[]} />
      </div>

      {/* 上部 HUD */}
      <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3">
        <div className="neo-hud pointer-events-auto flex items-center gap-2 rounded-[10px] px-3 py-2">
          <div className="flex h-6 items-center rounded-[6px] px-2 font-black text-cream-soft"
            style={{ background: '#D4402C', fontSize: '9px', letterSpacing: '0.18em' }}>
            TODAY
          </div>
          <span className="font-black text-ink" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>{todayCount}人</span>
          <div className="h-3.5 w-px" style={{ background: 'rgba(59,48,36,0.12)' }} />
          <span className="font-black" style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5DA9E9' }}>
            なかま {history.length}人
          </span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/designs/v0/map"
            className="neo-hud flex h-11 w-11 items-center justify-center rounded-[10px] text-lg transition active:translate-x-[2px] active:translate-y-[2px]"
            style={{ boxShadow: '3px 3px 0 0 rgba(59,48,36,0.11)' }}>
            🗾
          </Link>
          <Link href="/designs/v0/profile"
            className="neo-hud flex h-11 w-11 items-center justify-center rounded-[10px] transition active:translate-x-[2px] active:translate-y-[2px]"
            style={{ boxShadow: '3px 3px 0 0 rgba(59,48,36,0.11)' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.5" stroke="#3B3024" strokeWidth="2.2" />
              <path d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke="#3B3024" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      {/* 下部アクション */}
      <div className="pointer-events-none absolute bottom-6 left-3 right-3 z-20 flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <Link href="/designs/v0/walk"
            className="neo-button pointer-events-auto flex min-h-14 flex-1 items-center gap-3 rounded-[14px] px-5"
            style={{ boxShadow: '5px 5px 0 0 #3B3024' }}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-base"
              style={{ background: 'rgba(255,250,240,0.2)' }}>👣</div>
            <span className="font-black tracking-wide text-cream-soft" style={{ fontSize: '14px' }}>
              ウォークモード
            </span>
          </Link>
          <button
            onClick={() => setDevOpen(v => !v)}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-[14px] font-black transition active:translate-x-[2px] active:translate-y-[2px]"
            style={{
              background: devOpen ? '#D4402C' : '#FFFAF0',
              color: devOpen ? '#FFFAF0' : '#9C8D7A',
              border: '2.5px solid rgba(59,48,36,0.18)',
              boxShadow: '4px 4px 0 0 rgba(59,48,36,0.12)',
              fontSize: '12px',
            }}>?</button>
        </div>
      </div>
    </main>
  );
}
