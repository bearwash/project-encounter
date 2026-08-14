'use client';

import { Canvas } from '@react-three/fiber';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RequireAuth, useAuth } from '@/features/auth/AuthProvider';
import { StylizedPlazaAvatar } from '@/features/encounter/StylizedPlazaAvatar';
import {
  DEFAULT_WARDROBE,
  WARDROBE_CATALOG,
  WARDROBE_TABS,
  normalizeWardrobeSelection,
  swatchColors,
  wardrobeToAppearance,
  type WardrobeCategory,
  type WardrobeSelection,
} from '@/features/encounter/parts/wardrobe';
import { useCloudConsent, useSetCloudConsent } from '@/features/profile/consent';
import { useProfile, useSaveProfile } from '@/features/profile/queries';
import { countChars, validateProfile } from '@/features/profile/validation';
import {
  cancelPendingPublicationWithdrawal,
  withdrawPublicProfile,
} from '@/features/profile/publication';
import { isTauri } from '@/lib/tauri/env';
import { DEFAULT_AVATAR_CODE, PROFILE_LIMITS } from '@/types/profile';

const WARDROBE_STORAGE_KEY = 'project-encounter:plaza-wardrobe:v1';

type LocalProfileDraft = {
  displayName: string;
  message: string;
};

function profileDraftKey(userId: string) {
  return `project-encounter:profile-draft:${userId}:v1`;
}

function communityTermsKey(userId: string) {
  return `project-encounter:community-terms:${userId}:v1`;
}

export default function WorkshopExperience() {
  return (
    <RequireAuth
      returnTo="/workshop"
      reason="工房で作った見た目と、広場で表示する名前・一言をあなたのプロフィールに保存します。"
    >
      <AuthenticatedWorkshop />
    </RequireAuth>
  );
}

