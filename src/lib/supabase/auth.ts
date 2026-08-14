/**
 * Supabase 明示ログインセッションのラッパ。
 *
 * spec: docs/specs/profile-sync.md §5.2
 *
 * - AuthProvider の Apple / Google / Email ログインで発行された UUID を使う
 * - 未ログインなら新しいセッションを勝手に作らない
 * - Supabase 未設定 (mock モード) のときは何もせず null
 */
import { getSupabase } from './client';

/**
 * 現在の Auth UUID を取得。
 * - すでにサインイン済みならその UUID
 * - 未サインインまたは旧 anonymous session なら null
 * - Supabase 未設定なら null
 */
export async function ensureAuthUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // 既存セッション (ローカルの localStorage から読む。getUser() と違い
  // ネットワーク往復が無く、BLE 受信ごとの fetch 経路でも安価)
  const { data: existing } = await sb.auth.getSession();
  if (existing?.session?.user?.id && !existing.session.user.is_anonymous) {
    return existing.session.user.id;
  }
  return null;
}

/** ログアウト + ローカルセッションクリア。退会時に呼ぶ。 */
export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut().catch(() => {});
}

/** 現在認証済みかどうかを synchronous に判定したいとき用 */
export async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}
