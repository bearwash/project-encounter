import type { AppUser } from '@/features/auth/AuthProvider';
import { ble } from '@/lib/tauri/ble';
import { getDb } from '@/lib/db/client';
import { getSupabase } from '@/lib/supabase/client';
import { isTauri } from '@/lib/tauri/env';

const ACCOUNT_DELETE_URL = process.env.NEXT_PUBLIC_ACCOUNT_DELETE_URL?.trim();
const APP_STORAGE_PREFIX = 'project-encounter:';

export async function deleteAccountAndLocalData(user: AppUser): Promise<void> {
  if (!user.isTest) await deleteRemoteAccount();
  await eraseLocalAppData();
}

async function deleteRemoteAccount(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('アカウント接続が設定されていません。サポートへお問い合わせください。');
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('本人確認の有効期限が切れています。ログインし直してからお試しください。');
  }

  const endpoint = ACCOUNT_DELETE_URL
    || `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')}/functions/v1/delete-account`;
  if (!endpoint || endpoint.startsWith('undefined/')) {
    throw new Error('アカウント削除窓口が設定されていません。サポートへお問い合わせください。');
  }

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${data.session.access_token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `アカウントを削除できませんでした（${response.status}）。`);
  }
}

async function eraseLocalAppData(): Promise<void> {
  if (isTauri()) {
    await ble.walkStop().catch(() => undefined);
    await ble.stop().catch(() => undefined);
    const db = await getDb();
    await db.execute('DELETE FROM tower_dispatches');
    await db.execute('DELETE FROM encounter_logs');
    await db.execute('DELETE FROM users_cache');
    await db.execute('DELETE FROM dev_wallet_ledger');
    await db.execute('DELETE FROM content_reports');
    await db.execute('DELETE FROM blocked_users');
    await db.execute('DELETE FROM profile_sync_queue');
    await db.execute('DELETE FROM my_profile');
    await db.execute("DELETE FROM app_settings WHERE key NOT IN ('schema_version', 'cooldown_sec')");
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(APP_STORAGE_PREFIX) || key === 'project-encounter-supabase-auth') {
      window.localStorage.removeItem(key);
    }
  }
}
