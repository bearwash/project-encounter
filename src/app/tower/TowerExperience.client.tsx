'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequireAuth, useAuth } from '@/features/auth/AuthProvider';
import { EncounterPlaza3D } from '@/features/encounter/EncounterPlaza3D';
import { TowerQuest } from '@/features/tower/TowerQuest';
import { loadStreetpassResidents } from '@/features/tower/tower-data';
import type { HistoryItem } from '@/types/encounter';

type TowerView = 'quest' | 'plaza';

export default function TowerExperience() {
  return (
    <RequireAuth
      returnTo="/tower"
      reason="タワーでは、すれ違った回数と誰を出撃させたかをあなたの記録として保存します。"
    >
      <AuthenticatedTower />
    </RequireAuth>
  );
}

function AuthenticatedTower() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<TowerView>('quest');
  const [residents, setResidents] = useState<HistoryItem[]>([]);
  const [joiningIds, setJoiningIds] = useState<string[]>([]);

  const loadResidents = useCallback(async () => {
    try {
      const loaded = await loadStreetpassResidents();
      setResidents(loaded);
      setJoiningIds([]);
      window.requestAnimationFrame(() => {
        setJoiningIds(loaded.map((resident) => resident.user_id));
      });
    } catch (error) {
      console.error('[tower] plaza residents failed:', error);
      setResidents([]);
    }
  }, []);

  useEffect(() => {
    if (view !== 'plaza') return;
    loadResidents().catch(() => {});
  }, [loadResidents, view]);

  if (view === 'quest') {
    return <TowerQuest onOpenPlaza={() => setView('plaza')} />;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#61c3bf]" data-app-ready="true">
      <nav className="tower-toolbar tower-toolbar--plaza" aria-label="すれ違い広場メニュー">
        <button
          className="tower-toolbar__back"
          type="button"
          aria-label="タワーへ戻る"
          onClick={() => setView('quest')}
        >
          ‹
        </button>
        <strong>すれ違い広場</strong>
        <div className="tower-toolbar__controls">
          <button type="button" onClick={loadResidents}>合流をもう一度</button>
          <Link href="/workshop">工房</Link>
          <Link href="/shop">コイン</Link>
          {user?.isTest && (
            <button className="tower-toolbar__test-exit" type="button" onClick={() => signOut()}>
              テスト終了
            </button>
          )}
        </div>
      </nav>

      <div className="h-full w-full overflow-hidden">
        <EncounterPlaza3D
          residents={residents}
          joiningIds={joiningIds}
          myAvatarCode="b01_h04_o01_f03"
        />
      </div>
    </main>
  );
}
