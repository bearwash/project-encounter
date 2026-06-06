'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/features/encounter/Avatar';
import { setSfxMuted, useSfxMuted } from '@/lib/audio/sfx';
import {
  hapticSuccess,
  setHapticsMuted,
  useHapticsMuted,
} from '@/lib/haptics';
import { DEFAULT_AVATAR_CODE, PROFILE_LIMITS } from '@/types/profile';
import { PrefectureSelect } from './PrefectureSelect';
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
  home_prefecture: null,
};

export function ProfileForm() {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();
  const save = useSaveProfile();
  const sfxMuted = useSfxMuted();
  const hapticsMuted = useHapticsMuted();

  const [form, setForm] = useState<ProfileInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name,
        avatar_code: profile.avatar_code,
        message: profile.message,
        home_prefecture: profile.home_prefecture,
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
        onSuccess: () => {
          hapticSuccess();
          router.replace('/');
        },
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
          className="game-input w-full rounded-[16px] px-3 py-2.5 text-ink focus:border-pop-red focus:outline-none"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold tracking-wide text-ink-soft">アバター</span>
        <div className="game-hud flex items-center gap-3 rounded-[20px] p-3">
          <Avatar code={form.avatar_code} size={64} />
          <div className="flex-1 min-w-0">
            <code className="block truncate font-mono text-xs text-ink-muted">
              {form.avatar_code}
            </code>
          </div>
          <Link
            href="/profile/avatar-editor"
            className="game-button rounded-full px-3 py-2 text-xs font-black"
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
          className="game-input w-full rounded-[16px] px-3 py-2.5 text-ink focus:border-pop-red focus:outline-none"
          placeholder="(空でも OK)"
        />
      </Field>

      {/* 出身地 (任意、非公開可) — spec: regional-map.md */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="home_prefecture"
            className="text-sm font-bold tracking-wide text-ink-soft"
          >
            🗾 出身地（任意）
          </label>
          <span className="text-[10px] tracking-widest text-ink-muted">
            すれちがった人の地図に並ぶ
          </span>
        </div>
        <PrefectureSelect
          id="home_prefecture"
          value={form.home_prefecture}
          onChange={(v) => setForm((prev) => ({ ...prev, home_prefecture: v }))}
        />
        {errOf('home_prefecture') && (
          <span className="text-xs font-bold text-pop-red">{errOf('home_prefecture')}</span>
        )}
      </div>

      {/* 効果音トグル — spec: sfx.md */}
      <label className="game-hud flex items-center justify-between rounded-[18px] px-3 py-2.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold tracking-wide text-ink-soft">
            効果音
          </span>
          <span className="text-[10px] tracking-widest text-ink-muted">
            あいさつシーンのコツコツ / ピロリン
          </span>
        </span>
        <input
          type="checkbox"
          checked={!sfxMuted}
          onChange={(e) => setSfxMuted(!e.target.checked)}
          className="h-5 w-5 accent-pop-red"
          aria-label="効果音を有効にする"
        />
      </label>

      {/* 振動 (Haptics) トグル */}
      <label className="game-hud flex items-center justify-between rounded-[18px] px-3 py-2.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-bold tracking-wide text-ink-soft">
            振動
          </span>
          <span className="text-[10px] tracking-widest text-ink-muted">
            ハイタッチ / ゲート通過などで「ブルッ」
          </span>
        </span>
        <input
          type="checkbox"
          checked={!hapticsMuted}
          onChange={(e) => setHapticsMuted(!e.target.checked)}
          className="h-5 w-5 accent-pop-red"
          aria-label="振動を有効にする"
        />
      </label>

      <button
        type="submit"
        disabled={save.isPending}
        className="game-button game-button-danger mt-2 rounded-full px-4 py-3 font-black tracking-wider disabled:opacity-50"
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
