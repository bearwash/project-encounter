'use client';

import type { BleStatus } from '@/lib/tauri/ble';
import {
  useBleDebugSnapshot,
  useStartBle,
  useStopBle,
} from './use-ble-status';

export function BlePanel({ status }: { status: BleStatus | undefined }) {
  const start = useStartBle();
  const stop = useStopBle();
  const debug = useBleDebugSnapshot();

  const mode = status?.mode ?? 'idle';
  const pending = start.isPending || stop.isPending;
  const events = debug.data?.events.slice(-6).reverse() ?? [];

  return (
    <section className="rounded-toy border border-cream-deep bg-cream-soft px-4 py-3 shadow-toy">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Indicator mode={mode} />
          <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-ink-muted">
              BLE
            </span>
            {status?.backend && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-widest ${
                  status.backend === 'btleplug'
                    ? 'bg-pop-green/15 text-pop-green'
                    : status.backend === 'tauri-plugin'
                      ? 'bg-pop-blue/15 text-pop-blue'
                    : 'bg-cream-deep text-ink-muted'
                }`}
                data-testid="ble-backend"
              >
                {status.backend.toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-ink">
            {mode === 'idle'
              ? '停止中'
              : mode === 'walk'
                ? 'ウォーキング中'
                : 'すれ違い待機中'}
          </span>
          {status && (
            <div className="flex flex-wrap gap-1">
              <StateChip label="BT" active={status.bluetooth_on} />
              <StateChip label="PERM" active={status.permission_granted} />
              <StateChip label="ADV" active={status.advertise_active} />
              <StateChip label="SCAN" active={status.scan_active} />
              <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[9px] font-black tracking-widest text-ink-muted">
                SEEN {status.seen_count}
              </span>
              <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[9px] font-black tracking-widest text-ink-muted">
                PEND {status.pending_count}
              </span>
              <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[9px] font-black tracking-widest text-ink-muted">
                GATT {status.pending_gatt_count}
              </span>
              <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[9px] font-black tracking-widest text-ink-muted">
                DRAIN {status.last_drained_count}
              </span>
            </div>
          )}
          {status?.last_seen_user_id && (
            <span className="max-w-[220px] truncate text-[10px] font-bold text-ink-muted">
              LAST {shortUserId(status.last_seen_user_id)}{' '}
              {formatSeenAt(status.last_seen_at)}
            </span>
          )}
          {status?.last_error && (
            <span className="max-w-[220px] truncate text-[10px] font-bold text-pop-red">
              {status.last_error}
            </span>
          )}
        </div>
        </div>
        <div>
          {mode === 'idle' ? (
            <button
              onClick={() => start.mutate()}
              disabled={pending}
              className="rounded-toy border border-pop-green bg-pop-green px-4 py-1.5 text-xs font-bold tracking-wider text-cream-soft shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              開始
            </button>
          ) : mode === 'normal' ? (
            <button
              onClick={() => stop.mutate()}
              disabled={pending}
              className="rounded-toy border border-cream-deep bg-cream px-4 py-1.5 text-xs font-bold tracking-wider text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              停止
            </button>
          ) : null}
        </div>
      </div>
      {events.length > 0 && (
        <div className="mt-3 grid gap-1 border-t border-cream-deep pt-2">
          {events.map((event) => (
            <div
              key={`${event.at}-${event.label}-${event.detail}`}
              className="grid grid-cols-[64px_88px_minmax(0,1fr)] gap-2 text-[10px] font-bold text-ink-muted"
            >
              <span className="font-mono">{formatSeenAt(event.at)}</span>
              <span className="truncate text-pop-blue">{event.label}</span>
              <span className="truncate font-mono">{event.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function shortUserId(value: string): string {
  return value.length > 8 ? value.slice(-8) : value;
}

function formatSeenAt(value: number | null): string {
  if (!value) return '';
  return new Date(value * 1000).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StateChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-widest ${
        active ? 'bg-pop-green/15 text-pop-green' : 'bg-cream-deep text-ink-muted'
      }`}
    >
      {label}
    </span>
  );
}

function Indicator({ mode }: { mode: BleStatus['mode'] }) {
  if (mode === 'idle') {
    return <span className="block h-2.5 w-2.5 rounded-full bg-cream-deep" />;
  }
  const dotColor = mode === 'walk' ? 'bg-pop-orange' : 'bg-pop-green';
  return (
    <span className="relative block h-2.5 w-2.5">
      <span className={`absolute inset-0 rounded-full ${dotColor}`} />
      <span className={`absolute inset-0 animate-ping rounded-full ${dotColor} opacity-60`} />
    </span>
  );
}
