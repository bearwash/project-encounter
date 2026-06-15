import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import { ensureAuthUserId, signOut } from '@/lib/supabase/auth';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import {
  deleteMyProfile as supabaseDelete,
  upsertMyProfile as supabaseUpsert,
} from '@/lib/supabase/profiles';
import { isTauri } from '@/lib/tauri/env';
import { showToast } from '@/lib/ui/toast';
import type { MyProfile } from '@/types/profile';
import { getCloudConsentStatus, resetCloudConsent } from './consent';
import { validateProfile, type ProfileInput } from './validation';

/**
 * クラウド送信して良いか = Supabase 設定済み かつ 明示同意 (granted)。
 * spec §5.7 / 要件 §6: 同意なしには Supabase を一切起動しない。
 */
async function canSyncToCloud(): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;
  return (await getCloudConsentStatus()) === 'granted';
}

const QUERY_KEY = ['profile'] as const;
const WEB_PROFILE_KEY = 'project_encounter.my_profile';

async function fetchProfile(): Promise<MyProfile | null> {
  if (!isTauri()) return fetchWebProfile();
  try {
    const db = await getDb();
    const rows = await db.select<MyProfile[]>(
      'SELECT user_id, display_name, avatar_code, message, home_prefecture, updated_at FROM my_profile LIMIT 1',
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

function fetchWebProfile(): MyProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WEB_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MyProfile>;
    if (
      typeof parsed.user_id !== 'string' ||
      typeof parsed.display_name !== 'string' ||
      typeof parsed.avatar_code !== 'string' ||
      typeof parsed.message !== 'string' ||
      typeof parsed.updated_at !== 'number'
    ) {
      window.localStorage.removeItem(WEB_PROFILE_KEY);
      return null;
    }
    return {
      user_id: parsed.user_id,
      display_name: parsed.display_name,
      avatar_code: parsed.avatar_code,
      message: parsed.message,
      home_prefecture:
        typeof parsed.home_prefecture === 'string' ? parsed.home_prefecture : null,
      updated_at: parsed.updated_at,
    };
  } catch (e) {
    console.error('[profile.fetch.browser] failed:', e);
    window.localStorage.removeItem(WEB_PROFILE_KEY);
    return null;
  }
}

async function saveWebProfile(input: ProfileInput): Promise<MyProfile> {
  const existing = fetchWebProfile();
  const syncToCloud = await canSyncToCloud();
  let userId = existing?.user_id;
  if (!userId) {
    userId = syncToCloud
      ? (await ensureAuthUserId().catch(() => null)) ?? createWebUserId()
      : createWebUserId();
  }

  const saved: MyProfile = {
    user_id: userId,
    display_name: input.display_name,
    avatar_code: input.avatar_code,
    message: input.message,
    home_prefecture: input.home_prefecture,
    updated_at: Math.floor(Date.now() / 1000),
  };

  window.localStorage.setItem(WEB_PROFILE_KEY, JSON.stringify(saved));

  if (syncToCloud) {
    try {
      await supabaseUpsert({
        user_id: userId,
        display_name: input.display_name,
        avatar_code: input.avatar_code,
        message: input.message,
        home_prefecture: input.home_prefecture,
      });
    } catch (e) {
      console.warn('[profile.save.browser] supabase upsert failed:', e);
      showToast('オフラインのため、プロフィールを送信できません', 'warn');
    }
  }

  return saved;
}

function createWebUserId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random()}`;
}

async function saveProfile(rawInput: ProfileInput): Promise<MyProfile> {
  // 保存前に前後空白を除去 (検証も保存もトリム後の値で行う)
  const input: ProfileInput = {
    ...rawInput,
    display_name: rawInput.display_name.trim(),
    message: rawInput.message.trim(),
  };
  const errors = validateProfile(input);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join('\n'));
  }
  if (!isTauri()) return saveWebProfile(input);

  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const existing = await fetchProfile();
    // 同意 (granted) がなければ Supabase は一切起動しない (要件 §6 / spec §5.7)
    const syncToCloud = await canSyncToCloud();

    // user_id の決定:
    //   1. すでに my_profile に保存済みなら、それを保持
    //   2. クラウド同期可 (設定済み + 同意済み) なら auth.uid() を使う (= サーバーと一致)
    //   3. それ以外 (mock / 未同意) は randomUUID で発行 (ローカルのみ)
    let userId = existing?.user_id;
    if (!userId) {
      if (syncToCloud) {
        userId = (await ensureAuthUserId().catch(() => null)) ?? crypto.randomUUID();
      } else {
        userId = crypto.randomUUID();
      }
    }

    // ローカル先行 (spec §5.3 "ローカル先行")
    await db.execute(
      `INSERT INTO my_profile (user_id, display_name, avatar_code, message, home_prefecture, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name    = excluded.display_name,
         avatar_code     = excluded.avatar_code,
         message         = excluded.message,
         home_prefecture = excluded.home_prefecture,
         updated_at      = excluded.updated_at`,
      [
        userId,
        input.display_name,
        input.avatar_code,
        input.message,
        input.home_prefecture,
        now,
      ],
    );

    // Supabase upsert (失敗時は profile_sync_queue へキューイング)。
    // 同意がなければ送信もキューイングもしない (ローカル保存のみ)。
    if (syncToCloud) {
      try {
        await supabaseUpsert({
          user_id: userId,
          display_name: input.display_name,
          avatar_code: input.avatar_code,
          message: input.message,
          home_prefecture: input.home_prefecture,
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
      home_prefecture: input.home_prefecture,
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
      `INSERT INTO profile_sync_queue (display_name, avatar_code, message, home_prefecture, enqueued_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.display_name,
        input.avatar_code,
        input.message,
        input.home_prefecture,
        enqueuedAt,
      ],
    );
  } catch (e) {
    console.error('[profile.enqueue] failed:', e);
  }
}

