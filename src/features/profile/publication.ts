import { deleteMyProfile } from '@/lib/supabase/profiles';

const PENDING_WITHDRAWAL_KEY = 'project-encounter:profile-publication-withdrawal:v1';

/** 公開撤回を端末へ先に記録し、クラウド行を削除する。失敗時は次回ログインで再送する。 */
export async function withdrawPublicProfile(userId: string): Promise<void> {
  window.localStorage.setItem(PENDING_WITHDRAWAL_KEY, userId);
  await deleteMyProfile(userId);
  clearPendingPublicationWithdrawal(userId);
}

/** 再公開を選んだ場合、古い削除保留が新しいプロフィールを消さないよう取り消す。 */
export function cancelPendingPublicationWithdrawal(userId: string): void {
  clearPendingPublicationWithdrawal(userId);
}

/** Auth session 復元時に、オフライン中の公開撤回を冪等に再送する。 */
export async function flushPendingPublicationWithdrawal(userId: string): Promise<void> {
  if (window.localStorage.getItem(PENDING_WITHDRAWAL_KEY) !== userId) return;
  await deleteMyProfile(userId);
  clearPendingPublicationWithdrawal(userId);
}

function clearPendingPublicationWithdrawal(userId: string): void {
  if (window.localStorage.getItem(PENDING_WITHDRAWAL_KEY) === userId) {
    window.localStorage.removeItem(PENDING_WITHDRAWAL_KEY);
  }
}
