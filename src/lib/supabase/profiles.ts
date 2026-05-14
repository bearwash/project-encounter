/**
 * Supabase profiles テーブル操作。
 *
 * spec: docs/specs/profile-sync.md §5.1 / §5.3 / §5.4 / §5.8
 *
 * - PUT: 自プロフィール upsert (id = auth.uid())
 * - GET (single): 1 件取得 (encounter listener 用)
 * - GET (in): 一括取得 (foreground 復帰時)
 * - DELETE: 退会 (自分の行を削除)
 */
import { getSupabase } from './client';
import type { RemoteProfile } from '@/lib/tauri/profile';

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_code: string;
  message: string | null;
  updated_at?: string;
};

function rowToRemote(r: ProfileRow): RemoteProfile {
  return {
    user_id: r.id,
    display_name: r.display_name,
    avatar_code: r.avatar_code,
    message: r.message ?? '',
  };
}

/**
 * 自プロフィールを upsert する (id = auth.uid())。
 * 失敗時は throw (オフライン時のキューイングは呼び出し側)。
 * Supabase 未設定なら no-op。
 */
export async function upsertMyProfile(p: {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.from('profiles').upsert({
    id: p.user_id,
    display_name: p.display_name,
    avatar_code: p.avatar_code,
    message: p.message,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[supabase profiles] upsert failed:', error);
    throw error;
  }
}

/** 単一プロフィール取得 (encounter listener 用)。404 等は null。 */
export async function fetchProfile(
  userId: string,
): Promise<RemoteProfile | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('profiles')
    .select('id, display_name, avatar_code, message')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[supabase profiles] fetch failed:', error);
    return null;
  }
  if (!data) return null;
  return rowToRemote(data as ProfileRow);
}

/** 一括取得 (.in)。1 リクエスト最大 100 件、超過分はチャンク分割。 */
export async function fetchProfiles(
  userIds: string[],
): Promise<RemoteProfile[]> {
  const sb = getSupabase();
  if (!sb) return [];
  if (userIds.length === 0) return [];

  const CHUNK = 100;
  const out: RemoteProfile[] = [];
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from('profiles')
      .select('id, display_name, avatar_code, message')
      .in('id', slice);
    if (error) {
      console.warn('[supabase profiles] bulk fetch failed:', error);
      continue;
    }
    (data as ProfileRow[] | null)?.forEach((r) => out.push(rowToRemote(r)));
  }
  return out;
}

/** 退会: 自分の行を削除 (RLS で auth.uid() = id のみ削除可)。 */
export async function deleteMyProfile(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('profiles').delete().eq('id', userId);
  if (error) {
    console.error('[supabase profiles] delete failed:', error);
    throw error;
  }
}
