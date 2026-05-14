// 契約: docs/contracts/tauri-commands.md (profile.fetch_remote)
//
// Supabase 連携の代用 mock。Rust 側で user_id をシードに決定論的な
// プロフィールを返す。Phase 2 で Supabase REST に置き換える。

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './env';

export type RemoteProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
};

/**
 * 「Supabase の profiles テーブルから取得」相当の操作。
 * 現状は mock 実装。Tauri 外では `null`。
 */
export async function fetchRemoteProfile(
  userId: string,
): Promise<RemoteProfile | null> {
  if (!isTauri()) return null;
  return invoke<RemoteProfile | null>('profile_fetch_remote', { userId });
}
