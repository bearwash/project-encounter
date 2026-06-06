import Link from 'next/link';
import { ProfileForm } from '@/features/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <main className="game-screen mx-auto flex min-h-screen max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="game-chip rounded-full px-3 py-1.5 text-xs font-black text-ink-soft transition active:translate-y-[2px]"
        >
          ← ホーム
        </Link>
        <h1 className="text-xl font-black tracking-wide text-pop-red drop-shadow-sm">
          PROFILE
        </h1>
        <span className="w-16" />
      </header>
      <section className="game-panel rounded-[24px] p-5">
        <ProfileForm />
      </section>
    </main>
  );
}
