'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/features/encounter/Avatar';
import { DEFAULT_AVATAR_CODE, PROFILE_LIMITS } from '@/types/profile';
import { useProfile, useSaveProfile } from './queries';
import {
  validateProfile,
  type ProfileInput,
  type ValidationError,
} from './validation';

const EMPTY_FORM: ProfileInput = {
  display_name: '',
  avatar_code: DEFAULT_AVATAR_CODE,
  message: '',
};

export function ProfileForm() {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const save = useSaveProfile();

  const [form, setForm] = useState<ProfileInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name,
        avatar_code: profile.avatar_code,
        message: profile.message,
      });
    }
  }, [profile]);

  if (isLoading) {
    return <div className="text-ink-muted">読み込み中…</div>;
  }

  const errOf = (field: keyof ProfileInput) =>
    errors.find((e) => e.field === field)?.message;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    if (found.length === 0) {
      save.mutate(form, {
        onSuccess: () => router.replace('/'),
      });
    }
  };

  const update =
    (field: keyof ProfileInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field
        label="名前"
        max={PROFILE_LIMITS.DISPLAY_NAME_MAX}
        value={form.display_name}
        error={errOf('display_name')}
      >
        <input
          type="text"
          value={form.display_name}
          onChange={update('display_name')}
          maxLength={PROFILE_LIMITS.DISPLAY_NAME_MAX}
          className="w-full rounded-toy border border-cream-deep bg-cream-soft px-3 py-2 text-ink shadow-toy focus:border-pop-red focus:outline-none"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold tracking-wide text-ink-soft">アバター</span>
        <div className="flex items-center gap-3 rounded-toy border border-cream-deep bg-cream-soft p-3 shadow-toy">
          <Avatar code={form.avatar_code} size={64} />
          <div className="flex-1 min-w-0">
            <code className="block truncate font-mono text-xs text-ink-muted">
              {form.avatar_code}
            </code>
          </div>
          <Link
            href="/profile/avatar-editor"
            className="rounded-toy border-2 border-pop-blue bg-pop-blue/10 px-3 py-1.5 text-xs font-bold text-pop-blue shadow-toy transition active:translate-y-[2px] active:shadow-none"
          >
            編集
          </Link>
        </div>
        {errOf('avatar_code') && (
          <span className="text-xs font-bold text-pop-red">{errOf('avatar_code')}</span>
        )}
      </div>

      <Field
        label="一言メッセージ"
        max={PROFILE_LIMITS.MESSAGE_MAX}
        value={form.message}
        error={errOf('message')}
      >
        <input
          type="text"
          value={form.message}
          onChange={update('message')}
          maxLength={PROFILE_LIMITS.MESSAGE_MAX}
          className="w-full rounded-toy border border-cream-deep bg-cream-soft px-3 py-2 text-ink shadow-toy focus:border-pop-red focus:outline-none"
          placeholder="(空でも OK)"
        />
      </Field>

      <button
        type="submit"
        disabled={save.isPending}
        className="mt-2 rounded-toy border border-pop-red bg-pop-red px-4 py-2.5 font-bold tracking-wider text-cream-soft shadow-toy transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
      >
        {save.isPending ? '保存中…' : '保存'}
      </button>

      {save.isSuccess && (
        <p className="text-sm font-bold text-pop-green">
          プロフィールを保存しました
        </p>
      )}
      {save.isError && (
        <p className="whitespace-pre-line text-sm font-bold text-pop-red">
          {save.error instanceof Error ? save.error.message : '保存に失敗しました'}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  max,
  value,
  error,
  children,
}: {
  label: string;
  max: number;
  value: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold tracking-wide text-ink-soft">
          {label}
        </span>
        <span className="text-xs text-ink-muted">
          {value.length} / {max}
        </span>
      </div>
      {children}
      {error && <span className="text-xs font-bold text-pop-red">{error}</span>}
    </label>
  );
}
