'use client'

/**
 * /map — v2 design
 * Close button: flat square, subtle shadow — no hard border
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEncounterHistory } from '@/features/encounter/queries'
import { useProfile } from '@/features/profile/queries'

function MapLoading() {
  return (
    <div className="v2m-loading fixed inset-0 z-10 grid place-items-center">
      <div className="text-center">
        <div className="v2m-loading-title">ちずをひらいています</div>
        <div className="v2m-loading-sub mt-1.5">LOADING REGIONAL MAP…</div>
      </div>
    </div>
  )
}

const RegionalMap = dynamic(
  () => import('@/features/regional-map/RegionalMap').then((m) => m.RegionalMap),
  { ssr: false, loading: () => <MapLoading /> }
)

export default function MapPage() {
  const { data: history = [] } = useEncounterHistory()
  const { data: profile } = useProfile()

  return (
    <div className="v2m-root fixed inset-0">
      <style>{`
        .v2m-root {
          --bg:      #F4EFE4;
          --surface: #FDFBF5;
          --text:    #3E3A32;
          --muted:   #8D8674;
          font-family: var(--font-rounded);
          color: var(--text);
          background: var(--bg);
        }

        .v2m-loading {
          background: var(--bg);
        }
        .v2m-loading-title { font-size: 13px; font-weight: 700; }
        .v2m-loading-sub {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.16em; color: var(--muted);
        }

        .v2m-close {
          background: var(--surface); color: var(--text);
          border-radius: 13px;
          box-shadow: 0 1px 3px rgba(62,58,50,0.14);
          text-decoration: none;
          transition: opacity 100ms ease, transform 100ms ease;
          width: 40px; height: 40px;
          display: grid; place-items: center;
        }
        .v2m-close:active { opacity: 0.7; transform: scale(0.96); }
        .v2m-close-glyph { position: relative; width: 14px; height: 14px; }
        .v2m-close-glyph::before,
        .v2m-close-glyph::after {
          content: ''; position: absolute; left: 50%; top: 50%;
          width: 16px; height: 1.8px; border-radius: 1px;
          background: var(--text);
        }
        .v2m-close-glyph::before { transform: translate(-50%, -50%) rotate(45deg); }
        .v2m-close-glyph::after  { transform: translate(-50%, -50%) rotate(-45deg); }
      `}</style>

      <div className="absolute inset-0">
        <RegionalMap residents={history} myHomePrefecture={profile?.home_prefecture ?? null} />
      </div>

      <Link
        href="/designs/v2"
        className="v2m-close fixed right-3.5 z-20"
        style={{ top: 'max(14px, env(safe-area-inset-top))' }}
        aria-label="とじる"
      >
        <span className="v2m-close-glyph" />
      </Link>
    </div>
  )
}
