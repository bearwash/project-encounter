/**
 * Supabase 匿名 Auth のラッパ。
 *
 * spec: docs/specs/profile-sync.md §5.2
 *
 * - 初回起動 (同意済み後) に `signInAnonymously()` を呼んで UUID を発行
 * - 以降は localStorage の session を re-use
 * - Supabase 未設定 (mock モード) のときは何もせず null
 */
import { getSupabase } from './client';

/**
 * 現在の Auth UUID を取得。
 * - すでにサインイン済みならその UUID
 * - 未サインインなら anonymous でサインインして UUID を返す
 * - Supabase 未設定なら null
 */
export async function ensureAuthUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  // 既存セッション
  const { data: existing } = await sb.auth.getUser();
  if (existing?.user?.id) {
    return existing.user.id;
  }

  // 新規 anonymous sign-in
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.error('[supabase auth] signInAnonymously failed:', error);
    return null;
  }
  return data.user?.id ?? null;
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
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
