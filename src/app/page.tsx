'use client';

/**
 * ホーム画面 = 全画面の公園広場ビュー。
 * spec: docs/specs/encounter-plaza.md §1 / §4.1.1
 *
 * - 中央: EncounterPlaza が画面全体に広がる (世界観の主役)
 * - 上部 overlay: スコアバー (きょうのすれちがい / なかま) + プロフィールアイコン
 * - 下部 overlay: ウォークモードの看板ボタン + Dev fab (折り畳み)
 * - 起動時: 未読あれば EncounterPopup (公園入口の対面挨拶) で覆う
 *
 * dev panel は世界観を壊さないよう右下の小さな (?) fab に格納。
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BlePanel } from '@/features/ble/BlePanel';
import { useBleStatus } from '@/features/ble/use-ble-status';
import { useEncounterListener } from '@/features/ble/use-encounter-listener';
import { EncounterPlaza } from '@/features/encounter/EncounterPlaza';
import { EncounterPopup } from '@/features/encounter/EncounterPopup';
import {
  useClearEncounters,
  useEncounterHistory,
  useSeedEncounter,
  useUnreadEncounters,
} from '@/features/encounter/queries';
import { CloudConsentDialog } from '@/features/profile/CloudConsentDialog';
import { useCloudConsent } from '@/features/profile/consent';
import {
  flushProfileSyncQueue,
  useProfile,
  useResetProfile,
} from '@/features/profile/queries';
import type { HistoryItem, UnreadEncounter } from '@/types/encounter';

export default function HomePage() {
  const router = useRouter();
  const profile = useProfile();
  const unread = useUnreadEncounters();
  const history = useEncounterHistory();
  const seed = useSeedEncounter();
  const clear = useClearEncounters();
  const resetProfile = useResetProfile();
  const bleStatus = useBleStatus();
  const consent = useCloudConsent();

  // BLE mock peer 発見イベントを購読 → DB 永続化 + クールダウン制御
  useEncounterListener();

  // 同意済みでフォアグラウンドに来たタイミングで profile_sync_queue を flush
  // (spec §5.5 オンライン復帰時のフロー、簡易版)
  useEffect(() => {
    if (consent.data?.status !== 'granted') return;
    flushProfileSyncQueue().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        flushProfileSyncQueue().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [consent.data?.status]);

  // spec/profile.md §5: 初回起動時、プロフィール未設定なら必ず設定画面に誘導
  // ただし同意ダイアログが pending のときは先に同意を取る
  useEffect(() => {
    if (profile.isLoading || consent.isLoading) return;
    if (consent.data?.status === 'pending') return; // ダイアログ優先
    if (profile.data === null) {
      router.replace('/profile');
    }
  }, [profile.isLoading, profile.data, consent.isLoading, consent.data?.status, router]);

  // 起動時 snapshot: popup 表示中に届いた新規はキューに追加しない (spec §5.9)
  const [snapshot, setSnapshot] = useState<UnreadEncounter[] | null>(null);
  useEffect(() => {
    if (snapshot === null && unread.data && unread.data.length > 0) {
      setSnapshot(unread.data);
    }
  }, [unread.data, snapshot]);

  // 直近で対面挨拶を済ませた相手 (合流アニメ用、encounter-plaza.md §4.4)
  const [joiningIds, setJoiningIds] = useState<string[]>([]);
  useEffect(() => {
    if (joiningIds.length === 0) return;
    // 全員のフレームイン (200ms × 人数) + walk 1400ms + 余裕 1s
    const ttl = joiningIds.length * 200 + 1400 + 1000;
    const t = window.setTimeout(() => setJoiningIds([]), ttl);
    return () => window.clearTimeout(t);
  }, [joiningIds]);

  const residents = history.data ?? [];
  const stats = useDailyStats(residents);

  // Dev panel の折り畳み
  const [devOpen, setDevOpen] = useState(false);

  // 同意ダイアログを先に出すケース
  if (consent.isLoading) return null;
  if (consent.data?.status === 'pending') {
    return (
      <main className="fixed inset-0 overflow-hidden bg-cream">
        <CloudConsentDialog onDecided={() => consent.refetch()} />
      </main>
    );
  }

  if (profile.isLoading || !profile.data) {
    return null;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-cream">
      {/* メインの広場ビュー (全画面) */}
      <EncounterPlaza residents={residents} joiningIds={joiningIds} />

      {/* 上部スコアバー */}
      <PlazaTopBar today={stats.today} total={stats.total} />

      {/* 下部のクイックアクション */}
      <PlazaBottomActions
        onOpenDev={() => setDevOpen((v) => !v)}
        devOpen={devOpen}
      />

      {/* Dev drawer (折り畳み) */}
      {devOpen && (
        <DevDrawer
          bleStatusData={bleStatus.data}
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
          onClose={() => setDevOpen(false)}
        />
      )}

      {/* 対面挨拶シーン (未読があるとき) */}
      {snapshot && snapshot.length > 0 && (
        <EncounterPopup
          items={snapshot}
          myAvatarCode={profile.data.avatar_code}
          onClose={() => setSnapshot(null)}
          onEnterPlaza={(greetedUserIds) => {
            setSnapshot(null);
            setJoiningIds(greetedUserIds);
          }}
        />
      )}
    </main>
  );
}

