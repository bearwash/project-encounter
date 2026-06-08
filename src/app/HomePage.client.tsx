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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary';
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
  const autoBleStartInFlight = useRef(false);
  // 起動時 1 回だけ。前回開いた時刻を取得して、即座に「いま」で上書きする。
  // 返り値 = 前回値 (= 「N 日ぶり」表示の基準)。初回起動は null。
  const lastOpened = useLastSessionOpened();

  useEffect(() => {
    router.prefetch('/walk');
    const prefetchSecondaryRoutes = () => {
      router.prefetch('/map');
      router.prefetch('/profile');
    };

    const requestIdle = window.requestIdleCallback as
      | ((callback: IdleRequestCallback, options?: IdleRequestOptions) => number)
      | undefined;
    const cancelIdle = window.cancelIdleCallback as
      | ((handle: number) => void)
      | undefined;

    if (requestIdle && cancelIdle) {
      const idleId = requestIdle(prefetchSecondaryRoutes, {
        timeout: 2000,
      });
      return () => cancelIdle(idleId);
    }

    const timer = globalThis.setTimeout(prefetchSecondaryRoutes, 800);
    return () => globalThis.clearTimeout(timer);
  }, [router]);

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
      if (autoBleStartInFlight.current) return;
      autoBleStartInFlight.current = true;
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
      } finally {
        autoBleStartInFlight.current = false;
      }
    };

    start(true);
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
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
  if (consent.isError) {
    return (
      <BootState
        title="起動エラー"
        message={`同意状態を読み込めません: ${formatQueryError(consent.error)}`}
      />
    );
  }
  if (profile.isError) {
    return (
      <BootState
        title="起動エラー"
        message={`プロフィールDBを読み込めません: ${formatQueryError(profile.error)}`}
      />
    );
  }
  if (consent.isLoading) {
    return <BootState title="起動中" message="設定を読み込んでいます" />;
  }
  if (consent.data?.status === 'pending') {
    return (
      <main className="fixed inset-0 overflow-hidden bg-cream">
        <CloudConsentDialog onDecided={() => consent.refetch()} />
      </main>
    );
  }

  if (profile.isLoading) {
    return <BootState title="起動中" message="プロフィールを読み込んでいます" />;
  }

  if (!profile.data) {
    return (
      <BootState
        title="プロフィール設定へ移動中"
        message="初回設定画面を開いています。画面が変わらない場合は下のボタンを押してください。"
        actionHref="/profile"
        actionLabel="プロフィール設定を開く"
      />
    );
  }

  return (
    <main className="game-screen fixed inset-0 overflow-hidden">
      {/* メインの広場ビュー (全画面) */}
      <ClientErrorBoundary
        fallback={(error) => (
          <BootState
            title="広場の表示エラー"
            message={formatQueryError(error)}
          />
        )}
      >
        <EncounterPlaza residents={residents} joiningIds={joiningIds} />
      </ClientErrorBoundary>

      {/* 上部スコアバー */}
      <PlazaTopBar today={stats.today} total={stats.total} />

      {/* 下部のクイックアクション */}
      <PlazaBottomActions
        onOpenDev={() => setDevOpen((v) => !v)}
        devOpen={devOpen}
        bleStatus={bleStatus.data}
      />

      {/* Dev drawer (折り畳み) */}
      {devOpen && (
        <DevDrawer
          bleStatusData={bleStatus.data}
          onSeed={() => seed.mutate()}
          seedPending={seed.isPending}
          onClear={() => {
            clear.mutate();
            setSnapshot(null);
            setJoiningIds([]);
          }}
          clearPending={clear.isPending}
          onResetProfile={() => {
            ble.stop().catch(() => {});
            resetProfile.mutate(undefined, {
              onSuccess: () => {
                setSnapshot(null);
                setJoiningIds([]);
              },
            });
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

function BootState({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="fixed inset-0 grid place-items-center bg-cream px-6 text-ink">
      <section className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-pop-blue text-xl font-black text-cream-soft shadow-[0_6px_0_rgba(59,48,36,0.14)]">
          PE
        </div>
        <h1 className="text-lg font-black tracking-wider">{title}</h1>
        <p className="mt-3 text-sm font-bold leading-relaxed text-ink-soft">
          {message}
        </p>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="game-button mt-6 inline-flex min-h-12 items-center rounded-full px-5 py-3 text-sm font-black"
          >
            {actionLabel}
          </Link>
        )}
      </section>
    </main>
  );
}

function formatQueryError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// =============================================================
// 上部スコアバー
// =============================================================
function PlazaTopBar({ today, total }: { today: number; total: number }) {
  const router = useRouter();

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
          prefetch={false}
          onPointerEnter={() => router.prefetch('/map')}
          onTouchStart={() => router.prefetch('/map')}
          aria-label="日本地図"
          className="game-icon-button flex h-11 w-11 items-center justify-center rounded-full text-lg transition active:translate-y-[2px]"
        >
          <span aria-hidden>🗾</span>
        </Link>

        <Link
          href="/profile"
          prefetch={false}
          onPointerEnter={() => router.prefetch('/profile')}
          onTouchStart={() => router.prefetch('/profile')}
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
  bleStatus,
}: {
  onOpenDev: () => void;
  devOpen: boolean;
  bleStatus: ReturnType<typeof useBleStatus>['data'];
}) {
  const [walkOpening, setWalkOpening] = useState(false);
  const bleHealth = getBleHealth(bleStatus);

  return (
    <div className="pointer-events-none absolute bottom-5 left-3 right-3 z-20 flex flex-col gap-2">
      {bleHealth.kind !== 'ok' && (
        <button
          type="button"
          onClick={onOpenDev}
          className={`game-hud pointer-events-auto flex min-h-11 items-center justify-between gap-3 rounded-full px-3 py-2 text-left transition active:translate-y-[2px] ${bleHealth.bg}`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${bleHealth.dot}`}
              aria-hidden
            />
            <span className={`truncate text-[11px] font-black ${bleHealth.text}`}>
              {bleHealth.label}
            </span>
          </span>
          <span className="shrink-0 text-[10px] font-black tracking-widest text-ink-muted">
            詳細
          </span>
        </button>
      )}

      <div className="flex items-end justify-between gap-3">
        <Link
          href="/walk"
          onClick={() => setWalkOpening(true)}
          className="game-button pointer-events-auto flex min-h-12 items-center gap-2 rounded-full px-5 py-3 font-black tracking-wider"
        >
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-base">
            👣
          </span>
          <span className="text-sm">{walkOpening ? '起動中...' : 'ウォークモード'}</span>
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
    </div>
  );
}

function getBleHealth(status: ReturnType<typeof useBleStatus>['data']): {
  kind: 'ok' | 'warning' | 'error';
  label: string;
  bg: string;
  dot: string;
  text: string;
} {
  if (!status || status.mode === 'idle') {
    return {
      kind: 'ok',
      label: 'BLE停止中',
      bg: '',
      dot: 'bg-ink/20',
      text: 'text-ink-muted',
    };
  }
  if (!status.bluetooth_on) {
    return {
      kind: 'error',
      label: 'BluetoothがOFFです',
      bg: 'border-pop-red/30 bg-pop-red/10',
      dot: 'bg-pop-red',
      text: 'text-pop-red',
    };
  }
  if (!status.permission_granted) {
    return {
      kind: 'error',
      label: 'Bluetooth権限がありません',
      bg: 'border-pop-red/30 bg-pop-red/10',
      dot: 'bg-pop-red',
      text: 'text-pop-red',
    };
  }
  if (!status.advertise_active || !status.scan_active) {
    return {
      kind: 'warning',
      label: 'BLEを準備しています',
      bg: 'border-pop-orange/30 bg-pop-orange/10',
      dot: 'bg-pop-orange',
      text: 'text-pop-orange',
    };
  }
  return {
    kind: 'ok',
    label: 'BLE待機中',
    bg: '',
    dot: 'bg-pop-green',
    text: 'text-pop-green',
  };
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
  const [confirming, setConfirming] = useState<'clear' | 'reset' | null>(null);

  const busy = seedPending || clearPending || resetProfilePending;

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
          onPointerDown={() => setConfirming(null)}
          disabled={busy}
          className="game-button flex-1 rounded-full px-3 py-2 text-xs font-black disabled:opacity-50"
        >
          {seedPending ? '…' : '擬似エンカウント追加'}
        </button>
        <button
          onClick={() => setConfirming('clear')}
          disabled={busy}
          className="game-button game-button-danger rounded-full px-3 py-2 text-xs font-black disabled:opacity-50"
        >
          {clearPending ? '…' : 'クリア'}
        </button>
      </div>
      <button
        onClick={() => setConfirming('reset')}
        disabled={busy}
        className="game-chip mt-2 w-full rounded-full px-3 py-2 text-xs font-bold text-ink-soft transition active:translate-y-[2px] disabled:opacity-50"
      >
        {resetProfilePending ? '…' : 'プロフィールをリセット (初回状態に戻す)'}
      </button>
      {confirming && (
        <div className="mt-3 rounded-[16px] border border-pop-red/20 bg-pop-red/10 p-3">
          <p className="text-xs font-black leading-snug text-pop-red">
            {confirming === 'clear'
              ? 'すれ違い履歴をすべて削除します。'
              : 'プロフィールを削除して初回状態に戻します。'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="game-chip flex-1 rounded-full px-3 py-2 text-xs font-black text-ink-soft transition active:translate-y-[2px]"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                const action = confirming;
                setConfirming(null);
                if (action === 'clear') {
                  onClear();
                } else {
                  onResetProfile();
                }
              }}
              className="game-button game-button-danger flex-1 rounded-full px-3 py-2 text-xs font-black"
            >
              {confirming === 'clear' ? '削除する' : '初期化する'}
            </button>
          </div>
        </div>
      )}
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
