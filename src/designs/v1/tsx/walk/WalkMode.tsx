'use client'

/**
 * /walk — v1 design
 * 縁日 × Game Boy: dark LCD, hard-edge exit dialog
 * Real data: useTodayEncounterCount
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTodayEncounterCount } from '@/features/encounter/queries'

const LONG_PRESS_MS = 1200

const pad2 = (n: number) => String(Math.min(n, 99)).padStart(2, '0')

const formatElapsed = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type BatteryManager = {
  level: number
  addEventListener: (e: 'levelchange', h: () => void) => void
  removeEventListener: (e: 'levelchange', h: () => void) => void
}
type NavWithBattery = Navigator & { getBattery?: () => Promise<BatteryManager> }

function useBatteryLevel() {
  const [level, setLevel] = useState<number | null>(null)
  useEffect(() => {
    const nav = navigator as NavWithBattery
    if (typeof nav.getBattery !== 'function') return
    let bat: BatteryManager | null = null
    let cancelled = false
    const update = () => { if (bat && !cancelled) setLevel(Math.round(bat.level * 100)) }
    nav.getBattery().then((b) => {
      if (cancelled) return
      bat = b; update()
      b.addEventListener('levelchange', update)
    }).catch(() => {})
    return () => {
      cancelled = true
      bat?.removeEventListener('levelchange', update)
    }
  }, [])
  return level
}

export default function WalkMode() {
  const [elapsed, setElapsed] = useState(0)
  const [pressing, setPressing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [bump, setBump] = useState(false)
  const pressTimer = useRef<number | undefined>(undefined)
  const bumpTimer = useRef<number | undefined>(undefined)
  const prevCount = useRef(0)

  const { data: today = 0 } = useTodayEncounterCount()
  const battery = useBatteryLevel()
  const lowBattery = battery !== null && battery <= 20

  useEffect(() => {
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (today > prevCount.current) {
      setBump(false)
      window.clearTimeout(bumpTimer.current)
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => setBump(true))
      )
      bumpTimer.current = window.setTimeout(() => setBump(false), 400)
    }
    prevCount.current = today
  }, [today])

  const startPress = () => {
    setPressing(true)
    pressTimer.current = window.setTimeout(() => {
      setPressing(false)
      setConfirming(true)
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => {
    setPressing(false)
    window.clearTimeout(pressTimer.current)
  }

  return (
    <div className="enc-walk fixed inset-0 flex select-none flex-col">
      <style>{`
        .enc-walk {
          --paper-dot: #DECBA4; --panel: #FFFBF0;
          --ink: #3A332B; --ink-soft: #8A7E6B;
          --accent: #DE4D28; --gold: #E8AE3C;
          --lcd: #C2CB9D; --lcd-glow: #8FA060;
          --scan-bg: #14120E; --scan-dim: #6E6A57;

          font-family: var(--font-rounded);
          background-color: var(--scan-bg);
          color: var(--lcd);
        }
        .enc-walk::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(
            to bottom,
            rgba(194, 203, 157, 0.04) 0px, rgba(194, 203, 157, 0.04) 1px,
            transparent 1px, transparent 4px
          );
        }

        .enc-press-line { height: 3px; background: var(--accent); width: 0%; }
        .enc-press-line.is-pressing { animation: enc-press-fill ${LONG_PRESS_MS}ms linear forwards; }
        @keyframes enc-press-fill { from { width: 0%; } to { width: 100%; } }

        .enc-status-text {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          letter-spacing: 0.18em; color: var(--scan-dim);
        }
        .enc-scan-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--lcd);
          box-shadow: 0 0 6px 1px var(--lcd-glow);
          animation: enc-scan-pulse 1.6s ease-in-out infinite;
        }
        @keyframes enc-scan-pulse { 50% { opacity: 0.3; } }
        .enc-battery.is-low { color: var(--gold); }
        .enc-exit-tap { background: none; border: none; cursor: pointer; padding: 6px 0 6px 6px; }
        .enc-exit-tap:active { color: var(--lcd); }

        .enc-sonar-ring {
          position: absolute; inset: 0;
          border: 2px solid var(--lcd); border-radius: 50%;
          opacity: 0;
          animation: enc-sonar 4s cubic-bezier(0.1, 0.5, 0.5, 1) infinite;
        }
        .enc-sonar-ring:nth-child(2) { animation-delay: 1.33s; }
        .enc-sonar-ring:nth-child(3) { animation-delay: 2.66s; }
        @keyframes enc-sonar {
          0%   { transform: scale(0.35); opacity: 0; }
          8%   { opacity: 0.28; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .enc-sonar-ring { animation: none; opacity: 0.14; transform: scale(0.9); }
          .enc-sonar-ring:nth-child(2), .enc-sonar-ring:nth-child(3) { display: none; }
        }

        .enc-walk-label {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          letter-spacing: 0.34em; text-transform: uppercase;
          color: var(--scan-dim);
        }

        .enc-counter {
          font-family: var(--font-mono); font-weight: 600;
          font-size: clamp(120px, 38vw, 180px); line-height: 1;
          color: var(--lcd);
          font-variant-numeric: tabular-nums;
          text-shadow:
            0 0 8px  rgba(194, 203, 157, 0.55),
            0 0 28px rgba(143, 160, 96, 0.45),
            0 0 64px rgba(143, 160, 96, 0.25);
        }
        .enc-counter.is-bump { animation: enc-counter-bump 360ms cubic-bezier(0.2, 1.6, 0.4, 1); }
        @keyframes enc-counter-bump {
          0% { transform: scale(1); } 35% { transform: scale(1.12); } 100% { transform: scale(1); }
        }

        .enc-elapsed {
          font-family: var(--font-mono); font-size: 14px;
          letter-spacing: 0.14em; color: var(--scan-dim);
        }

        .enc-exit-btn {
          font-family: var(--font-rounded); font-size: 12px; font-weight: 700;
          color: var(--scan-dim);
          background: none;
          border: 1.5px solid #2E2A22; border-radius: 10px;
          letter-spacing: 0.08em; cursor: pointer; touch-action: none;
        }
        .enc-exit-btn:active { color: var(--lcd); border-color: var(--scan-dim); }

        .enc-dialog-veil { background: rgba(20, 18, 14, 0.78); }
        .enc-dialog {
          background: var(--panel); color: var(--ink);
          border: 2px solid var(--ink); border-radius: 14px;
          box-shadow: 5px 5px 0 0 var(--ink);
          animation: enc-dialog-in 220ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
        }
        @keyframes enc-dialog-in {
          from { transform: translateY(14px) scale(0.96); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        .enc-dialog-head { border-left: 3px solid var(--accent); }
        .enc-dialog-jp { font-size: 14px; font-weight: 800; }
        .enc-dialog-en {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft);
        }
        .enc-dialog-msg { font-size: 12px; font-weight: 500; color: var(--ink-soft); }
        .enc-dialog-btn {
          font-family: var(--font-rounded); font-size: 13px; font-weight: 800;
          border-radius: 10px; cursor: pointer;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-dialog-btn--ghost { background: none; color: var(--ink); border: 2px solid var(--paper-dot); }
        .enc-dialog-btn--ghost:active { background: var(--paper-dot); }
        .enc-dialog-btn--primary {
          background: var(--accent); color: #FFFBF0;
          border: 2px solid var(--ink);
          box-shadow: 3px 3px 0 0 var(--ink);
          text-decoration: none;
        }
        .enc-dialog-btn--primary:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 0 var(--ink); }
      `}</style>

      <div className={`enc-press-line absolute left-0 top-0 z-30 ${pressing ? 'is-pressing' : ''}`} aria-hidden="true" />

      {/* status bar */}
      <div className="relative flex items-center justify-between px-4 py-3.5" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="enc-status-text flex items-center gap-[7px]">
          <span className="enc-scan-dot shrink-0" />
          SCAN ACTIVE
        </div>
        <div className="flex items-center gap-3.5">
          <span className={`enc-status-text enc-battery ${lowBattery ? 'is-low' : ''}`}>
            BAT {battery !== null ? `${battery}%` : '—'}
          </span>
          <button type="button" className="enc-exit-tap enc-status-text" onClick={() => setConfirming(true)}>
            EXIT
          </button>
        </div>
      </div>

      {/* center */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
          <div className="enc-sonar-ring" />
          <div className="enc-sonar-ring" />
          <div className="enc-sonar-ring" />
        </div>

        <div className="enc-walk-label relative z-[2]">Today</div>
        <div className={`enc-counter relative z-[2] ${bump ? 'is-bump' : ''}`} aria-live="polite">
          {pad2(today)}
        </div>
        <div className="enc-walk-label relative z-[2]">Encounters</div>
        <div className="enc-elapsed relative z-[2] mt-2.5">{formatElapsed(elapsed)}</div>
      </div>

      {/* exit */}
      <div className="relative flex justify-center px-4" style={{ paddingBottom: 'max(26px, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          className="enc-exit-btn px-5 py-2.5"
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchCancel={cancelPress}
        >
          長押しで終了
        </button>
      </div>

      {/* exit dialog */}
      {confirming ? (
        <div className="enc-dialog-veil fixed inset-0 z-50 grid place-items-center p-6">
          <div className="enc-dialog w-full max-w-[320px] p-4 pt-5" role="alertdialog" aria-label="ウォークモードを終了">
            <div className="enc-dialog-head mb-2.5 flex items-baseline gap-2 pl-2">
              <span className="enc-dialog-jp">ウォークモードを終了</span>
              <span className="enc-dialog-en">Exit</span>
            </div>
            <div className="enc-dialog-msg mb-4">
              スキャンを停止してひろばにもどります。きょうの記録は保存されます。
            </div>
            <div className="flex gap-2.5">
              <button type="button" className="enc-dialog-btn enc-dialog-btn--ghost flex-1 px-2 py-2.5" onClick={() => setConfirming(false)}>
                続ける
              </button>
              <Link href="/designs/v1" className="enc-dialog-btn enc-dialog-btn--primary flex flex-1 items-center justify-center px-2 py-2.5">
                終了する
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
