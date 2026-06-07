'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTodayEncounterCount } from '@/features/encounter/queries';
import { ble } from '@/lib/tauri/ble';

// spec: docs/specs/walk-mode.md
const LONG_PRESS_MS = 2000;
/** バッテリー警告の閾値 (%) — spec §4.4.1 */
const LOW_BATTERY_PCT = 20;

// =============================================================
// Battery Status API (一部ブラウザ / WKWebView では非対応 → null fallback)
// =============================================================
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
      if (battery && !cancelled) {
        setLevel(Math.round(battery.level * 100));
      }
    };

    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        update();
        b.addEventListener('levelchange', update);
      })
      .catch(() => {
        // 取得失敗は静かに無視 (UI は経過時間のみ)
      });

    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', update);
    };
  }, []);

  return level;
}

// =============================================================
export function WalkMode() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0); // seconds
  const [confirming, setConfirming] = useState(false);
  const [pressing, setPressing] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pressTimer = useRef<number | null>(null);
  const bleModeSwitching = useRef(false);

  const battery = useBatteryLevel();
  const lowBattery = battery !== null && battery <= LOW_BATTERY_PCT;

  // spec §4.2: 「きょう N 回」(3DS 緑 LED 相当のサイレント・カウンタ)。
  // useEncounterListener が encounter_logs に追加するたびに invalidate される。
  const todayCount = useTodayEncounterCount();

  // 経過時間カウント
  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // wake lock (spec §4.5)
  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch (e) {
        console.warn('[walk-mode] wakeLock failed:', e);
      }
    };

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // ウォークモード中は BLE を高頻度モードに切り替える (spec §4.4)
  useEffect(() => {
    if (!bleModeSwitching.current) {
      bleModeSwitching.current = true;
      ble.walkStart()
        .catch((e) => console.warn('[walk-mode] walkStart:', e))
        .finally(() => {
          bleModeSwitching.current = false;
        });
    }
    return () => {
      ble.start().catch((e) => console.warn('[walk-mode] back to normal:', e));
    };
  }, []);

  // spec §4.3: 終了は長押し 2 秒 → 確認ダイアログ
  const startPress = useCallback(() => {
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
    <div className="game-screen-dark fixed inset-0 flex flex-col items-center justify-center overflow-hidden p-8 text-white/80">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pop-green/20" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-pop-blue/10" />
      </div>

      {/* 終了ボタン (長押し) — spec §4.2 右上 */}
      <button
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        className="game-hud-dark absolute right-4 top-4 select-none rounded-full px-4 py-2 text-[10px] font-black tracking-widest text-white/75 transition active:translate-y-[2px]"
      >
        終了（長押し）
      </button>

      {/* 長押し進捗ゲージ */}
      <div
        className="absolute right-5 top-[54px] h-1 w-24 overflow-hidden rounded-full bg-white/10"
        aria-hidden
        style={{ opacity: pressing ? 1 : 0, transition: 'opacity 120ms' }}
      >
        <div
          className="h-full origin-left rounded-full bg-pop-red"
          style={{
            transform: pressing ? 'scaleX(1)' : 'scaleX(0)',
            transition: pressing ? `transform ${LONG_PRESS_MS}ms linear` : 'none',
          }}
        />
      </div>

      {/* 中央: 脈動アイコン + メッセージ + きょうのカウンタ */}
      <div className="game-panel-dark relative flex min-w-[260px] flex-col items-center gap-5 rounded-[28px] px-10 py-9">
        <span className="rounded-full border border-white/[0.15] bg-white/[0.08] px-3 py-1 text-[10px] font-black tracking-[0.28em] text-white/55">
          WALK SCAN
        </span>
        <PulseDot warning={lowBattery} />
        <span className="text-sm font-black tracking-wider text-white/80">
          すれちがいを待っています
        </span>
        {/* spec §4.2: 3DS 緑 LED 相当のサイレント・カウンタ */}
        <span
          className="rounded-full border border-pop-green/20 bg-pop-green/10 px-4 py-1.5 text-[11px] font-mono font-black tracking-[0.3em] text-pop-green"
          data-testid="walk-today-count"
        >
          きょう {todayCount.data ?? 0} 回
        </span>
      </div>

      {/* 下部: 経過時間 + バッテリー残量 (spec §4.2 / §4.4.1) */}
      <div className="game-hud-dark absolute bottom-8 flex items-center gap-4 rounded-full px-5 py-2 text-xs font-mono font-bold tracking-[0.25em]">
        <span className="text-white/50" data-testid="walk-elapsed">
          {formatTime(elapsed)}
        </span>
        {battery !== null && (
          <span
            className={
              lowBattery ? 'text-pop-orange' : 'text-white/50'
            }
            data-testid="walk-battery"
          >
            電池 {battery}%
          </span>
        )}
      </div>

      {/* 確認ダイアログ — spec §4.3 step 2 */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-sm">
          <div className="game-panel animate-bounce-in flex flex-col items-center gap-6 rounded-[24px] px-8 py-7">
            <p className="font-bold tracking-wider text-ink">
              ウォークモードを終了しますか?
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelExit}
                className="game-chip rounded-full px-5 py-2 text-sm font-black text-ink-soft transition active:translate-y-[2px]"
              >
                キャンセル
              </button>
              <button
                onClick={confirmExit}
                className="game-button game-button-danger rounded-full px-5 py-2 text-sm font-black"
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

/** 脈動アイコン。warning=true でオレンジに切り替え (spec §4.4.1 / §4.6) */
function PulseDot({ warning = false }: { warning?: boolean }) {
  const dotColor = warning ? 'bg-pop-orange' : 'bg-pop-green';
  const glow = warning
    ? '0 0 12px rgba(245,166,35,0.55)'
    : '0 0 8px rgba(118,194,91,0.45)';
  return (
    <div className="relative h-24 w-24" data-testid="walk-pulse-dot" data-warning={warning}>
      <span className={`absolute inset-0 animate-ping rounded-full ${dotColor} opacity-[0.15]`} />
      <span className={`absolute inset-5 animate-ping rounded-full ${dotColor} opacity-25`} />
      <span
        className={`absolute inset-[34px] rounded-full ${dotColor}`}
        style={{ boxShadow: glow }}
      />
      <span className="absolute inset-8 rounded-full border border-white/[0.35]" />
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
