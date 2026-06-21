/**
 * クラウド公開同意 (cloud_profile_consent_at) の取得・保存・撤回。
 * spec: docs/specs/profile-sync.md §5.7
 *
 * 状態は 3 値:
 *   - `pending`  : app_settings に行なし (= 初回起動、未提示)
 *   - `granted`  : 値が Unix sec (> 0)
 *   - `declined` : 値が '0' (= 明示的に断った、再提示しない)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import { isTauri } from '@/lib/tauri/env';

const KEY = ['profile', 'cloud-consent'] as const;
const SETTING_KEY = 'cloud_profile_consent_at';

export type ConsentStatus = 'pending' | 'granted' | 'declined';

export type ConsentState = {
  status: ConsentStatus;
  consentedAt: number | null;
};

async function fetchConsent(): Promise<ConsentState> {
  // ブラウザ単体 (pnpm dev) では SQLite がないため常に granted 扱いにして UI を確認できるようにする。
  // 実際の同意保存は Tauri 上でのみ行われる。
  if (!isTauri()) return { status: 'granted', consentedAt: null };
  try {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
      'SELECT value FROM app_settings WHERE key = $1',
      [SETTING_KEY],
    );
    if (rows.length === 0) return { status: 'pending', consentedAt: null };
    const n = Number(rows[0]!.value);
    if (!Number.isFinite(n) || n <= 0) {
      return { status: 'declined', consentedAt: null };
    }
    return { status: 'granted', consentedAt: n };
  } catch (e) {
    console.error('[consent] fetch failed:', e);
    return { status: 'pending', consentedAt: null };
  }
}

async function setConsent(status: ConsentStatus): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  if (status === 'pending') {
    // 撤回 (退会時)
    await db.execute('DELETE FROM app_settings WHERE key = $1', [SETTING_KEY]);
    return;
  }
  const value = status === 'granted' ? String(Math.floor(Date.now() / 1000)) : '0';
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [SETTING_KEY, value],
  );
}

/**
 * 非フック経路 (saveProfile / flush 等) から同意状態を確認するためのヘルパ。
 * spec §5.7: 同意 (granted) なしに Supabase へは一切送信しない。
 */
export async function getCloudConsentStatus(): Promise<ConsentStatus> {
  return (await fetchConsent()).status;
}

export function useCloudConsent() {
  return useQuery({ queryKey: KEY, queryFn: fetchConsent });
}

export function useSetCloudConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: setConsent,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
