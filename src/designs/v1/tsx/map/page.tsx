'use client'

/**
 * /map — v1 design
 * 縁日 × Game Boy: physical × close button
 * Real data: useEncounterHistory / useProfile
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEncounterHistory } from '@/features/encounter/queries'
import { useProfile } from '@/features/profile/queries'

function MapLoading() {
  return (
    <div className="enc-map-loading fixed inset-0 z-10 grid place-items-center">
      <div className="enc-map-loading-card px-7 py-5 text-center">
        <div className="enc-map-loading-mark mx-auto mb-3 grid h-12 w-12 place-items-center" aria-hidden="true">図</div>
        <div className="enc-map-loading-title">ちずを ひらいています</div>
        <div className="enc-map-loading-sub mt-1">LOADING REGIONAL MAP…</div>
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
    <div className="enc-map fixed inset-0">
      <style>{`
        .enc-map {
          --paper: #EFE3CB; --paper-dot: #DECBA4;
          --panel: #FFFBF0; --ink: #3A332B; --ink-soft: #8A7E6B;
          --accent: #DE4D28; --gold: #E8AE3C;

          font-family: var(--font-rounded);
          color: var(--ink);
          background-color: var(--paper);
          background-image: radial-gradient(var(--paper-dot) 1px, transparent 1px);
          background-size: 22px 22px;
        }

        .enc-map-close {
          background: var(--panel); color: var(--ink);
          border: 2px solid var(--ink); border-radius: 10px;
          box-shadow: 3px 3px 0 0 var(--ink);
          text-decoration: none;
          transition: transform 80ms ease, box-shadow 80ms ease;
        }
        .enc-map-close:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 0 var(--ink); }
        .enc-map-close-glyph { position: relative; width: 16px; height: 16px; }
        .enc-map-close-glyph::before,
        .enc-map-close-glyph::after {
          content: ''; position: absolute; left: 50%; top: 50%;
          width: 18px; height: 3px; border-radius: 2px;
          background: var(--ink);
        }
        .enc-map-close-glyph::before { transform: translate(-50%, -50%) rotate(45deg); }
        .enc-map-close-glyph::after  { transform: translate(-50%, -50%) rotate(-45deg); }

        .enc-map-loading {
          background-color: var(--paper);
          background-image: radial-gradient(var(--paper-dot) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        .enc-map-loading-card {
          background: var(--panel);
          border: 2px solid var(--ink); border-radius: 14px;
          box-shadow: 5px 5px 0 0 var(--ink);
        }
        .enc-map-loading-mark {
          background: var(--gold);
          border: 2px solid var(--ink); border-radius: 10px;
          box-shadow: 3px 3px 0 0 var(--ink);
          font-size: 22px; font-weight: 800;
          animation: enc-map-wobble 1.4s ease-in-out infinite;
        }
        @keyframes enc-map-wobble {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @media (prefers-reduced-motion: reduce) { .enc-map-loading-mark { animation: none; } }
        .enc-map-loading-title { font-size: 14px; font-weight: 800; }
        .enc-map-loading-sub {
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.16em; color: var(--ink-soft);
        }
      `}</style>

      <div className="absolute inset-0">
        <RegionalMap residents={history} myHomePrefecture={profile?.home_prefecture ?? null} />
      </div>

      <Link
        href="/designs/v1"
        className="enc-map-close fixed right-3 z-20 grid h-11 w-11 place-items-center"
        style={{ top: 'max(12px, env(safe-area-inset-top))' }}
        aria-label="とじる"
      >
        <span className="enc-map-close-glyph" />
      </Link>
    </div>
  )
}
