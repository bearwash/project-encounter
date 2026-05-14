'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ble } from '@/lib/tauri/ble';

// spec: docs/specs/walk-mode.md
const LONG_PRESS_MS = 2000;

export function WalkMode() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0); // seconds
  const [confirming, setConfirming] = useState(false);
  const [pressing, setPressing] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const pressTimer = useRef<number | null>(null);

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
    ble.walkStart().catch((e) => console.warn('[walk-mode] walkStart:', e));
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
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-cream p-8">
      {/* 終了ボタン (長押し) — spec §4.2 右上 */}
      <button
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        className="absolute right-4 top-4 select-none rounded-toy border border-cream-deep bg-cream-soft px-3 py-1.5 text-[10px] font-bold tracking-widest text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
      >
        終了（長押し）
      </button>

      {/* 長押し進捗ゲージ */}
      <div
        className="absolute right-4 top-12 h-1 w-20 overflow-hidden rounded-full bg-cream-deep"
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

      {/* 中央: 脈動アイコン + メッセージ */}
      <div className="flex flex-col items-center gap-5">
        <PulseDot />
        <span className="text-sm font-bold tracking-wider text-ink-soft">
          すれ違いを待っています
        </span>
      </div>

      {/* 経過時間 — spec §4.2 下部 */}
      <div className="absolute bottom-8 font-mono text-sm font-bold tracking-[0.25em] text-ink-muted">
        {formatTime(elapsed)}
      </div>

      {/* 確認ダイアログ — spec §4.3 step 2 */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-cream/85 backdrop-blur-sm">
          <div className="animate-bounce-in flex flex-col items-center gap-6 rounded-toy border border-cream-deep bg-cream-soft px-8 py-7 shadow-toy-lg">
            <p className="font-bold tracking-wider text-ink">
              ウォークモードを終了しますか?
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelExit}
                className="rounded-toy border border-cream-deep bg-cream px-5 py-2 text-sm font-bold text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
              >
                キャンセル
              </button>
              <button
                onClick={confirmExit}
                className="rounded-toy border-2 border-pop-red bg-pop-red px-5 py-2 text-sm font-bold text-cream-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
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

function PulseDot() {
  return (
    <div className="relative h-4 w-4">
      <span
        className="absolute inset-0 rounded-full bg-pop-green"
        style={{ boxShadow: '0 0 8px rgba(118,194,91,0.4)' }}
      />
      <span className="absolute inset-0 animate-ping rounded-full bg-pop-green/60" />
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
