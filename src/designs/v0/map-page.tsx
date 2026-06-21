// Design V2 — Map page wrapper
// 適用先: src/app/map/page.tsx を置き換え
// 依存: globals.css に globals-v2.css の内容を追記済みであること

'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEncounterHistory } from '@/features/encounter/queries';
import { useProfile } from '@/features/profile/queries';

const RegionalMap = dynamic(
  () => import('@/features/regional-map/RegionalMap').then((mod) => mod.RegionalMap),
  {
    loading: () => (
      <div
        className="fixed inset-0 grid place-items-center"
        style={{ background: '#FAF1E0' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 rounded-[8px] font-black text-cream-soft flex items-center justify-center text-xs"
            style={{ background: '#D4402C' }}
          >
            MAP
          </div>
          <span className="font-mono text-xs tracking-[0.3em] text-ink-muted">
            読み込み中...
          </span>
        </div>
      </div>
    ),
  },
);

export default function MapPage() {
  const profile = useProfile();
  const history = useEncounterHistory();

  return (
    <main
      className="cream-dot fixed inset-0 overflow-hidden"
    >
      <RegionalMap
        residents={history.data ?? []}
        myHomePrefecture={profile.data?.home_prefecture ?? null}
      />

      {/* 戻るボタン */}
      <Link
        href="/"
        aria-label="広場に戻る"
        className="absolute right-4 top-12 z-10 flex h-10 w-10 items-center justify-center rounded-full font-black text-ink text-lg"
        style={{
          background: '#FFFAF0',
          border: '2.5px solid rgba(59,48,36,0.18)',
          boxShadow: '3px 3px 0 0 rgba(59,48,36,0.12)',
        }}
      >
        ×
      </Link>
    </main>
  );
}
