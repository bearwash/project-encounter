import Link from 'next/link';
import { ProfileForm } from '@/features/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-400 hover:text-neon-cyan"
        >
          ← ホーム
        </Link>
        <h1 className="text-2xl font-bold tracking-widest text-neon">
          PROFILE
        </h1>
        <span className="w-12" />
      </header>
      <ProfileForm />
    </main>
  );
}
