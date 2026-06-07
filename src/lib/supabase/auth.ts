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

  // 既存セッション (ローカルの localStorage から読む。getUser() と違い
  // ネットワーク往復が無く、BLE 受信ごとの fetch 経路でも安価)
  const { data: existing } = await sb.auth.getSession();
  if (existing?.session?.user?.id) {
    return existing.session.user.id;
  }

  // 新規 anonymous sign-in
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    // error 本体ではなく message のみ (トークン等の巻き込み回避)
    console.error('[supabase auth] signInAnonymously failed:', error.message);
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
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}
