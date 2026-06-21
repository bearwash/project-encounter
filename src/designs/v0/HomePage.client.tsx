'use client';

// Design V2 — HomePage.client
// 適用先: src/app/HomePage.client.tsx を置き換え
// 依存: globals.css に globals-v2.css の内容を追記済みであること
//
// 変更スコープ:
//   - PlazaTopBar  : game-hud frosted-glass pill → neo-hud ソリッドバー
//   - PlazaBottomActions : game-button グラデーション pill → neo-button フィジカルボタン
//   - BootState    : game-button → neo-button
//   - DevDrawer    : game-panel → neo-panel (軽微)
//   EncounterPlaza / EncounterPopup は触らない

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
      const idleId = requestIdle(prefetchSecondaryRoutes, { timeout: 2000 });
      return () => cancelIdle(idleId);
    }
    const timer = globalThis.setTimeout(prefetchSecondaryRoutes, 800);
    return () => globalThis.clearTimeout(timer);
  }, [router]);

  useEncounterListener();

  useEffect(() => {
    if (consent.data?.status !== 'granted') return;
    const runOnce = () => {
      flushProfileSyncQueue().catch(() => {});
      flushPendingProfiles().then((r) => {
        if (r.fetchedCount > 0) {
          qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
          qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
          qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });
        }
      }).catch(() => {});
    };
    runOnce();
    const onVisible = () => { if (document.visibilityState === 'visible') runOnce(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', runOnce);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', runOnce);
    };
  }, [consent.data?.status, qc]);

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
        if (allowRetry && !cancelled && message.includes('BLE permissions are required')) {
          retryTimer = window.setTimeout(() => { if (!cancelled) start(false); }, 1500);
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

  useEffect(() => {
    if (profile.isLoading || consent.isLoading) return;
    if (consent.data?.status === 'pending') return;
    if (profile.data === null) router.replace('/profile');
  }, [profile.isLoading, profile.data, consent.isLoading, consent.data?.status, router]);

  const [snapshot, setSnapshot] = useState<UnreadEncounter[] | null>(null);
  useEffect(() => {
    if (snapshot === null && unread.data && unread.data.length > 0) {
      setSnapshot(unread.data);
    }
  }, [unread.data, snapshot]);

  const [joiningIds, setJoiningIds] = useState<string[]>([]);
  useEffect(() => {
    if (joiningIds.length === 0) return;
    const ttl = joiningIds.length * 200 + 1400 + 1000;
    const t = window.setTimeout(() => setJoiningIds([]), ttl);
    return () => window.clearTimeout(t);
  }, [joiningIds]);

  const residents = history.data ?? [];
  const stats = useDailyStats(residents);
  const [devOpen, setDevOpen] = useState(false);

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
      <ClientErrorBoundary
        fallback={(error) => (
          <BootState title="広場の表示エラー" message={formatQueryError(error)} />
        )}
      >
        <EncounterPlaza residents={residents} joiningIds={joiningIds} />
      </ClientErrorBoundary>

      <PlazaTopBar today={stats.today} total={stats.total} />

      <PlazaBottomActions
        onOpenDev={() => setDevOpen((v) => !v)}
        devOpen={devOpen}
        bleStatus={bleStatus.data}
      />

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

      {snapshot && snapshot.length > 0 && (
        <EncounterPopup
          items={snapshot}
          myAvatarCode={profile.data.avatar_code}
          daysSinceLast={lastOpened.data != null ? daysSince(lastOpened.data) : null}
          onClose={() => setSnapshot(null)}
          onEnterPlaza={(greetedUserIds) => {
            setSnapshot(null);
            setJoiningIds(greetedUserIds);
          }}
        />
      )}

      <Toaster />
    </main>
  );
}

// =============================================================
// BootState — 起動中 / エラー表示
// =============================================================
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
    <main className="cream-dot fixed inset-0 grid place-items-center px-6 text-ink">
      <section className="w-full max-w-sm text-center">
        <div
          className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-[12px] font-black text-cream-soft"
          style={{
            background: '#D4402C',
            fontSize: '16px',
            boxShadow: '4px 4px 0 0 rgba(59,48,36,0.8)',
            border: '2px solid #3B3024',
          }}
        >
          PE
        </div>
        <h1 className="text-lg font-black tracking-wider text-ink">{title}</h1>
        <p className="mt-3 text-sm font-bold leading-relaxed text-ink-soft">
          {message}
        </p>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="neo-button mt-6 inline-flex min-h-12 items-center rounded-[12px] px-6 py-3 text-sm"
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
  try { return JSON.stringify(error); } catch { return String(error); }
}

