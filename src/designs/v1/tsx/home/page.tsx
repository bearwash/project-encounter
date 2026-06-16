'use client'

/**
 * / (home) — v1 design
 * 縁日スタンプラリー × Game Boy Pocket — hard borders, physical buttons
 * Real data: useTodayEncounterCount / useEncounterHistory / useBleStatus
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
    <div className="enc-home fixed inset-0">
      <style>{`
        .enc-home {
          --paper: #EFE3CB; --paper-dot: #DECBA4;
          --panel: #FFFBF0; --ink: #3A332B; --ink-soft: #8A7E6B;
          --accent: #DE4D28; --gold: #E8AE3C;
          font-family: var(--font-rounded);
          color: var(--ink);
        }

        .enc-stats {
          background: var(--panel);
          border: 2px solid var(--ink); border-radius: 12px;
          box-shadow: 3px 3px 0 0 var(--ink);
        }
        .enc-stats-badge {
          font-family: var(--font-mono); font-size: 9px; font-weight: 600;
          letter-spacing: 0.12em;
          color: #FFFBF0; background: var(--accent);
          border-radius: 5px; padding: 2px 6px;
        }
        .enc-stats-label, .enc-stats-unit { font-size: 10px; font-weight: 700; color: var(--ink-soft); }
        .enc-stats-num { font-family: var(--font-mono); font-size: 15px; font-weight: 600; }
        .enc-stats-sep { width: 2px; height: 16px; background: var(--paper-dot); border-radius: 1px; }

        .enc-icon-btn {
          background: var(--panel); color: var(--ink);
          border: 2px solid var(--ink); border-radius: 10px;
          box-shadow: 3px 3px 0 0 var(--ink);
          font-size: 19px; text-decoration: none;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-icon-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 0 var(--ink); }

        .enc-ble {
          background: var(--ink); color: #FFFBF0;
          border: 2px solid var(--ink); border-radius: 8px;
          box-shadow: 3px 3px 0 0 rgba(58, 51, 43, 0.45);
          font-size: 11px; font-weight: 700;
        }
        .enc-ble-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--gold);
          animation: enc-ble-blink 1.2s steps(2, end) infinite;
        }
        @keyframes enc-ble-blink { 50% { opacity: 0.35; } }
        .enc-ble-detail {
          font-family: var(--font-mono); font-size: 10px; font-weight: 600;
          letter-spacing: 0.1em; color: var(--gold);
        }

        .enc-walk-btn {
          background: var(--accent); color: #FFFBF0;
          border: 3px solid var(--ink); border-radius: 16px;
          box-shadow: 5px 5px 0 0 var(--ink);
          font-size: 18px; font-weight: 800; letter-spacing: 0.06em;
          text-decoration: none;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-walk-btn:active { transform: translate(4px, 4px); box-shadow: 1px 1px 0 0 var(--ink); }
        .enc-walk-sub {
          font-family: var(--font-mono); font-size: 9px; font-weight: 600;
          letter-spacing: 0.18em; opacity: 0.85;
        }

        .enc-dev-fab {
          background: var(--panel); color: var(--ink);
          border: 2px solid var(--ink); border-radius: 8px;
          box-shadow: 2px 2px 0 0 var(--ink);
          font-family: var(--font-mono); font-size: 14px; font-weight: 600;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-dev-fab.is-on { background: var(--accent); color: #FFFBF0; }
        .enc-dev-fab:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 0 var(--ink); }

        .enc-boot {
          background-color: var(--paper);
          background-image: radial-gradient(var(--paper-dot) 1.5px, transparent 1.5px);
          background-size: 18px 18px;
          transition: opacity 400ms ease;
        }
        .enc-boot.is-hidden { opacity: 0; pointer-events: none; }
        .enc-boot-mark {
          background: var(--gold);
          border: 2.5px solid var(--ink); border-radius: 14px;
          box-shadow: 4px 4px 0 0 var(--ink);
          font-size: 28px; font-weight: 800;
        }
        .enc-boot-title { font-size: 20px; font-weight: 800; letter-spacing: 0.26em; }
        .enc-boot-underline { width: 32px; height: 4px; background: var(--accent); border-radius: 2px; }
        .enc-boot-msg { font-size: 13px; font-weight: 700; color: var(--ink-soft); }
        .enc-boot-btn {
          background: var(--accent); color: #FFFBF0;
          border: 2px solid var(--ink); border-radius: 12px;
          box-shadow: 4px 4px 0 0 var(--ink);
          font-size: 14px; font-weight: 800;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-boot-btn:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 0 var(--ink); }
      `}</style>

      <div className="absolute inset-0" aria-hidden="true">
        <EncounterPlaza3D residents={history} joiningIds={[]} />
      </div>

      {/* top HUD */}
      <div
        className="absolute left-0 right-0 z-10 flex items-start justify-between gap-2.5 px-3"
        style={{ top: 'max(10px, env(safe-area-inset-top))' }}
      >
        <div className="enc-stats flex items-center gap-2 px-2.5 py-[7px]">
          <span className="enc-stats-badge">TODAY</span>
          <span className="flex items-baseline gap-[3px]">
            <span className="enc-stats-label">きょうのすれちがい</span>
            <span className="enc-stats-num">{todayCount}</span>
            <span className="enc-stats-unit">人</span>
          </span>
          <span className="enc-stats-sep" />
          <span className="flex items-baseline gap-[3px]">
            <span className="enc-stats-label">なかま</span>
            <span className="enc-stats-num">{history.length}</span>
            <span className="enc-stats-unit">人</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Link href="/designs/v1/map" className="enc-icon-btn grid h-11 w-11 place-items-center" aria-label="ちずをひらく">
            🗾
          </Link>
          <Link href="/designs/v1/profile" className="enc-icon-btn grid h-11 w-11 place-items-center" aria-label="プロフィール">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
              <rect x="3.5" y="11.5" width="13" height="8" rx="4" fill="currentColor" />
            </svg>
          </Link>
        </div>
      </div>

      {/* bottom HUD */}
      <div
        className="absolute left-0 right-0 z-10 flex flex-col items-center gap-2.5 px-4"
        style={{ bottom: 'max(14px, env(safe-area-inset-bottom))' }}
      >
        {!bleOk ? (
          <div className="enc-ble flex items-center gap-2 px-3 py-1.5" role="status">
            <span className="enc-ble-dot shrink-0" />
            Bluetoothがオフになっています
            <span className="enc-ble-detail ml-1">詳細</span>
          </div>
        ) : null}
        <Link href="/designs/v1/walk" className="enc-walk-btn flex w-full max-w-[360px] items-center justify-center gap-2.5 px-5 py-4">
          <span className="text-[22px]" aria-hidden="true">👣</span>
          <span>
            ウォークモード
            <span className="enc-walk-sub block text-left">START WALKING</span>
          </span>
        </Link>
      </div>

      {/* dev fab */}
      <button
        type="button"
        className={`enc-dev-fab absolute right-3 z-10 grid h-9 w-9 place-items-center ${devOn ? 'is-on' : ''}`}
        style={{ bottom: 'max(14px, env(safe-area-inset-bottom))' }}
        aria-pressed={devOn}
        onClick={() => setDevOn((v) => !v)}
      >
        ?
      </button>

      {/* boot */}
      <div className={`enc-boot absolute inset-0 z-40 grid place-items-center ${booted ? 'is-hidden' : ''}`}>
        <div className="p-6 text-center">
          <div className="enc-boot-mark mx-auto mb-4 grid h-16 w-16 place-items-center" aria-hidden="true">縁</div>
          <div className="enc-boot-title">ENCOUNTER</div>
          <div className="enc-boot-underline mx-auto mb-3.5 mt-1.5" />
          <div className="enc-boot-msg">ひろばを じゅんびしています…</div>
          <button type="button" className="enc-boot-btn mt-5 inline-flex items-center gap-2 px-5 py-2.5" onClick={() => setBooted(true)}>
            ひろばへ すすむ
          </button>
        </div>
      </div>
    </div>
  )
}
