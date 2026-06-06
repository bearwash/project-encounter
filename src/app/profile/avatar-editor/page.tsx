'use client';

/**
 * AvatarEditor ページ: my_profile.avatar_code を編集する。
 *
 * spec: docs/specs/avatar.md §8, docs/specs/profile.md §4.5
 *
 * - 未設定 (profile === null) なら /profile へ
 * - display_name と message は ProfileForm 側で編集する責務分離
 * - 保存で my_profile を UPSERT (Supabase 同期は Step 5)
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvatarEditor } from '@/features/profile/AvatarEditor';
import { useProfile, useSaveProfile } from '@/features/profile/queries';

export default function AvatarEditorPage() {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const save = useSaveProfile();

  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && profile === null) {
      router.replace('/profile');
    }
  }, [isLoading, profile, router]);

  useEffect(() => {
    if (profile && code === null) {
      setCode(profile.avatar_code);
    }
  }, [profile, code]);

  if (isLoading || !profile || code === null) {
    return <div className="game-screen min-h-screen p-6 text-ink-muted">読み込み中…</div>;
  }

  const handleSave = () => {
    save.mutate(
      {
        display_name: profile.display_name,
        avatar_code: code,
        message: profile.message,
        home_prefecture: profile.home_prefecture,
      },
      {
        onSuccess: () => router.replace('/profile'),
      },
    );
  };

  return (
    <main className="game-screen mx-auto flex min-h-screen max-w-md flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <Link
          href="/profile"
          className="game-chip rounded-full px-3 py-1.5 text-xs font-black text-ink-soft transition active:translate-y-[2px]"
        >
          ← 戻る
        </Link>
        <h1 className="text-xl font-black tracking-wide text-pop-red drop-shadow-sm">AVATAR</h1>
        <span className="w-16" />
      </header>

      <section className="game-panel rounded-[24px] p-4">
        <AvatarEditor
          value={code}
          onChange={setCode}
          onSave={handleSave}
          savePending={save.isPending}
        />
      </section>

      {save.isError && (
        <p className="text-sm font-bold text-pop-red">
          {save.error instanceof Error ? save.error.message : '保存に失敗しました'}
        </p>
      )}
    </main>
  );
}
