// 他ユーザーの公開プロフィール取得。
//
// 優先順:
//   1. Supabase 設定済み (URL / ANON_KEY) かつサインイン済み → Supabase の
//      `profiles` テーブルから取得 (= 本物の Phase 1 動作)
//   2. それ以外 → Rust 側の mock resolver (Tauri 内部のみ)
//
// spec: docs/specs/profile-sync.md §5.4

import { invoke } from '@tauri-apps/api/core';
import { getCurrentUserId } from '@/lib/supabase/auth';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import { fetchProfile as supabaseFetch } from '@/lib/supabase/profiles';
import { isTauri } from './env';

export type RemoteProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  /** ISO 3166-2:JP 下 2 桁 ("01"〜"47") or null=未設定。spec: regional-map.md */
  home_prefecture: string | null;
};

export async function fetchRemoteProfile(
  userId: string,
): Promise<RemoteProfile | null> {
  // 1. Supabase が使えるなら本物のサーバから fetch
  if (isSupabaseEnabled()) {
    const me = await getCurrentUserId().catch(() => null);
    if (me) {
      return supabaseFetch(userId);
    }
    // Supabase 設定はあるがサインイン未了 → 何もせず null
    // (同意ダイアログ後に再 BLE で再 fetch されるはず)
    return null;
  }

  // 2. Rust mock fallback (デバッグ用)
  if (!isTauri()) return null;
  return invoke<RemoteProfile | null>('profile_fetch_remote', { userId });
}
