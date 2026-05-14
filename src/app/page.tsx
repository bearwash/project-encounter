'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BlePanel } from '@/features/ble/BlePanel';
import { useBleStatus } from '@/features/ble/use-ble-status';
import { useEncounterListener } from '@/features/ble/use-encounter-listener';
import { EncounterList } from '@/features/encounter/EncounterList';
import { EncounterPopup } from '@/features/encounter/EncounterPopup';
import {
  useClearEncounters,
  useSeedEncounter,
  useUnreadEncounters,
} from '@/features/encounter/queries';
import { useProfile, useResetProfile } from '@/features/profile/queries';
import type { UnreadEncounter } from '@/types/encounter';

export default function HomePage() {
  const router = useRouter();
  const profile = useProfile();
  const unread = useUnreadEncounters();
  const seed = useSeedEncounter();
  const clear = useClearEncounters();
  const resetProfile = useResetProfile();
  const bleStatus = useBleStatus();

  // BLE mock peer 発見イベントを購読 → DB 永続化 + クールダウン制御
  useEncounterListener();

  // spec/profile.md §5: 初回起動時、プロフィール未設定なら必ず設定画面に誘導
  useEffect(() => {
    if (!profile.isLoading && profile.data === null) {
      router.replace('/profile');
    }
  }, [profile.isLoading, profile.data, router]);

  // 起動時 snapshot: popup 表示中に届いた新規はキューに追加しない (spec §4.6)
  const [snapshot, setSnapshot] = useState<UnreadEncounter[] | null>(null);

  useEffect(() => {
    if (snapshot === null && unread.data && unread.data.length > 0) {
      setSnapshot(unread.data);
    }
  }, [unread.data, snapshot]);

  // プロフィール未設定 → リダイレクト中は何も描かない
  if (profile.isLoading || profile.data === null) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-wide text-pop-red">
          ENCOUNTERS
        </h1>
        <Link
          href="/profile"
          className="rounded-toy border border-cream-deep bg-cream-soft px-3 py-1 text-xs font-bold text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
        >
          プロフィール
        </Link>
      </header>

      <BlePanel status={bleStatus.data} />

      <Link
        href="/walk"
        className="block rounded-toy border border-pop-blue bg-pop-blue/10 px-4 py-3 text-center font-bold tracking-wide text-pop-blue shadow-toy transition active:translate-y-[2px] active:shadow-none"
      >
        ウォークモードへ →
      </Link>

      <section className="rounded-toy border border-cream-deep bg-cream-soft p-3 shadow-toy">
        <EncounterList />
      </section>

      <DevPanel
        onSeed={() => seed.mutate()}
        seedPending={seed.isPending}
        onClear={() => {
          if (confirm('すべてのすれ違いデータを削除しますか?')) {
            clear.mutate();
          }
        }}
        clearPending={clear.isPending}
        onResetProfile={() => {
          if (confirm('プロフィールを削除して初回起動状態に戻しますか?')) {
            resetProfile.mutate();
          }
        }}
        resetProfilePending={resetProfile.isPending}
      />

      {snapshot && snapshot.length > 0 && (
        <EncounterPopup
          items={snapshot}
          onClose={() => setSnapshot(null)}
        />
      )}
    </main>
  );
}

function DevPanel({
  onSeed,
  seedPending,
  onClear,
  clearPending,
  onResetProfile,
  resetProfilePending,
}: {
  onSeed: () => void;
  seedPending: boolean;
  onClear: () => void;
  clearPending: boolean;
  onResetProfile: () => void;
  resetProfilePending: boolean;
}) {
  return (
    <section className="mt-auto flex flex-col gap-2 rounded-toy border border-dashed border-cream-deep p-3">
      <span className="text-[10px] tracking-widest text-ink-muted">
        DEV — BLE 実装までの検証用
      </span>
      <div className="flex gap-2">
        <button
          onClick={onSeed}
          disabled={seedPending}
          className="flex-1 rounded-toy border border-pop-blue bg-cream-soft px-3 py-1.5 text-xs font-bold text-pop-blue shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {seedPending ? '…' : '擬似エンカウント追加'}
        </button>
        <button
          onClick={onClear}
          disabled={clearPending}
          className="rounded-toy border border-pop-red bg-cream-soft px-3 py-1.5 text-xs font-bold text-pop-red shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {clearPending ? '…' : 'クリア'}
        </button>
      </div>
      <button
        onClick={onResetProfile}
        disabled={resetProfilePending}
        className="rounded-toy border border-cream-deep bg-cream-soft px-3 py-1.5 text-xs text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
      >
        {resetProfilePending ? '…' : 'プロフィールをリセット (初回状態に戻す)'}
      </button>
    </section>
  );
}
