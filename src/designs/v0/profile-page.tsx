// Design V2 — Profile page wrapper
// 適用先: src/app/profile/page.tsx を置き換え
// 依存: globals.css に globals-v2.css の内容を追記済みであること

import Link from 'next/link';
import dynamic from 'next/dynamic';

const ProfileForm = dynamic(
  () =>
    import('@/designs/v0/ProfileForm').then((mod) => mod.ProfileForm),
  {
    loading: () => (
      <div className="py-10 text-center font-mono text-sm tracking-[0.25em] text-ink-muted">
        読み込み中...
      </div>
    ),
  },
);

export default function ProfilePage() {
  return (
    <main
      className="game-screen mx-auto flex min-h-screen max-w-md flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 24px)' }}
    >
      {/* ---- ヘッダー ---- */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3 pt-12"
        style={{
          background: '#fff8e8',
          borderBottom: '2px solid rgba(59,48,36,0.08)',
        }}
      >
        <Link
          href="/"
          className="neo-button-ghost flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-black"
        >
          <span aria-hidden>←</span>
          <span>ホーム</span>
        </Link>

        <div className="flex flex-col items-center gap-0">
          <span
            className="font-black tracking-[0.25em] text-ink"
            style={{ fontSize: '13px' }}
          >
            PROFILE
          </span>
          <div
            className="h-1 w-8 rounded-full"
            style={{ background: '#D4402C' }}
            aria-hidden
          />
        </div>

        {/* バランス用のスペーサー */}
        <div className="w-[72px]" />
      </header>

      {/* ---- フォーム本体 ---- */}
      <div className="flex-1 px-4 py-6">
        {/* キャラクター登録カード */}
        <div
          className="rounded-[18px] px-5 py-6"
          style={{
            background: '#FFFAF0',
            border: '2.5px solid rgba(59,48,36,0.13)',
            boxShadow: '5px 5px 0 0 rgba(59,48,36,0.08)',
          }}
        >
          {/* カードタイトル */}
          <div className="mb-6 flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] font-black text-cream-soft"
              style={{ background: '#D4402C', fontSize: '18px' }}
              aria-hidden
            >
              PE
            </div>
            <div>
              <p className="text-[11px] font-black tracking-[0.2em] text-ink">
                キャラクター登録
              </p>
              <p className="mt-0.5 text-[10px] tracking-wide text-ink-muted">
                すれちがった人に表示されます
              </p>
            </div>
          </div>

          <ProfileForm />
        </div>
      </div>
    </main>
  );
}
