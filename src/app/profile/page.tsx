import Link from 'next/link';
import { ProfileForm } from '@/features/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-toy border border-cream-deep bg-cream-soft px-3 py-1 text-xs font-bold text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
        >
          ← ホーム
        </Link>
        <h1 className="text-xl font-black tracking-wide text-pop-red">
          PROFILE
        </h1>
        <span className="w-16" />
      </header>
      <section className="rounded-toy border border-cream-deep bg-cream-soft p-5 shadow-toy">
        <ProfileForm />
      </section>
    </main>
  );
}
