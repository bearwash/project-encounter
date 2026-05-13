'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
    return <div className="text-neutral-400">読み込み中…</div>;
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
          className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-white focus:border-neon focus:outline-none"
        />
      </Field>

      <Field
        label="アバターコード"
        max={PROFILE_LIMITS.AVATAR_CODE_MAX}
        value={form.avatar_code}
        error={errOf('avatar_code')}
      >
        <input
          type="text"
          value={form.avatar_code}
          onChange={update('avatar_code')}
          maxLength={PROFILE_LIMITS.AVATAR_CODE_MAX}
          className="w-full rounded border border-neutral-700 bg-black px-3 py-2 font-mono text-sm text-white focus:border-neon focus:outline-none"
          placeholder="base01_top03_bot02"
        />
      </Field>

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
          className="w-full rounded border border-neutral-700 bg-black px-3 py-2 text-white focus:border-neon focus:outline-none"
          placeholder="(空でも OK)"
        />
      </Field>

      <button
        type="submit"
        disabled={save.isPending}
        className="mt-2 rounded border border-neon bg-neon/10 px-4 py-2 font-bold tracking-widest text-neon transition hover:bg-neon hover:text-black disabled:opacity-50"
      >
        {save.isPending ? '保存中…' : '保存'}
      </button>

      {save.isSuccess && (
        <p className="text-sm text-neon-cyan">プロフィールを保存しました</p>
      )}
      {save.isError && (
        <p className="whitespace-pre-line text-sm text-neon-pink">
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
        <span className="text-sm tracking-wide text-neutral-300">{label}</span>
        <span className="text-xs text-neutral-500">
          {value.length} / {max}
        </span>
      </div>
      {children}
      {error && <span className="text-xs text-neon-pink">{error}</span>}
    </label>
  );
}
