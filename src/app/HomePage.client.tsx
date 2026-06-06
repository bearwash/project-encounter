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
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Toaster } from '@/components/Toaster';
import { BlePanel } from '@/features/ble/BlePanel';
import { useBleStatus } from '@/features/ble/use-ble-status';
import {
  flushPendingProfiles,
  useEncounterListener,
} from '@/features/ble/use-encounter-listener';
import { EncounterPlaza3D as EncounterPlaza } from '@/features/encounter/EncounterPlaza3D';
import { EncounterPopup } from '@/features/encounter/EncounterPopup';
import {
  useClearEncounters,
  useEncounterHistory,
  useLastSessionOpened,
  useSeedEncounter,
  useUnreadEncounters,
} from '@/features/encounter/queries';
import { daysSince } from '@/lib/encounter/session-stats';
import { ble } from '@/lib/tauri/ble';
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
  const qc = useQueryClient();
  const profile = useProfile();
  const unread = useUnreadEncounters();
  const history = useEncounterHistory();
  const seed = useSeedEncounter();
  const clear = useClearEncounters();
  const resetProfile = useResetProfile();
  const bleStatus = useBleStatus();
  const consent = useCloudConsent();
  const profileData = profile.data;
  // 起動時 1 回だけ。前回開いた時刻を取得して、即座に「いま」で上書きする。
  // 返り値 = 前回値 (= 「N 日ぶり」表示の基準)。初回起動は null。
  const lastOpened = useLastSessionOpened();

  // BLE mock peer 発見イベントを購読 → DB 永続化 + クールダウン制御
  useEncounterListener();

  // 同意済みでフォアグラウンドに来たタイミングで:
  //   - profile_sync_queue を flush (自プロフィール送信、§5.5)
  //   - 未取得 user_id を即時一括 fetch (§5.4.1 トリガ "フォアグラウンド復帰")
  useEffect(() => {
    if (consent.data?.status !== 'granted') return;

    const runOnce = () => {
      flushProfileSyncQueue().catch(() => {});
      flushPendingProfiles()
        .then((r) => {
          if (r.fetchedCount > 0) {
            // users_cache が増えたので unread / history を再読込する。
            qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
            qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
            qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });
          }
        })
        .catch(() => {});
    };

    runOnce();
    const onVisible = () => {
      if (document.visibilityState === 'visible') runOnce();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', runOnce);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', runOnce);
    };
  }, [consent.data?.status, qc]);

  // プロフィール作成済み・同意済みなら通常 BLE を起動し、アプリ表示中の
  // すれ違い検出を常時受けられるようにする。
  useEffect(() => {
    if (consent.data?.status !== 'granted') return;
    if (!profileData) return;
    let cancelled = false;
    let retryTimer: number | null = null;

    const start = async (allowRetry: boolean) => {
      try {
        await ble.start();
      } catch (e) {
        console.warn('[home] ble.start:', e);
        const message = String(e);
        if (
          allowRetry &&
          !cancelled &&
          message.includes('BLE permissions are required')
        ) {
          retryTimer = window.setTimeout(() => {
            if (!cancelled) start(false);
          }, 1500);
        }
      }
    };

    start(true);
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      ble.stop().catch(() => {});
    };
  }, [consent.data?.status, profileData]);

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
    <main className="game-screen fixed inset-0 overflow-hidden">
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
          daysSinceLast={
            lastOpened.data != null ? daysSince(lastOpened.data) : null
          }
          onClose={() => setSnapshot(null)}
          onEnterPlaza={(greetedUserIds) => {
            setSnapshot(null);
            setJoiningIds(greetedUserIds);
          }}
        />
      )}

      {/* 共通トースト (オフライン警告など) */}
      <Toaster />
    </main>
  );
}

// =============================================================
// 上部スコアバー
// =============================================================
function PlazaTopBar({ today, total }: { today: number; total: number }) {
  return (
    <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3">
      <div className="game-hud pointer-events-auto flex items-center gap-2 rounded-full px-2.5 py-1.5">
        <span className="rounded-full bg-pop-red px-2 py-0.5 text-[10px] font-black tracking-widest text-cream-soft shadow-sm">
          TODAY
        </span>
        <span className="text-[11px] font-black tracking-wider text-ink drop-shadow-sm">
          きょうのすれちがい {today} 人
        </span>
        <span className="h-4 w-px bg-ink/10" />
        <span className="text-[11px] font-black tracking-wider text-pop-blue">
          なかま {total} 人
        </span>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {/* 🗾 日本地図ビュー (出会った人のコレクション) — spec: regional-map.md */}
        <Link
          href="/map"
          aria-label="日本地図"
          className="game-icon-button flex h-11 w-11 items-center justify-center rounded-full text-lg transition active:translate-y-[2px]"
        >
          <span aria-hidden>🗾</span>
        </Link>

        <Link
          href="/profile"
          aria-label="プロフィール設定"
          className="game-icon-button flex h-11 w-11 items-center justify-center rounded-full transition active:translate-y-[2px]"
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
      </div>
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
        className="game-button pointer-events-auto flex min-h-12 items-center gap-2 rounded-full px-5 py-3 font-black tracking-wider"
      >
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-base">
          👣
        </span>
        <span className="text-sm">ウォークモード</span>
      </Link>

      <button
        type="button"
        onClick={onOpenDev}
        aria-label="Dev panel"
        aria-pressed={devOpen}
        className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-xs font-black transition active:translate-y-[2px] ${
          devOpen
            ? 'game-button game-button-danger text-cream-soft'
            : 'game-icon-button text-ink-soft'
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
      className="game-panel absolute inset-x-3 bottom-16 z-30 max-h-[60vh] overflow-y-auto rounded-[22px] p-4"
      data-testid="dev-drawer"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black tracking-widest text-ink-muted">
          DEV — BLE 実装までの検証用
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="game-icon-button h-8 w-8 rounded-full text-xs font-black text-ink-muted"
        >
          ×
        </button>
      </div>

      <BlePanel status={bleStatusData} />

      <div className="mt-3 flex gap-2">
        <button
          onClick={onSeed}
          disabled={seedPending}
          className="game-button flex-1 rounded-full px-3 py-2 text-xs font-black disabled:opacity-50"
        >
          {seedPending ? '…' : '擬似エンカウント追加'}
        </button>
        <button
          onClick={onClear}
          disabled={clearPending}
          className="game-button game-button-danger rounded-full px-3 py-2 text-xs font-black disabled:opacity-50"
        >
          {clearPending ? '…' : 'クリア'}
        </button>
      </div>
      <button
        onClick={onResetProfile}
        disabled={resetProfilePending}
        className="game-chip mt-2 w-full rounded-full px-3 py-2 text-xs font-bold text-ink-soft transition active:translate-y-[2px] disabled:opacity-50"
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
