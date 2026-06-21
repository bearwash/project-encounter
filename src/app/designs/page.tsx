import Link from 'next/link';

const VERSIONS = ['v0', 'v1', 'v2'] as const;
const PAGES = [
  { slug: '',        label: 'Home' },
  { slug: 'walk',    label: 'Walk Mode' },
  { slug: 'profile', label: 'Profile' },
  { slug: 'map',     label: 'Map' },
];

export default function DesignsIndexPage() {
  return (
    <main className="min-h-screen bg-[#111] p-8 text-white">
      <h1 className="mb-8 font-mono text-lg font-black tracking-[0.2em] text-white/60">
        DESIGN COMPARISON
      </h1>
      <div className="grid gap-6 sm:grid-cols-3">
        {VERSIONS.map((v) => (
          <div key={v} className="rounded-xl border border-white/10 p-4">
            <p className="mb-4 font-mono text-xs font-black tracking-[0.3em] text-white/40">
              {v.toUpperCase()}
            </p>
            <div className="flex flex-col gap-2">
              {PAGES.map(({ slug, label }) => (
                <Link
                  key={slug}
                  href={slug ? `/designs/${v}/${slug}` : `/designs/${v}`}
                  className="rounded-lg bg-white/5 px-4 py-2.5 font-mono text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