// =============================================================
// 上部スコアバー
// =============================================================
function PlazaTopBar({ today, total }: { today: number; total: number }) {
  return (
    <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-cream-deep bg-cream-soft/85 px-3 py-1 shadow-toy backdrop-blur">
        <span className="rounded-full bg-pop-red px-2 py-0.5 text-[10px] font-black tracking-widest text-cream-soft">
          TODAY
        </span>
        <span className="text-[11px] font-black tracking-wider text-ink">
          きょうのすれちがい {today} 人
        </span>
        <span className="h-3 w-px bg-cream-deep" />
        <span className="text-[11px] font-bold tracking-wider text-ink-soft">
          なかま {total} 人
        </span>
      </div>

      <Link
        href="/profile"
        aria-label="プロフィール設定"
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border-2 border-cream-deep bg-cream-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="3.5" stroke="#3B3024" strokeWidth="2" />
          <path
            d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
            stroke="#3B3024"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Link>
    </header>
  );
}

// =============================================================
// 下部のクイックアクション (ウォークモード看板 + Dev fab)
// =============================================================
function PlazaBottomActions({
  onOpenDev,
  devOpen,
}: {
  onOpenDev: () => void;
  devOpen: boolean;
}) {
  return (
    <div className="pointer-events-none absolute bottom-5 left-3 right-3 z-20 flex items-end justify-between gap-3">
      <Link
        href="/walk"
        className="pointer-events-auto flex items-center gap-2 rounded-toy border-2 border-pop-blue bg-cream-soft px-4 py-2.5 font-black tracking-wider text-pop-blue shadow-toy-lg transition active:translate-y-[3px] active:shadow-none"
      >
        <span aria-hidden className="text-base">
          👣
        </span>
        <span className="text-sm">ウォークモード</span>
      </Link>

      <button
        type="button"
        onClick={onOpenDev}
        aria-label="Dev panel"
        aria-pressed={devOpen}
        className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black shadow-toy transition active:translate-y-[2px] active:shadow-none ${
          devOpen
            ? 'border-pop-red bg-pop-red text-cream-soft'
            : 'border-cream-deep bg-cream-soft/85 text-ink-soft backdrop-blur'
        }`}
      >
        ?
      </button>
    </div>
  );
}

// =============================================================
// Dev drawer — 折り畳み式
// =============================================================
function DevDrawer({
  bleStatusData,
  onSeed,
  seedPending,
  onClear,
  clearPending,
  onResetProfile,
  resetProfilePending,
  onClose,
}: {
  bleStatusData: ReturnType<typeof useBleStatus>['data'];
  onSeed: () => void;
  seedPending: boolean;
  onClear: () => void;
  clearPending: boolean;
  onResetProfile: () => void;
  resetProfilePending: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-3 bottom-16 z-30 max-h-[60vh] overflow-y-auto rounded-toy border-2 border-cream-deep bg-cream-soft/95 p-4 shadow-toy-lg backdrop-blur"
      data-testid="dev-drawer"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] tracking-widest text-ink-muted">
          DEV — BLE 実装までの検証用
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded-full border border-cream-deep px-2 text-xs font-bold text-ink-muted"
        >
          ×
        </button>
      </div>

      <BlePanel status={bleStatusData} />

      <div className="mt-3 flex gap-2">
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
        className="mt-2 w-full rounded-toy border border-cream-deep bg-cream-soft px-3 py-1.5 text-xs text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
      >
        {resetProfilePending ? '…' : 'プロフィールをリセット (初回状態に戻す)'}
      </button>
    </div>
  );
}

// =============================================================
// stats: 今日のすれちがい人数を residents から導出
//   `last_seen_at` (unix sec) が当日 00:00 (ローカル) 以降のもの。
// =============================================================
function useDailyStats(residents: HistoryItem[]) {
  return useMemo(() => {
    const total = residents.length;
    const startOfDay = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    })();
    const today = residents.filter((r) => r.last_seen_at >= startOfDay).length;
    return { today, total };
  }, [residents]);
}
