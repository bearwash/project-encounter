'use client';

/**
 * 初回起動時のクラウド公開同意ダイアログ。
 * spec: docs/specs/profile-sync.md §5.7
 *
 * - 同意して始める → `cloud_profile_consent_at` を記録 + 匿名 Auth でサインイン
 * - 今は始めない → 同意なし状態を維持 (BLE / Supabase オフ)
 *
 * 同意なしでもアプリ自体はクラッシュさせず最低限の UI を提供する (§7 受入基準)。
 * mock モード (Supabase 未設定) では「同意」を押しても anonymous sign-in は no-op。
 */
import { ensureAuthUserId } from '@/lib/supabase/auth';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import { useSetCloudConsent } from './consent';

type Props = {
  onDecided: () => void;
};

export function CloudConsentDialog({ onDecided }: Props) {
  const setConsent = useSetCloudConsent();

  const handleAgree = async () => {
    await setConsent.mutateAsync('granted');
    if (isSupabaseEnabled()) {
      // 匿名 Auth で UUID を発行 (失敗してもダイアログは閉じる、
      // §5.9 再認証は別フェーズで)
      await ensureAuthUserId().catch((e) =>
        console.warn('[consent] sign-in skipped:', e),
      );
    }
    onDecided();
  };

  const handleDecline = async () => {
    // declined を永続化 (= 次回起動時に再提示しない)
    await setConsent.mutateAsync('declined');
    onDecided();
  };

  return (
    <div
      className="game-screen fixed inset-0 z-[60] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      data-testid="cloud-consent-dialog"
    >
      <div className="game-panel animate-bounce-in flex max-w-md flex-col gap-4 rounded-[28px] px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-pop-blue/15 px-3 py-1 text-[10px] font-black tracking-[0.24em] text-pop-blue">
            FIRST SETUP
          </span>
          <span className="h-2 w-2 rounded-full bg-pop-green shadow-[0_0_14px_rgba(118,194,91,0.8)]" />
        </div>
        <h2
          id="consent-title"
          className="text-2xl font-black tracking-wider text-pop-red drop-shadow-sm"
        >
          プロフィールを公開しますか?
        </h2>

        <p className="text-sm leading-relaxed text-ink">
          あなたの<strong className="text-pop-red">名前・アバター・一言メッセージ</strong>
          がサーバーに保存され、すれちがった相手のアプリに表示されます。
        </p>

        <ul className="game-hud flex flex-col gap-2 rounded-[18px] px-3 py-3 text-xs leading-relaxed text-ink-soft">
          <li>
            <span className="font-black text-pop-green">✓</span>
            <span className="ml-2">
              「誰といつ会ったか」はあなたの端末だけに残り、サーバーに送られません
            </span>
          </li>
          <li>
            <span className="font-black text-pop-green">✓</span>
            <span className="ml-2">位置情報 (GPS) は一切取得しません</span>
          </li>
          <li>
            <span className="font-black text-pop-green">✓</span>
            <span className="ml-2">あとから退会することもできます</span>
          </li>
        </ul>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleAgree}
            disabled={setConsent.isPending}
            data-testid="consent-agree"
            className="game-button game-button-danger rounded-full px-5 py-3 font-black tracking-wider disabled:opacity-50"
          >
            同意してはじめる
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={setConsent.isPending}
            data-testid="consent-decline"
            className="game-chip rounded-full px-5 py-2.5 text-sm font-black tracking-wider text-ink-soft transition active:translate-y-[2px] disabled:opacity-50"
          >
            いまは始めない
          </button>
        </div>

        {!isSupabaseEnabled() && (
          <p className="rounded-[16px] bg-ink/5 px-3 py-2 text-[10px] leading-relaxed text-ink-muted">
            DEV: Supabase 未設定なのでローカルのみで動作します
            (`.env.local` に NEXT_PUBLIC_SUPABASE_URL / ANON_KEY を設定すると有効化)
          </p>
        )}
      </div>
    </div>
  );
}
