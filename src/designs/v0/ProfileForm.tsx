'use client';

// Design V2 — ProfileForm
// 適用先: src/features/profile/ProfileForm.tsx を置き換え
// 依存: globals.css に globals-v2.css の内容を追記済みであること

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/features/encounter/Avatar';
import { setSfxMuted, useSfxMuted } from '@/lib/audio/sfx';
import { hapticSuccess, setHapticsMuted, useHapticsMuted } from '@/lib/haptics';
import { DEFAULT_AVATAR_CODE, PROFILE_LIMITS } from '@/types/profile';
import { AvatarEditor } from '@/features/profile/AvatarEditor';
import { PrefectureSelect } from '@/features/profile/PrefectureSelect';
import { useProfile, useSaveProfile } from '@/features/profile/queries';
import {
  countChars,
  validateProfile,
  type ProfileInput,
  type ValidationError,
} from '@/features/profile/validation';

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
  const [avatarEditing, setAvatarEditing] = useState(false);

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
    return (
      <div className="py-8 text-center font-mono text-sm tracking-widest text-ink-muted">
        読み込み中…
      </div>
    );
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* ---- アバター ---- */}
      <div className="flex flex-col gap-2">
        <span className="section-label">アバター</span>
        <div
          className="flex items-center gap-4 rounded-[12px] p-4"
          style={{
            background: '#F5ECD8',
            border: '2px solid rgba(59,48,36,0.1)',
          }}
        >
          <div className="shrink-0">
            <Avatar code={form.avatar_code} size={72} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <code className="block truncate font-mono text-[11px] text-ink-muted">
              {form.avatar_code}
            </code>
            <button
              type="button"
              onClick={() => setAvatarEditing((v) => !v)}
              className="neo-button-ghost self-start rounded-[10px] px-4 py-1.5 text-xs font-black"
            >
              {avatarEditing ? '閉じる' : 'カスタマイズ'}
            </button>
          </div>
        </div>
        {avatarEditing && (
          <div
            className="rounded-[12px] p-4"
            style={{
              background: '#F5ECD8',
              border: '2px solid rgba(59,48,36,0.1)',
            }}
          >
            <AvatarEditor
              value={form.avatar_code}
              onChange={(avatar_code) =>
                setForm((prev) => ({ ...prev, avatar_code }))
              }
              showCode={false}
            />
            <button
              type="button"
              onClick={() => setAvatarEditing(false)}
              className="neo-button mt-4 w-full rounded-[10px] py-3 text-sm"
            >
              このアバターにする
            </button>
          </div>
        )}
        {errOf('avatar_code') && (
          <span className="text-xs font-black text-pop-red">{errOf('avatar_code')}</span>
        )}
      </div>

      {/* ---- 名前 ---- */}
      <Field
        label="なまえ"
        max={PROFILE_LIMITS.DISPLAY_NAME_MAX}
        value={form.display_name}
        error={errOf('display_name')}
      >
        <input
          type="text"
          value={form.display_name}
          onChange={update('display_name')}
          maxLength={PROFILE_LIMITS.DISPLAY_NAME_MAX}
          placeholder="ニックネームを入力"
          className="neo-input w-full px-4 py-3 text-ink text-sm font-bold focus:outline-none"
        />
      </Field>

      {/* ---- 一言メッセージ ---- */}
      <Field
        label="ひとこと"
        max={PROFILE_LIMITS.MESSAGE_MAX}
        value={form.message}
        error={errOf('message')}
      >
        <input
          type="text"
          value={form.message}
          onChange={update('message')}
          maxLength={PROFILE_LIMITS.MESSAGE_MAX}
          placeholder="(空でも OK)"
          className="neo-input w-full px-4 py-3 text-ink text-sm font-bold focus:outline-none"
        />
      </Field>

      {/* ---- 出身地 ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="home_prefecture" className="section-label">
            出身地
          </label>
          <span className="text-[10px] tracking-wide text-ink-muted">
            すれちがった人の地図に並ぶ
          </span>
        </div>
        <PrefectureSelect
          id="home_prefecture"
          value={form.home_prefecture}
          onChange={(v) => setForm((prev) => ({ ...prev, home_prefecture: v }))}
        />
        {errOf('home_prefecture') && (
          <span className="text-xs font-black text-pop-red">{errOf('home_prefecture')}</span>
        )}
      </div>

      {/* ---- 効果音・振動 ---- */}
      <div className="flex flex-col gap-3">
        <span className="section-label">システム</span>

        <ToggleRow
          label="効果音"
          detail="あいさつシーンのコツコツ / ピロリン"
          checked={!sfxMuted}
          onChange={(e) => setSfxMuted(!e.target.checked)}
          ariaLabel="効果音を有効にする"
        />

        <ToggleRow
          label="振動"
          detail="ハイタッチ / ゲート通過でブルッ"
          checked={!hapticsMuted}
          onChange={(e) => setHapticsMuted(!e.target.checked)}
          ariaLabel="振動を有効にする"
        />
      </div>

      {/* ---- 保存ボタン ---- */}
      <button
        type="submit"
        disabled={save.isPending}
        className="neo-button mt-2 w-full rounded-[12px] py-4 text-base tracking-wide"
      >
        {save.isPending ? '保存中…' : '保存する'}
      </button>

      {save.isSuccess && (
        <p className="text-center text-sm font-black text-pop-green">
          ✓ プロフィールを保存しました
        </p>
      )}
      {save.isError && (
        <p className="text-sm font-black text-pop-red">
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
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <span className="font-mono text-[10px] text-ink-muted">
          {countChars(value)}<span className="text-ink-muted/50"> / {max}</span>
        </span>
      </div>
      {children}
      {error && <span className="text-xs font-black text-pop-red">{error}</span>}
    </label>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange,
  ariaLabel,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ariaLabel: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between rounded-[10px] px-4 py-3"
      style={{
        background: '#F5ECD8',
        border: '1.5px solid rgba(59,48,36,0.1)',
      }}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-black text-ink">{label}</span>
        <span className="text-[10px] tracking-wide text-ink-muted">{detail}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 accent-[#D4402C]"
        aria-label={ariaLabel}
      />
    </label>
  );
}
