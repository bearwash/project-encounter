'use client'

/**
 * /  (home) — v2 design
 * Palette: paper #F4EFE4 · surface #FDFBF5 · accent #C95B38
 * Style: soft pills, subtle shadow — no hard borders
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useTodayEncounterCount, useEncounterHistory } from '@/features/encounter/queries'
import { useBleStatus } from '@/features/ble/use-ble-status'

const EncounterPlaza3D = dynamic(
  () => import('@/features/encounter/EncounterPlaza3D').then((m) => m.EncounterPlaza3D),
  { ssr: false }
)

export default function HomePage() {
  const [booted, setBooted] = useState(false)
  const [devOn, setDevOn] = useState(false)

  const { data: todayCount = 0 } = useTodayEncounterCount()
  const { data: history = [] } = useEncounterHistory()
  const { data: bleStatus } = useBleStatus()
  const bleOk = !!(bleStatus?.scan_active || bleStatus?.advertise_active)

  useEffect(() => {
    const id = window.setTimeout(() => setBooted(true), 1600)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="v2h-root fixed inset-0">
      <style>{`
        .v2h-root {
          --bg:      #F4EFE4;
          --surface: #FDFBF5;
          --line:    #E2DBC9;
          --text:    #3E3A32;
          --muted:   #8D8674;
          --accent:  #C95B38;
          font-family: var(--font-rounded);
          color: var(--text);
        }

        .v2h-stats {
          display: flex; align-items: center; gap: 8px;
          white-space: nowrap;
          background: var(--surface);
          border-radius: 999px;
          box-shadow: 0 1px 2px rgba(62,58,50,0.10);
          padding: 8px 14px;
          font-size: 12px; font-weight: 500;
        }
        .v2h-stats-label { color: var(--muted); }
        .v2h-stats-num   { font-weight: 700; margin: 0 1px; }
        .v2h-stats-sep   { width: 1px; height: 12px; background: var(--line); }

        .v2h-icon-btn {
          width: 40px; height: 40px;
          display: grid; place-items: center;
          background: var(--surface); color: var(--text);
          border-radius: 13px;
          box-shadow: 0 1px 2px rgba(62,58,50,0.10);
          text-decoration: none;
          font-size: 17px;
          transition: opacity 100ms ease, transform 100ms ease;
        }
        .v2h-icon-btn:active { opacity: 0.7; transform: scale(0.96); }

        .v2h-ble {
          display: flex; align-items: center; gap: 7px;
          white-space: nowrap;
          background: var(--surface); color: var(--text);
          border-radius: 999px;
          box-shadow: 0 1px 2px rgba(62,58,50,0.10);
          padding: 7px 14px;
          font-size: 12px; font-weight: 500;
        }
        .v2h-ble-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--accent); flex: none;
          animation: v2h-bleBlink 1.6s ease-in-out infinite;
        }
        @keyframes v2h-bleBlink { 50% { opacity: 0.3; } }
        .v2h-ble-detail { color: var(--accent); font-weight: 700; margin-left: 2px; }

        .v2h-walk-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; max-width: 340px;
          background: var(--accent); color: #FFFDF8;
          border-radius: 16px;
          padding: 16px 20px;
          font-family: var(--font-rounded);
          font-size: 16px; font-weight: 700; letter-spacing: 0.02em;
          text-decoration: none;
          box-shadow: 0 2px 10px rgba(201,91,56,0.30);
          transition: opacity 100ms ease, transform 100ms ease;
        }
        .v2h-walk-btn:active { opacity: 0.85; transform: scale(0.985); }
        .v2h-walk-sub {
          font-family: var(--font-mono);
          font-size: 9px; font-weight: 400;
          letter-spacing: 0.12em; opacity: 0.75;
        }

        .v2h-dev-fab {
          width: 32px; height: 32px;
          display: grid; place-items: center;
          background: var(--surface); color: var(--muted);
          border: none; border-radius: 10px;
          box-shadow: 0 1px 2px rgba(62,58,50,0.10);
          font-family: var(--font-mono); font-size: 13px;
          cursor: pointer;
          transition: opacity 100ms ease;
        }
        .v2h-dev-fab.is-on { background: var(--accent); color: #FFFDF8; }
        .v2h-dev-fab:active { opacity: 0.7; }

        .v2h-boot {
          background: var(--bg);
          transition: opacity 500ms ease;
        }
        .v2h-boot.is-hidden { opacity: 0; pointer-events: none; }
        .v2h-boot-title {
          font-size: 16px; font-weight: 700;
          letter-spacing: 0.14em; color: var(--text);
        }
        .v2h-boot-msg {
          margin-top: 10px;
          font-size: 12px; font-weight: 500; color: var(--muted);
        }
        .v2h-boot-btn {
          margin-top: 28px;
          display: inline-flex; align-items: center;
          background: var(--accent); color: #FFFDF8;
          border: none; border-radius: 12px;
          padding: 11px 26px;
          font-family: var(--font-rounded); font-size: 13px; font-weight: 700;
          cursor: pointer;
          transition: opacity 100ms ease;
        }
        .v2h-boot-btn:active { opacity: 0.85; }
      `}</style>

      {/* plaza */}
      <div className="absolute inset-0" aria-hidden="true">
        <EncounterPlaza3D residents={history} joiningIds={[]} />
      </div>

      {/* ── top HUD ── */}
      <div
        className="absolute left-0 right-0 z-10 flex items-start justify-between gap-2.5 px-3.5"
        style={{ top: 'max(12px, env(safe-area-inset-top))' }}
      >
        <div className="v2h-stats">
          <span className="v2h-stats-label">きょう</span>
          <span className="v2h-stats-num">{todayCount}</span>
          <span className="v2h-stats-label">人</span>
          <span className="v2h-stats-sep" />
          <span className="v2h-stats-label">なかま</span>
          <span className="v2h-stats-num">{history.length}</span>
          <span className="v2h-stats-label">人</span>
        </div>
        <div className="flex gap-2">
          <Link href="/designs/v2/map" className="v2h-icon-btn" aria-label="ちずをひらく">🗾</Link>
          <Link href="/designs/v2/profile" className="v2h-icon-btn" aria-label="プロフィール">
            <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
              <rect x="3.5" y="11.5" width="13" height="8" rx="4" fill="currentColor" />
            </svg>
          </Link>
        </div>
      </div>

      {/* ── bottom HUD ── */}
      <div
        className="absolute left-0 right-0 z-10 flex flex-col items-center gap-2.5 px-5"
        style={{ bottom: 'max(18px, env(safe-area-inset-bottom))' }}
      >
        {!bleOk ? (
          <div className="v2h-ble" role="status">
            <span className="v2h-ble-dot" />
            Bluetoothがオフになっています
            <span className="v2h-ble-detail">詳細</span>
          </div>
        ) : null}
        <Link href="/designs/v2/walk" className="v2h-walk-btn">
          <span className="mr-2.5 text-[20px]" aria-hidden="true">👣</span>
          <span>
            ウォークモード
            <span className="v2h-walk-sub block text-left">START WALKING</span>
          </span>
        </Link>
      </div>

      {/* dev fab */}
      <button
        type="button"
        className={`v2h-dev-fab absolute right-3.5 z-10 ${devOn ? 'is-on' : ''}`}
        style={{ bottom: 'max(18px, env(safe-area-inset-bottom))' }}
        aria-pressed={devOn}
        onClick={() => setDevOn((v) => !v)}
      >
        ?
      </button>

      {/* ── boot ── */}
      <div className={`v2h-boot absolute inset-0 z-40 grid place-items-center ${booted ? 'is-hidden' : ''}`}>
        <div className="p-6 text-center">
          <div className="v2h-boot-title">ENCOUNTER</div>
          <div className="v2h-boot-msg">ひろばをじゅんびしています</div>
          <button type="button" className="v2h-boot-btn" onClick={() => setBooted(true)}>
            ひろばへ すすむ
          </button>
        </div>
      </div>
    </div>
  )
}
