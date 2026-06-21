'use client';

// Design V2 — WalkMode
// 適用先: src/features/walk-mode/WalkMode.tsx を置き換え
// 依存: globals.css に globals-v2.css の内容を追記済みであること

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTodayEncounterCount } from '@/features/encounter/queries';
import { ble } from '@/lib/tauri/ble';

const LONG_PRESS_MS = 2000;
const LOW_BATTERY_PCT = 20;

type BatteryManager = {
  level: number;
  addEventListener: (event: 'levelchange', handler: () => void) => void;
  removeEventListener: (event: 'levelchange', handler: () => void) => void;
};
type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
};

function useBatteryLevel(): number | null {
  const [level, setLevel] = useState<number | null>(null);
  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;
    let battery: BatteryManager | null = null;
    let cancelled = false;
    const update = () => {
      if (battery && !cancelled) setLevel(Math.round(battery.level * 100));
    };
    nav.getBattery().then((b) => {
      if (cancelled) return;
      battery = b;
      update();
      b.addEventListener('levelchange', update);
    }).catch(() => {});
    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', update);
    };
  }, []);
  return level;
}

export function WalkMode() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pressing, setPressing] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pressTimer = useRef<number | null>(null);
  const prevCount = useRef<number>(0);
  const [bumpKey, setBumpKey] = useState(0);

  const battery = useBatteryLevel();
  const lowBattery = battery !== null && battery <= LOW_BATTERY_PCT;
  const todayCount = useTodayEncounterCount();
  const count = todayCount.data ?? 0;

  // カウントが増えたらバンプアニメーション
  useEffect(() => {
    if (count > prevCount.current) {
      prevCount.current = count;
      setBumpKey((k) => k + 1);
    }
  }, [count]);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) { await sentinel.release(); return; }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => { wakeLockRef.current = null; });
      } catch (e) {
        console.warn('[walk-mode] wakeLock failed:', e);
      }
    };
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    const started = ble.walkStart().catch((e) => console.warn('[walk-mode] walkStart:', e));
    return () => {
      started.finally(() => {
        ble.start().catch((e) => console.warn('[walk-mode] back to normal:', e));
      });
    };
  }, []);

  const startPress = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPressing(true);
    pressTimer.current = window.setTimeout(() => {
      setConfirming(true);
      setPressing(false);
    }, LONG_PRESS_MS);
  }, []);

  const cancelPress = useCallback(() => {
    setPressing(false);
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const confirmExit = () => router.replace('/');
  const cancelExit = () => setConfirming(false);

  return (
    <div className="lcd-screen fixed inset-0 overflow-hidden">

      {/* ---- 長押しプログレスバー (最上部 1px ライン) ---- */}
      <div
        className="absolute left-0 right-0 top-0 z-30 h-[2px]"
        style={{ opacity: pressing ? 1 : 0, transition: 'opacity 100ms' }}
        aria-hidden
      >
        <div
          className="h-full origin-left"
          style={{
            background: '#D4402C',
            transform: pressing ? 'scaleX(1)' : 'scaleX(0)',
            transition: pressing ? `transform ${LONG_PRESS_MS}ms linear` : 'none',
          }}
        />
      </div>

      {/* ---- ステータスバー (上部) ---- */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 pt-12 pb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: '#9DFFAA',
              boxShadow: '0 0 6px rgba(100,255,120,0.7)',
            }}
            aria-hidden
          />
          <span className="font-mono text-[9px] tracking-[0.35em] text-white/30">
            SCAN ACTIVE
          </span>
        </div>

        <div className="flex items-center gap-4">
          {battery !== null && (
            <span
              className="font-mono text-[9px] tracking-[0.2em]"
              style={{ color: lowBattery ? '#F5A623' : 'rgba(255,255,255,0.25)' }}
              data-testid="walk-battery"
            >
              BATT {battery}%
            </span>
          )}
          <button
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            className="font-mono text-[9px] tracking-[0.3em] text-white/20 select-none transition active:text-white/50"
          >
            EXIT
          </button>
        </div>
      </header>

      {/* ---- メインディスプレイ ---- */}
      <div className="flex h-full flex-col items-center justify-center gap-10 pb-20 pt-20">

        {/* ソナー + ドット */}
        <div className="relative flex h-36 w-36 items-center justify-center">
          <div
            className="sonar-r1 absolute inset-0 rounded-full"
            style={{ border: '1.5px solid rgba(100,255,120,0.35)' }}
            aria-hidden
          />
          <div
            className="sonar-r2 absolute inset-0 rounded-full"
            style={{ border: '1.5px solid rgba(100,255,120,0.22)' }}
            aria-hidden
          />
          <div
            className="sonar-r3 absolute inset-0 rounded-full"
            style={{ border: '1.5px solid rgba(100,255,120,0.12)' }}
            aria-hidden
          />
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: '#9DFFAA',
              boxShadow: '0 0 10px rgba(100,255,120,0.8), 0 0 28px rgba(100,255,120,0.3)',
            }}
            aria-hidden
          />
        </div>

        {/* カウンター (メイン表示) */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="font-mono text-[9px] tracking-[0.55em] text-white/20">
            TODAY
          </span>
          <div
            key={bumpKey}
            className={`lcd-counter font-mono font-black leading-none ${bumpKey > 0 ? 'count-bump' : ''}`}
            style={{ fontSize: '108px' }}
            data-testid="walk-today-count"
            aria-live="polite"
            aria-label={`今日 ${count} 回すれちがい`}
          >
            {String(count).padStart(2, '0')}
          </div>
          <span className="font-mono text-[9px] tracking-[0.45em] text-white/15">
            ENCOUNTERS
          </span>
        </div>

        {/* 経過時間 */}
        <span
          className="font-mono text-[18px] tracking-[0.28em] text-white/25"
          data-testid="walk-elapsed"
        >
          {formatTime(elapsed)}
        </span>
      </div>

      {/* ---- 終了ヒント (下部中央) ---- */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center">
        <button
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          className="select-none rounded-full px-7 py-2.5 font-mono text-[10px] tracking-[0.25em] text-white/20 transition active:text-white/45"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          長押しで終了
        </button>
      </div>

      {/* ---- 終了確認ダイアログ ---- */}
      {confirming && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            className="animate-bounce-in neo-panel mx-6 flex w-full max-w-[300px] flex-col items-center gap-6 px-8 py-7"
          >
            <p className="font-black tracking-wide text-ink text-center leading-relaxed">
              ウォークモードを<br />終了しますか?
            </p>
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={cancelExit}
                className="neo-button-ghost flex-1 rounded-[10px] px-4 py-3 text-sm font-black"
              >
                続ける
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="neo-button flex-1 rounded-[10px] px-4 py-3 text-sm"
              >
                終了する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
