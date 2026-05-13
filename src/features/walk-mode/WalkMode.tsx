'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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

    // 一度 release されたら再取得 (タブ復帰等)
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
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-black p-8">
      {/* 終了ボタン (長押し) — spec §4.2 右上 */}
      <button
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        className="absolute right-4 top-4 select-none rounded border border-neutral-900 px-3 py-1.5 text-[10px] tracking-widest text-neutral-700 transition active:border-neutral-600 active:text-neutral-400"
      >
        終了（長押し）
      </button>

      {/* 長押し進捗ゲージ */}
      <div
        className="absolute right-4 top-12 h-0.5 w-20 overflow-hidden bg-neutral-900"
        aria-hidden
        style={{ opacity: pressing ? 1 : 0, transition: 'opacity 120ms' }}
      >
        <div
          className="h-full origin-left bg-neon-pink"
          style={{
            transform: pressing ? 'scaleX(1)' : 'scaleX(0)',
            transition: pressing ? `transform ${LONG_PRESS_MS}ms linear` : 'none',
          }}
        />
      </div>

      {/* 中央: 脈動アイコン — spec §4.2 中央 */}
      <PulseHeartbeat />

      {/* 経過時間 — spec §4.2 下部 */}
      <div className="absolute bottom-8 font-mono text-xs tracking-[0.3em] text-neutral-700">
        {formatTime(elapsed)}
      </div>

      {/* 確認ダイアログ — spec §4.3 step 2 */}
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black/85 backdrop-blur-sm">
          <p className="text-base tracking-wider text-white">
            ウォークモードを終了しますか?
          </p>
          <div className="flex gap-3">
            <button
              onClick={cancelExit}
              className="rounded border border-neutral-700 px-5 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              キャンセル
            </button>
            <button
              onClick={confirmExit}
              className="rounded border border-neon-pink bg-neon-pink/10 px-5 py-2 text-sm text-neon-pink hover:bg-neon-pink hover:text-black"
            >
              終了する
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function PulseHeartbeat() {
  return (
    <div className="relative h-3 w-3">
      <span
        className="absolute inset-0 rounded-full bg-neon"
        style={{ boxShadow: '0 0 16px rgba(57,255,20,0.7)' }}
      />
      <span className="absolute inset-0 animate-ping rounded-full bg-neon/40" />
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
