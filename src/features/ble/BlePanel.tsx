'use client';

import type { BleStatus } from '@/lib/tauri/ble';
import { useStartBle, useStopBle } from './use-ble-status';

export function BlePanel({ status }: { status: BleStatus | undefined }) {
  const start = useStartBle();
  const stop = useStopBle();

  const mode = status?.mode ?? 'idle';
  const pending = start.isPending || stop.isPending;

  const tone =
    mode === 'walk'
      ? 'border-neon-pink/60 text-neon-pink'
      : mode === 'normal'
        ? 'border-neon/60 text-neon'
        : 'border-neutral-800 text-neutral-500';

  return (
    <section className={`flex items-center justify-between gap-3 rounded border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center gap-2.5">
        <Indicator mode={mode} />
        <div className="flex flex-col">
          <span className="text-[10px] tracking-widest opacity-70">BLE</span>
          <span className="text-sm font-bold tracking-wider">
            {mode === 'idle' ? '停止中' : mode === 'walk' ? 'WALK MODE' : 'すれ違い待機中'}
          </span>
        </div>
      </div>
      <div>
        {mode === 'idle' ? (
          <button
            onClick={() => start.mutate()}
            disabled={pending}
            className="rounded border border-neon px-3 py-1 text-xs font-bold tracking-widest text-neon transition hover:bg-neon hover:text-black disabled:opacity-50"
          >
            開始
          </button>
        ) : mode === 'normal' ? (
          <button
            onClick={() => stop.mutate()}
            disabled={pending}
            className="rounded border border-neutral-700 px-3 py-1 text-xs tracking-widest text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-50"
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
    return <span className="block h-2 w-2 rounded-full bg-neutral-700" />;
  }
  const dotColor = mode === 'walk' ? 'bg-neon-pink' : 'bg-neon';
  return (
    <span className="relative block h-2 w-2">
      <span className={`absolute inset-0 rounded-full ${dotColor}`} />
      <span className={`absolute inset-0 animate-ping rounded-full ${dotColor} opacity-60`} />
    </span>
  );
}
