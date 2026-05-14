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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-widest text-neon">
          ENCOUNTERS
        </h1>
        <Link
          href="/profile"
          className="text-sm text-neutral-400 hover:text-neon-cyan"
        >
          プロフィール
        </Link>
      </header>

      <BlePanel status={bleStatus.data} />

      <Link
        href="/walk"
        className="block rounded border border-neon-cyan bg-neon-cyan/5 px-4 py-3 text-center font-bold tracking-widest text-neon-cyan transition hover:bg-neon-cyan hover:text-black"
      >
        ウォークモード開始
      </Link>

      <section>
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
    <section className="mt-auto flex flex-col gap-2 rounded border border-dashed border-neutral-800 p-3">
      <span className="text-[10px] tracking-widest text-neutral-600">
        DEV — BLE 実装までの検証用
      </span>
      <div className="flex gap-2">
        <button
          onClick={onSeed}
          disabled={seedPending}
          className="flex-1 rounded border border-neon-cyan/50 px-3 py-1.5 text-xs text-neon-cyan transition hover:bg-neon-cyan/10 disabled:opacity-40"
        >
          {seedPending ? '…' : '擬似エンカウント追加'}
        </button>
        <button
          onClick={onClear}
          disabled={clearPending}
          className="rounded border border-neon-pink/40 px-3 py-1.5 text-xs text-neon-pink/80 transition hover:bg-neon-pink/10 disabled:opacity-40"
        >
          {clearPending ? '…' : 'クリア'}
        </button>
      </div>
      <button
        onClick={onResetProfile}
        disabled={resetProfilePending}
        className="rounded border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 transition hover:border-neutral-600 hover:text-neutral-300 disabled:opacity-40"
      >
        {resetProfilePending ? '…' : 'プロフィールをリセット (初回状態に戻す)'}
      </button>
    </section>
  );
}