/**
 * Online 復帰時に呼ぶ flush。最新のキューを 1 件送る。
 * spec §5.5 リトライ戦略: 5s → 30s → 5min → 30min (上限) の指数バックオフ。
 * 同時呼び出しは module-level の in-flight フラグで抑止。
 */
const RETRY_STEPS_MS = [5_000, 30_000, 5 * 60_000, 30 * 60_000];
let retryStep = 0;
let retryTimer: number | null = null;
let flushInflight = false;
let offlineToastShown = false;

export async function flushProfileSyncQueue(): Promise<void> {
  if (!isTauri()) return;
  // 同意 (granted) がなければ送信しない (要件 §6 / spec §5.7)
  if (!(await canSyncToCloud())) return;
  if (flushInflight) return;
  flushInflight = true;
  try {
    const db = await getDb();
    const me = await fetchProfile();
    if (!me) return;
    const rows = await db.select<{
      queue_id: number;
      display_name: string;
      avatar_code: string;
      message: string;
      home_prefecture: string | null;
    }[]>(
      'SELECT queue_id, display_name, avatar_code, message, home_prefecture FROM profile_sync_queue ORDER BY queue_id DESC LIMIT 1',
    );
    if (rows.length === 0) {
      // 何も送るものが無い = 成功扱いで backoff をリセット
      retryStep = 0;
      return;
    }
    const latest = rows[0]!;
    try {
      await supabaseUpsert({
        user_id: me.user_id,
        display_name: latest.display_name,
        avatar_code: latest.avatar_code,
        message: latest.message,
        home_prefecture: latest.home_prefecture,
      });
      // 送信した行 (および古い行) のみ削除。送信中に enqueue された
      // より新しい行 (queue_id > latest) は取りこぼさず次回 flush へ残す。
      await db.execute('DELETE FROM profile_sync_queue WHERE queue_id <= $1', [
        latest.queue_id,
      ]);
      retryStep = 0;
      offlineToastShown = false;
    } catch (e) {
      console.warn('[profile.flush] failed, will retry:', e);
      // 1 回だけ控えめなトースト (5 分間連発抑止は toast 側でも担保)
      if (!offlineToastShown) {
        showToast('オフラインのため、プロフィールを送信できません', 'warn');
        offlineToastShown = true;
      }
      // 指数バックオフでリトライ予約
      const delay = RETRY_STEPS_MS[Math.min(retryStep, RETRY_STEPS_MS.length - 1)]!;
      retryStep = Math.min(retryStep + 1, RETRY_STEPS_MS.length - 1);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        flushProfileSyncQueue().catch(() => {});
      }, delay);
    }
  } finally {
    flushInflight = false;
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
  if (!isTauri()) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(WEB_PROFILE_KEY);
    }
    await resetCloudConsent();
    if (isSupabaseEnabled()) {
      await signOut().catch((e) =>
        console.warn('[profile.reset.browser] sign-out failed:', asError(e).message),
      );
    }
    return;
  }
  try {
    const db = await getDb();
    const existing = await fetchProfile();

    // Supabase 側の自分の行を削除 (失敗しても続行)
    if (existing && isSupabaseEnabled()) {
      try {
        await supabaseDelete(existing.user_id);
      } catch (e) {
        console.warn('[profile.reset] supabase delete failed:', asError(e).message);
      }
      // session を破棄して localStorage の auth を消す。これをしないと
      // 次回保存で getSession() が同じ UUID を返し、退会した ID が復活する
      // (spec §5.8: 退会で user_id を失効させる)。
      await signOut().catch((e) =>
        console.warn('[profile.reset] sign-out failed:', asError(e).message),
      );
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
