import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import { ensureAuthUserId } from '@/lib/supabase/auth';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import {
  deleteMyProfile as supabaseDelete,
  upsertMyProfile as supabaseUpsert,
} from '@/lib/supabase/profiles';
import { isTauri, TauriUnavailableError } from '@/lib/tauri/env';
import type { MyProfile } from '@/types/profile';
import { validateProfile, type ProfileInput } from './validation';

const QUERY_KEY = ['profile'] as const;

async function fetchProfile(): Promise<MyProfile | null> {
  if (!isTauri()) return null;
  try {
    const db = await getDb();
    const rows = await db.select<MyProfile[]>(
      'SELECT user_id, display_name, avatar_code, message, updated_at FROM my_profile LIMIT 1',
    );
    return rows[0] ?? null;
  } catch (e) {
    console.error('[profile.fetch] failed:', e);
    throw asError(e);
  }
}

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  try {
    return new Error(JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
}

async function saveProfile(input: ProfileInput): Promise<MyProfile> {
  const errors = validateProfile(input);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join('\n'));
  }
  if (!isTauri()) throw new TauriUnavailableError();

  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const existing = await fetchProfile();

    // user_id の決定:
    //   1. すでに my_profile に保存済みなら、それを保持
    //   2. Supabase 設定済みなら auth.uid() を使う (= サーバーと一致)
    //   3. それ以外 (mock モード) は randomUUID で発行
    let userId = existing?.user_id;
    if (!userId) {
      if (isSupabaseEnabled()) {
        userId = (await ensureAuthUserId().catch(() => null)) ?? crypto.randomUUID();
      } else {
        userId = crypto.randomUUID();
      }
    }

    // ローカル先行 (spec §5.3 "ローカル先行")
    await db.execute(
      `INSERT INTO my_profile (user_id, display_name, avatar_code, message, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         avatar_code  = excluded.avatar_code,
         message      = excluded.message,
         updated_at   = excluded.updated_at`,
      [userId, input.display_name, input.avatar_code, input.message, now],
    );

    // Supabase upsert (失敗時は profile_sync_queue へキューイング)
    if (isSupabaseEnabled()) {
      try {
        await supabaseUpsert({
          user_id: userId,
          display_name: input.display_name,
          avatar_code: input.avatar_code,
          message: input.message,
        });
      } catch (e) {
        console.warn('[profile.save] supabase upsert failed, queueing:', e);
        await enqueueSyncPending(input, now);
      }
    }

    return {
      user_id: userId,
      display_name: input.display_name,
      avatar_code: input.avatar_code,
      message: input.message,
      updated_at: now,
    };
  } catch (e) {
    console.error('[profile.save] failed:', e);
    throw asError(e);
  }
}

// =============================================================
// オフライン送信キュー (spec §5.3 / §5.5)
// =============================================================

async function enqueueSyncPending(
  input: ProfileInput,
  enqueuedAt: number,
): Promise<void> {
  try {
    const db = await getDb();
    // 古いキューは捨てて、最新値だけ残す
    await db.execute('DELETE FROM profile_sync_queue');
    await db.execute(
      `INSERT INTO profile_sync_queue (display_name, avatar_code, message, enqueued_at)
       VALUES ($1, $2, $3, $4)`,
      [input.display_name, input.avatar_code, input.message, enqueuedAt],
    );
  } catch (e) {
    console.error('[profile.enqueue] failed:', e);
  }
}

/**
 * Online 復帰時に呼ぶ flush。最新のキューを 1 件だけ送って、成功したら DELETE。
 * spec §5.5 リトライ戦略の簡易版 (本格的な指数バックオフは Phase 2)。
 */
export async function flushProfileSyncQueue(): Promise<void> {
  if (!isTauri()) return;
  if (!isSupabaseEnabled()) return;
  try {
    const db = await getDb();
    const me = await fetchProfile();
    if (!me) return;
    const rows = await db.select<{
      queue_id: number;
      display_name: string;
      avatar_code: string;
      message: string;
    }[]>(
      'SELECT queue_id, display_name, avatar_code, message FROM profile_sync_queue ORDER BY queue_id DESC LIMIT 1',
    );
    if (rows.length === 0) return;
    const latest = rows[0]!;
    await supabaseUpsert({
      user_id: me.user_id,
      display_name: latest.display_name,
      avatar_code: latest.avatar_code,
      message: latest.message,
    });
    await db.execute('DELETE FROM profile_sync_queue');
  } catch (e) {
    console.warn('[profile.flush] failed (will retry):', e);
  }
}

export function useProfile() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProfile,
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveProfile,
    onSuccess: (saved) => {
      qc.setQueryData(QUERY_KEY, saved);
    },
  });
}

// =============================================================
// 退会・削除 (spec §5.8)
// =============================================================

async function resetProfile(): Promise<void> {
  if (!isTauri()) return;
  try {
    const db = await getDb();
    const existing = await fetchProfile();

    // Supabase 側の自分の行を削除 (失敗しても続行)
    if (existing && isSupabaseEnabled()) {
      try {
        await supabaseDelete(existing.user_id);
      } catch (e) {
        console.warn('[profile.reset] supabase delete failed:', e);
      }
    }

    // ローカル DB を初期化 (my_profile + sync queue + 同意フラグ)
    await db.execute('DELETE FROM my_profile');
    await db.execute('DELETE FROM profile_sync_queue');
    await db.execute(
      "DELETE FROM app_settings WHERE key = 'cloud_profile_consent_at'",
    );
  } catch (e) {
    console.error('[profile.reset] failed:', e);
    throw asError(e);
  }
}

export function useResetProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resetProfile,
    onSuccess: () => {
      qc.setQueryData(QUERY_KEY, null);
      qc.invalidateQueries({ queryKey: ['profile', 'cloud-consent'] });
    },
  });
}
