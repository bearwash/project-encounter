'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const VERSIONS = ['v0', 'v1', 'v2'] as const;

/** 本番ルート → ページスラッグ */
const MAIN_TO_SLUG: Record<string, string> = {
  '/':        '',
  '/walk':    'walk',
  '/profile': 'profile',
  '/map':     'map',
};

/** ページスラッグ → 本番ルート */
const SLUG_TO_MAIN: Record<string, string> = {
  '':        '/',
  'walk':    '/walk',
  'profile': '/profile',
  'map':     '/map',
};

const PAGE_LABELS: Record<string, string> = {
  '':        'home',
  'walk':    'walk',
  'profile': 'profile',
  'map':     'map',
};

type Version = 'prod' | typeof VERSIONS[number];

export function DesignSwitcher() {
  const pathname = usePathname();

  let currentVersion: Version;
  let currentPage: string;

  if (pathname.startsWith('/designs/')) {
    // /designs/v1/walk → version=v1, page=walk
    const parts = pathname.split('/');
    currentVersion = (parts[2] ?? 'v0') as Version;
    currentPage    = parts[3] ?? '';
  } else if (pathname in MAIN_TO_SLUG) {
    currentVersion = 'prod';
    currentPage    = MAIN_TO_SLUG[pathname];
  } else {
    // /profile/avatar-editor など対象外ルート
    return null;
  }

  const allVersions: Version[] = ['prod', ...VERSIONS];
  const pages = Object.keys(PAGE_LABELS);

  const versionHref = (v: Version) => {
    if (v === 'prod') return SLUG_TO_MAIN[currentPage] ?? '/';
    return currentPage ? `/designs/${v}/${currentPage}` : `/designs/${v}`;
  };

  const pageHref = (p: string) => {
    if (currentVersion === 'prod') return SLUG_TO_MAIN[p] ?? '/';
    return p ? `/designs/${currentVersion}/${p}` : `/designs/${currentVersion}`;
  };

  return (
    <div
      className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-1.5 rounded-xl p-2"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
    >
      {/* バージョン行 */}
      <div className="flex items-center gap-1">
        {allVersions.map((v) => {
          const active = v === currentVersion;
          return (
            <Link
              key={v}
              href={versionHref(v)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-bold tracking-wider transition-colors"
              style={{
                background: active ? '#ffffff' : 'transparent',
                color: active ? '#000000' : 'rgba(255,255,255,0.4)',
              }}
            >
              {v.toUpperCase()}
            </Link>
          );
        })}
      </div>

      {/* ページ行 */}
      <div
        className="flex items-center gap-1 pt-1.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
      >
        {pages.map((p) => {
          const active = p === currentPage;
          return (
            <Link
              key={p || 'home'}
              href={pageHref(p)}
              className="rounded-md px-2 py-0.5 font-mono font-bold tracking-wider transition-colors"
              style={{
                fontSize: '9px',
                background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
              }}
            >
              {PAGE_LABELS[p]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