function AuthenticatedWorkshop() {
  const { user, signOut } = useAuth();
  const profile = useProfile();
  const saveProfile = useSaveProfile();
  const cloudConsent = useCloudConsent();
  const setCloudConsent = useSetCloudConsent();
  const [wardrobe, setWardrobe] = useState<WardrobeSelection>(DEFAULT_WARDROBE);
  const [activeCategory, setActiveCategory] = useState<WardrobeCategory>('hairStyle');
  const [displayName, setDisplayName] = useState('あなた');
  const [message, setMessage] = useState('こんにちは！');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      const savedWardrobe = window.localStorage.getItem(WARDROBE_STORAGE_KEY);
      if (savedWardrobe) setWardrobe(normalizeWardrobeSelection(JSON.parse(savedWardrobe)));
      const savedDraft = window.localStorage.getItem(profileDraftKey(user.id));
      if (savedDraft) {
        const draft = JSON.parse(savedDraft) as Partial<LocalProfileDraft>;
        if (typeof draft.displayName === 'string') setDisplayName(draft.displayName);
        if (typeof draft.message === 'string') setMessage(draft.message);
      }
      setTermsAccepted(window.localStorage.getItem(communityTermsKey(user.id)) === '1');
    } catch (restoreError) {
      console.warn('[workshop] restore failed:', restoreError);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.display_name);
    setMessage(profile.data.message);
  }, [profile.data]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify(wardrobe));
  }, [loaded, wardrobe]);

  const appearance = useMemo(() => wardrobeToAppearance(wardrobe), [wardrobe]);
  const items = WARDROBE_CATALOG[activeCategory];
  const publicEnabled = cloudConsent.data?.status === 'granted';

  const changePublication = async (enabled: boolean) => {
    if (!user) return;
    setError(null);
    if (enabled) {
      cancelPendingPublicationWithdrawal(user.id);
      await setCloudConsent.mutateAsync('granted');
      return;
    }

    // 端末側の公開同意を先に撤回し、以後の同期と BLE 公開を止める。
    await setCloudConsent.mutateAsync('declined');
    if (user.isTest) return;
    try {
      await withdrawPublicProfile(user.id);
      setNotice('公開を停止し、クラウドのプロフィールを削除しました。');
    } catch (withdrawError) {
      console.warn('[workshop] profile withdrawal queued:', withdrawError);
      setError('公開は停止しました。クラウドからの削除は通信回復後に自動で再試行します。');
    }
  };

  const save = async () => {
    if (!user) return;
    const nextName = displayName.trim();
    const nextMessage = message.trim();
    const input = {
      display_name: nextName,
      message: nextMessage,
      avatar_code: profile.data?.avatar_code ?? DEFAULT_AVATAR_CODE,
      home_prefecture: profile.data?.home_prefecture ?? null,
    };
    const validation = validateProfile(input);
    if (validation.length > 0) {
      setError(validation[0]!.message);
      setNotice(null);
      return;
    }
    if (publicEnabled && !termsAccepted) {
      setError('公開する前にコミュニティルールと利用規約への同意が必要です。');
      setNotice(null);
      return;
    }

    window.localStorage.setItem(
      profileDraftKey(user.id),
      JSON.stringify({ displayName: nextName, message: nextMessage } satisfies LocalProfileDraft),
    );
    window.localStorage.setItem(WARDROBE_STORAGE_KEY, JSON.stringify(wardrobe));

    try {
      if (isTauri()) await saveProfile.mutateAsync(input);
      setDisplayName(nextName);
      setMessage(nextMessage);
      setError(null);
      setNotice(
        isTauri() && publicEnabled
          ? '見た目・名前・一言を保存し、公開プロフィールへ同期しました。'
          : 'この端末に見た目・名前・一言を保存しました。',
      );
    } catch (saveError) {
      console.error('[workshop] save failed:', saveError);
      setError('保存できませんでした。通信状態を確認してもう一度お試しください。');
      setNotice(null);
    }
  };

  return (
    <main className="workshop" data-app-ready="true">
      <header className="workshop__topbar">
        <Link href="/" className="tower-icon-button" aria-label="Messengerへ戻る">‹</Link>
        <div>
          <span>AVATAR WORKSHOP</span>
          <h1>旅支度の工房</h1>
        </div>
        <nav aria-label="工房メニュー">
          <Link href="/tower">タワー</Link>
          <Link href="/shop">コイン</Link>
          {user?.isTest && <button type="button" onClick={() => signOut()}>テスト終了</button>}
        </nav>
      </header>

      <div className="workshop__layout">
        <section className="workshop-preview" aria-label="アバタープレビュー">
          <div className="workshop-preview__stamp" aria-hidden>MADE BY YOU</div>
          <div className="workshop-preview__bubble" aria-label="広場での表示プレビュー">
            <strong>{displayName.trim() || '名前'}</strong>
            <span>{message.trim() || '一言を入力するとここに表示されます'}</span>
          </div>
          <Canvas
            camera={{ position: [0, 1.1, 7.2], fov: 25 }}
            dpr={[1, 1.25]}
            gl={{ antialias: false, alpha: true, stencil: false, powerPreference: 'high-performance' }}
          >
            <ambientLight intensity={1.05} />
            <directionalLight position={[3, 5, 4]} intensity={1.25} />
            <group position={[0, -1.22, 0]} rotation={[0, -0.04, 0]}>
              <StylizedPlazaAvatar
                avatarCode={profile.data?.avatar_code ?? DEFAULT_AVATAR_CODE}
                userId="workshop-preview"
                appearanceOverrides={appearance}
                highDetailHair
                scale={0.9}
              />
            </group>
          </Canvas>
          <div className="workshop-preview__floor" aria-hidden />
        </section>

        <section className="workshop-controls" aria-label="見た目の編集">
          <div className="workshop-controls__title">
            <p>PAINT & PARTS</p>
            <h2>見た目をつくる</h2>
          </div>
          <div className="workshop-tabs" role="tablist" aria-label="編集するパーツ">
            {WARDROBE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeCategory === tab.key}
                onClick={() => setActiveCategory(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="workshop-swatches" role="radiogroup" aria-label={`${WARDROBE_TABS.find((tab) => tab.key === activeCategory)?.label}の選択`}>
            {items.map((item) => {
              const colors = swatchColors(activeCategory, item.id);
              const selected = wardrobe[activeCategory] === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setWardrobe((current) => ({ ...current, [activeCategory]: item.id }))}
                >
                  <span
                    style={{
                      background: colors.secondary
                        ? `linear-gradient(120deg, ${colors.primary} 0 52%, ${colors.secondary} 52% 100%)`
                        : colors.primary,
                    }}
                    aria-hidden
                  />
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>
        </section>

        <section className="workshop-profile" aria-labelledby="workshop-profile-title">
          <div className="workshop-controls__title">
            <p>PLAZA CARD</p>
            <h2 id="workshop-profile-title">名前と一言</h2>
          </div>

          <label>
            <span>名前 <small>{countChars(displayName)} / {PROFILE_LIMITS.DISPLAY_NAME_MAX}</small></span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={PROFILE_LIMITS.DISPLAY_NAME_MAX * 2}
              placeholder="広場で表示する名前"
            />
          </label>
          <label>
            <span>一言 <small>{countChars(message)} / {PROFILE_LIMITS.MESSAGE_MAX}</small></span>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={PROFILE_LIMITS.MESSAGE_MAX * 2}
              placeholder="近づいた人に見える一言"
            />
          </label>

          <label className="workshop-profile__consent">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => {
                if (!user) return;
                const accepted = event.target.checked;
                setTermsAccepted(accepted);
                window.localStorage.setItem(communityTermsKey(user.id), accepted ? '1' : '0');
                if (!accepted && publicEnabled) changePublication(false).catch((changeError) => {
                  console.warn('[workshop] publication change failed:', changeError);
                });
              }}
            />
            <span>
              <strong>コミュニティルールに同意する</strong>
              <small>
                暴言・差別・個人情報・連絡先を公開しません。詳しくは<Link href="/legal/terms">利用規約</Link>。
              </small>
            </span>
          </label>

          <label className="workshop-profile__consent">
            <input
              type="checkbox"
              checked={publicEnabled}
              disabled={!termsAccepted || cloudConsent.isLoading || setCloudConsent.isPending}
              onChange={(event) => {
                if (event.target.checked && !termsAccepted) {
                  setError('先にコミュニティルールへ同意してください。');
                  return;
                }
                changePublication(event.target.checked).catch((changeError) => {
                  console.warn('[workshop] publication change failed:', changeError);
                  setError('公開設定を変更できませんでした。もう一度お試しください。');
                });
              }}
            />
            <span>
              <strong>すれ違った相手へ公開する</strong>
              <small>名前・見た目・一言だけをプロフィールとして同期します。</small>
            </span>
          </label>

          {notice && <p className="workshop-profile__notice" role="status">{notice}</p>}
          {error && <p className="workshop-profile__error" role="alert">{error}</p>}

          <button
            type="button"
            className="paper-action paper-action--yellow"
            onClick={save}
            disabled={saveProfile.isPending}
            data-testid="save-workshop"
          >
            {saveProfile.isPending ? '保存しています…' : '見た目・名前・一言を保存'}
          </button>
        </section>
      </div>
    </main>
  );
}
