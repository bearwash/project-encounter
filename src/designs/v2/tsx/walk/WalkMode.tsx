'use client'

/**
 * /walk — v2 design
 * LCD dark + sonar, softer than v1:
 *   counter weight 300, 1px sonar border, no hard-edge dialog
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
    <div className="v2w-root fixed inset-0 flex select-none flex-col">
      <style>{`
        .v2w-root {
          --surface: #FDFBF5;
          --line:    #E2DBC9;
          --text:    #3E3A32;
          --muted:   #8D8674;
          --accent:  #C95B38;
          --scan-bg:  #15130F;
          --scan-dim: #5F5B4C;
          --lcd:      #C8CFA6;
          --lcd-glow: #8FA060;

          font-family: var(--font-rounded);
          background-color: var(--scan-bg);
          color: var(--lcd);
        }
        .v2w-root::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(
            to bottom,
            rgba(200,207,166,0.03) 0px, rgba(200,207,166,0.03) 1px,
            transparent 1px, transparent 4px
          );
        }

        .v2w-press-line { height: 2px; background: var(--lcd); width: 0%; }
        .v2w-press-line.is-pressing { animation: v2w-pressFill ${LONG_PRESS_MS}ms linear forwards; }
        @keyframes v2w-pressFill { from { width: 0%; } to { width: 100%; } }

        .v2w-status-text {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.12em; color: var(--scan-dim);
        }
        .v2w-scan-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--lcd);
          animation: v2w-scanPulse 2.4s ease-in-out infinite;
        }
        @keyframes v2w-scanPulse { 50% { opacity: 0.25; } }
        .v2w-battery.is-low { color: #C9A23F; }
        .v2w-exit-tap {
          background: none; border: none; cursor: pointer; padding: 6px 0 6px 6px;
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.12em; color: var(--scan-dim);
        }
        .v2w-exit-tap:active { color: var(--lcd); }

        /* sonar — 1px border (softer than v1's 2px) */
        .v2w-sonar-ring {
          position: absolute; inset: 0;
          border: 1px solid var(--lcd); border-radius: 50%;
          opacity: 0;
          animation: v2w-sonar 5s cubic-bezier(0.1,0.4,0.4,1) infinite;
        }
        .v2w-sonar-ring:nth-child(2) { animation-delay: 1.66s; }
        .v2w-sonar-ring:nth-child(3) { animation-delay: 3.33s; }
        @keyframes v2w-sonar {
          0%   { transform: scale(0.4); opacity: 0; }
          10%  { opacity: 0.16; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .v2w-sonar-ring { animation: none; opacity: 0.08; transform: scale(0.9); }
          .v2w-sonar-ring:nth-child(2), .v2w-sonar-ring:nth-child(3) { display: none; }
        }

        .v2w-walk-label {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.3em; text-transform: uppercase;
          color: var(--scan-dim);
          position: relative; z-index: 2;
        }

        /* hero counter — weight 300 (thinner than v1's 600) */
        .v2w-counter {
          font-family: var(--font-mono); font-weight: 300;
          font-size: clamp(110px, 36vw, 168px); line-height: 1.05;
          color: var(--lcd);
          text-shadow: 0 0 22px rgba(143,160,96,0.35);
          position: relative; z-index: 2;
          font-variant-numeric: tabular-nums;
        }
        .v2w-counter.is-bump { animation: v2w-counterBump 360ms cubic-bezier(0.2,1.4,0.4,1); }
        @keyframes v2w-counterBump {
          0% { transform: scale(1); } 35% { transform: scale(1.06); } 100% { transform: scale(1); }
        }

        .v2w-elapsed {
          margin-top: 14px;
          font-family: var(--font-mono); font-size: 13px;
          letter-spacing: 0.1em; color: var(--scan-dim);
          position: relative; z-index: 2;
        }

        .v2w-exit-btn {
          font-family: var(--font-rounded); font-size: 12px; font-weight: 500;
          color: var(--scan-dim);
          background: none; border: none;
          padding: 10px 22px;
          cursor: pointer; letter-spacing: 0.04em; touch-action: none;
        }
        .v2w-exit-btn:active { color: var(--lcd); }

        /* exit dialog — soft rounded (no hard border) */
        .v2w-dialog-veil {
          background: rgba(21,19,15,0.70);
        }
        .v2w-dialog {
          width: 100%; max-width: 300px;
          background: var(--surface); color: var(--text);
          border-radius: 16px;
          padding: 22px 20px 16px;
          animation: v2w-dialogIn 200ms ease-out both;
        }
        @keyframes v2w-dialogIn {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) { .v2w-dialog { animation: none; } }
        .v2w-dialog-title { font-size: 14px; font-weight: 700; text-align: center; }
        .v2w-dialog-msg {
          margin-top: 8px; margin-bottom: 18px;
          font-size: 12px; line-height: 1.7;
          color: var(--muted); text-align: center;
        }
        .v2w-dialog-btn {
          flex: 1;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          border-radius: 11px; padding: 11px 8px; cursor: pointer;
          border: none;
          transition: opacity 100ms ease;
          text-decoration: none; text-align: center;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .v2w-dialog-btn:active { opacity: 0.7; }
        .v2w-dialog-btn--ghost { background: var(--line); color: var(--text); }
        .v2w-dialog-btn--primary { background: var(--accent); color: #FFFDF8; }
      `}</style>

      {/* press line */}
      <div className={`v2w-press-line absolute left-0 top-0 z-30 ${pressing ? 'is-pressing' : ''}`} aria-hidden="true" />

      {/* status bar */}
      <div
        className="relative flex items-center justify-between px-4"
        style={{ padding: 'max(16px, env(safe-area-inset-top)) 18px 16px' }}
      >
        <div className="v2w-status-text flex items-center gap-[7px]">
          <span className="v2w-scan-dot shrink-0" />
          SCAN ACTIVE
        </div>
        <div className="flex items-center gap-4">
          <span className={`v2w-status-text v2w-battery ${lowBattery ? 'is-low' : ''}`}>
            BAT {battery !== null ? `${battery}%` : '—'}
          </span>
          <button type="button" className="v2w-exit-tap v2w-status-text" onClick={() => setConfirming(true)}>
            EXIT
          </button>
        </div>
      </div>

      {/* center */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: 280, height: 280 }}
          aria-hidden="true"
        >
          <div className="v2w-sonar-ring" />
          <div className="v2w-sonar-ring" />
          <div className="v2w-sonar-ring" />
        </div>

        <div className="v2w-walk-label">Today</div>
        <div className={`v2w-counter ${bump ? 'is-bump' : ''}`} aria-live="polite">
          {pad2(today)}
        </div>
        <div className="v2w-walk-label">Encounters</div>
        <div className="v2w-elapsed">{formatElapsed(elapsed)}</div>
      </div>

      {/* exit button */}
      <div
        className="relative flex justify-center px-4"
        style={{ paddingBottom: 'max(30px, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          className="v2w-exit-btn"
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
        <div className="v2w-dialog-veil fixed inset-0 z-50 grid place-items-center p-6">
          <div className="v2w-dialog" role="alertdialog" aria-label="ウォークモードを終了">
            <div className="v2w-dialog-title">ウォークモードを終了</div>
            <div className="v2w-dialog-msg">
              スキャンを停止してひろばにもどります。<br />きょうの記録は保存されます。
            </div>
            <div className="flex gap-2">
              <button type="button" className="v2w-dialog-btn v2w-dialog-btn--ghost" onClick={() => setConfirming(false)}>
                続ける
              </button>
              <Link href="/designs/v2" className="v2w-dialog-btn v2w-dialog-btn--primary">
                終了する
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
