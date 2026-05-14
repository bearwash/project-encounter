'use client';

import type { BleStatus } from '@/lib/tauri/ble';
import { useStartBle, useStopBle } from './use-ble-status';

export function BlePanel({ status }: { status: BleStatus | undefined }) {
  const start = useStartBle();
  const stop = useStopBle();

  const mode = status?.mode ?? 'idle';
  const pending = start.isPending || stop.isPending;

  return (
    <section className="flex items-center justify-between gap-3 rounded-toy border border-cream-deep bg-cream-soft px-4 py-3 shadow-toy">
      <div className="flex items-center gap-3">
        <Indicator mode={mode} />
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-widest text-ink-muted">
            BLE
          </span>
          <span className="text-sm font-bold text-ink">
            {mode === 'idle'
              ? '停止中'
              : mode === 'walk'
                ? 'ウォーキング中'
                : 'すれ違い待機中'}
          </span>
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
    </section>
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