// =============================================================
// PlazaTopBar — 上部 HUD
// =============================================================
function PlazaTopBar({ today, total }: { today: number; total: number }) {
  const router = useRouter();

  return (
    <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-3">
      {/* TODAY カウンタ */}
      <div
        className="neo-hud pointer-events-auto flex items-center gap-2 rounded-[10px] px-3 py-2"
      >
        {/* TODAY バッジ */}
        <div
          className="flex h-6 items-center rounded-[6px] px-2 font-black text-cream-soft"
          style={{
            background: '#D4402C',
            fontSize: '9px',
            letterSpacing: '0.18em',
          }}
        >
          TODAY
        </div>
        <span
          className="font-black text-ink"
          style={{ fontSize: '11px', letterSpacing: '0.08em' }}
        >
          {today}人
        </span>
        <div
          className="h-3.5 w-px"
          style={{ background: 'rgba(59,48,36,0.12)' }}
          aria-hidden
        />
        <span
          className="font-black"
          style={{ fontSize: '11px', letterSpacing: '0.08em', color: '#5DA9E9' }}
        >
          なかま {total}人
        </span>
      </div>

      {/* アイコンボタン群 */}
      <div className="pointer-events-auto flex items-center gap-2">
        <Link
          href="/map"
          prefetch={false}
          onPointerEnter={() => router.prefetch('/map')}
          onTouchStart={() => router.prefetch('/map')}
          aria-label="日本地図"
          className="neo-hud flex h-11 w-11 items-center justify-center rounded-[10px] text-lg transition active:translate-x-[2px] active:translate-y-[2px]"
          style={{ boxShadow: '3px 3px 0 0 rgba(59,48,36,0.11)' }}
        >
          <span aria-hidden>🗾</span>
        </Link>

        <Link
          href="/profile"
          prefetch={false}
          onPointerEnter={() => router.prefetch('/profile')}
          onTouchStart={() => router.prefetch('/profile')}
          aria-label="プロフィール設定"
          className="neo-hud flex h-11 w-11 items-center justify-center rounded-[10px] transition active:translate-x-[2px] active:translate-y-[2px]"
          style={{ boxShadow: '3px 3px 0 0 rgba(59,48,36,0.11)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="3.5" stroke="#3B3024" strokeWidth="2.2" />
            <path
              d="M4.5 20c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
              stroke="#3B3024"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </div>
    </header>
  );
}

// =============================================================
// PlazaBottomActions — 下部アクション
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
    <div className="pointer-events-none absolute bottom-6 left-3 right-3 z-20 flex flex-col gap-2">
      {/* BLE 警告バー */}
      {bleHealth.kind !== 'ok' && (
        <button
          type="button"
          onClick={onOpenDev}
          className="neo-hud pointer-events-auto flex min-h-10 items-center justify-between gap-3 rounded-[10px] px-3 py-2 transition active:translate-x-[2px] active:translate-y-[2px]"
          style={{ boxShadow: '3px 3px 0 0 rgba(59,48,36,0.1)' }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${bleHealth.dot}`}
              aria-hidden
            />
            <span
              className={`truncate font-black ${bleHealth.text}`}
              style={{ fontSize: '10px', letterSpacing: '0.05em' }}
            >
              {bleHealth.label}
            </span>
          </span>
          <span
            className="shrink-0 font-black tracking-widest text-ink-muted"
            style={{ fontSize: '9px' }}
          >
            詳細
          </span>
        </button>
      )}

      <div className="flex items-end justify-between gap-3">
        {/* ウォークモードボタン — メインCTA */}
        <Link
          href="/walk"
          onClick={() => setWalkOpening(true)}
          className="neo-button pointer-events-auto flex min-h-14 flex-1 items-center gap-3 rounded-[14px] px-5"
          style={{
            boxShadow: '5px 5px 0 0 #3B3024',
          }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-base"
            style={{ background: 'rgba(255,250,240,0.2)' }}
            aria-hidden
          >
            👣
          </div>
          <span className="font-black tracking-wide text-cream-soft" style={{ fontSize: '14px' }}>
            {walkOpening ? '起動中...' : 'ウォークモード'}
          </span>
        </Link>

        {/* Dev fab */}
        <button
          type="button"
          onClick={onOpenDev}
          aria-label="Dev panel"
          aria-pressed={devOpen}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-[14px] font-black transition active:translate-x-[2px] active:translate-y-[2px]"
          style={{
            background: devOpen ? '#D4402C' : '#FFFAF0',
            color: devOpen ? '#FFFAF0' : '#9C8D7A',
            border: '2.5px solid rgba(59,48,36,0.18)',
            boxShadow: '4px 4px 0 0 rgba(59,48,36,0.12)',
            fontSize: '12px',
          }}
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
  dot: string;
  text: string;
} {
  if (!status || status.mode === 'idle') {
    return { kind: 'ok', label: 'BLE停止中', dot: 'bg-ink/20', text: 'text-ink-muted' };
  }
  if (!status.bluetooth_on) {
    return { kind: 'error', label: 'BluetoothがOFFです', dot: 'bg-pop-red', text: 'text-pop-red' };
  }
  if (!status.permission_granted) {
    return { kind: 'error', label: 'Bluetooth権限がありません', dot: 'bg-pop-red', text: 'text-pop-red' };
  }
  if (!status.advertise_active || !status.scan_active) {
    return { kind: 'warning', label: 'BLEを準備しています', dot: 'bg-pop-orange', text: 'text-pop-orange' };
  }
  return { kind: 'ok', label: 'BLE待機中', dot: 'bg-pop-green', text: 'text-pop-green' };
}

// =============================================================
// DevDrawer
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
      className="absolute inset-x-3 bottom-24 z-30 max-h-[60vh] overflow-y-auto rounded-[18px] p-4"
      style={{
        background: '#FFFAF0',
        border: '2.5px solid rgba(59,48,36,0.14)',
        boxShadow: '5px 5px 0 0 rgba(59,48,36,0.1)',
      }}
      data-testid="dev-drawer"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="section-label">DEV — BLE 実装までの検証用</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="neo-button-ghost h-8 w-8 rounded-full text-xs font-black text-ink-muted"
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
          className="neo-button flex-1 rounded-[10px] px-3 py-2.5 text-xs disabled:opacity-45"
        >
          {seedPending ? '…' : '擬似エンカウント追加'}
        </button>
        <button
          onClick={() => setConfirming('clear')}
          disabled={busy}
          className="neo-button rounded-[10px] px-3 py-2.5 text-xs disabled:opacity-45"
          style={{ background: '#E55A4C' }}
        >
          {clearPending ? '…' : 'クリア'}
        </button>
      </div>
      <button
        onClick={() => setConfirming('reset')}
        disabled={busy}
        className="neo-button-ghost mt-2 w-full rounded-[10px] px-3 py-2 text-xs font-bold text-ink-soft transition disabled:opacity-45 active:translate-x-[2px] active:translate-y-[2px]"
      >
        {resetProfilePending ? '…' : 'プロフィールをリセット (初回状態に戻す)'}
      </button>
      {confirming && (
        <div
          className="mt-3 rounded-[12px] p-3"
          style={{
            background: 'rgba(229,90,76,0.06)',
            border: '1.5px solid rgba(229,90,76,0.2)',
          }}
        >
          <p className="text-xs font-black leading-snug text-pop-red">
            {confirming === 'clear'
              ? 'すれ違い履歴をすべて削除します。'
              : 'プロフィールを削除して初回状態に戻します。'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="neo-button-ghost flex-1 rounded-[10px] px-3 py-2 text-xs font-black text-ink-soft"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                const action = confirming;
                setConfirming(null);
                if (action === 'clear') onClear(); else onResetProfile();
              }}
              className="neo-button flex-1 rounded-[10px] px-3 py-2 text-xs"
              style={{ background: '#E55A4C' }}
            >
              {confirming === 'clear' ? '削除する' : '初期化する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
