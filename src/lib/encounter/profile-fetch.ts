/**
 * BLE で受信した user_id のプロフィールを一括 fetch するスケジューラ。
 *
 * spec: docs/specs/profile-sync.md §5.4
 *
 * トリガ:
 *   - フォアグラウンド復帰 (即時 flush)
 *   - BLE 受信時 (最大 30 秒のデバウンス)
 *
 * 動作:
 *   1. encounter_logs を見て users_cache に未登録の user_id を抽出
 *   2. Supabase の `profiles` を `.in` で一括 fetch (最大 100 件チャンク)
 *      未設定環境では Rust mock を 1 件ずつフォールバック呼び出し
 *   3. 取得分を users_cache に UPSERT、encounter_logs を集計して encounter_count を反映
 *   4. 取れなかった user_id は users_cache に書かない (= 表示されない、§5.5)
 *
 * 通知: 完了したら caller (HomePage) に「変化があったよ」を伝える需要があるが、
 * react-query の invalidate は listener 側で行うので、ここはサイレント。
 */
import { getDb } from '@/lib/db/client';
import { isSupabaseEnabled } from '@/lib/supabase/client';
import { fetchProfiles as supabaseBulkFetch } from '@/lib/supabase/profiles';
import { isTauri } from '@/lib/tauri/env';
import { fetchRemoteProfile, type RemoteProfile } from '@/lib/tauri/profile';

const DEBOUNCE_MS = 30_000;
const RETRY_MS = [5_000, 30_000, 5 * 60_000, 30 * 60_000] as const;
const RETRY_ATTEMPT_KEY = 'profile_fetch_retry_attempt';
const RETRY_AFTER_KEY = 'profile_fetch_retry_after';

let pendingTimer: number | null = null;
let retryTimer: number | null = null;
let retryAttempt = 0;
let inflight: Promise<FetchResult> | null = null;
let latestOnDone: ((r: FetchResult) => void) | undefined;
let restoredRetry = false;

export type FetchResult = {
  fetchedCount: number;
  failedIds: string[];
};

/** 未取得 user_id を全て fetch して users_cache に反映する。 */
export async function flushPendingProfiles(): Promise<FetchResult> {
  if (inflight) return inflight;
  inflight = runFlush();
  try {
    const result = await inflight;
    await updateRetry(result, latestOnDone);
    return result;
  } finally {
    inflight = null;
  }
}

async function runFlush(): Promise<FetchResult> {
  if (!isTauri()) return { fetchedCount: 0, failedIds: [] };

  const db = await getDb();

  // 未取得 user_id 一覧 = encounter_logs にあるが users_cache に無いもの
  const pendingRows = await db.select<{ user_id: string }[]>(
    `SELECT DISTINCT l.encountered_user_id AS user_id
     FROM encounter_logs l
     WHERE l.encountered_user_id NOT IN (SELECT user_id FROM users_cache)`,
  );
  const pendingIds = pendingRows.map((r) => r.user_id);
  if (pendingIds.length === 0) return { fetchedCount: 0, failedIds: [] };

  // Supabase 設定済みなら一括 .in、それ以外は mock を 1 件ずつ
  let profiles: RemoteProfile[] = [];
  let failedIds: string[] = [];

  if (isSupabaseEnabled()) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { fetchedCount: 0, failedIds: pendingIds };
    }
    try {
      profiles = await supabaseBulkFetch(pendingIds);
      const got = new Set(profiles.map((p) => p.user_id));
      failedIds = pendingIds.filter((id) => !got.has(id));
    } catch (e) {
      console.warn('[profile-fetch] bulk fetch failed:', e);
      failedIds = pendingIds;
    }
  } else {
    // mock fallback (Rust)
    for (const id of pendingIds) {
      try {
        const p = await fetchRemoteProfile(id);
        if (p) profiles.push(p);
        else failedIds.push(id);
      } catch {
        failedIds.push(id);
      }
    }
  }

  if (profiles.length === 0) {
    return { fetchedCount: 0, failedIds };
  }

  // UPSERT + encounter_count 集計
  for (const p of profiles) {
    const agg = await db.select<{ cnt: number; min_at: number; max_at: number }[]>(
      `SELECT
         COUNT(*) AS cnt,
         MIN(encountered_at) AS min_at,
         MAX(encountered_at) AS max_at
       FROM encounter_logs WHERE encountered_user_id = $1`,
      [p.user_id],
    );
    const a = agg[0];
    const cnt = a?.cnt ?? 1;
    const minAt = a?.min_at ?? Math.floor(Date.now() / 1000);
    const maxAt = a?.max_at ?? Math.floor(Date.now() / 1000);

    await db.execute(
      `INSERT INTO users_cache
         (user_id, display_name, avatar_code, message, home_prefecture,
          encounter_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name     = excluded.display_name,
         avatar_code      = excluded.avatar_code,
         message          = excluded.message,
         home_prefecture  = excluded.home_prefecture,
         encounter_count  = excluded.encounter_count,
         first_seen_at    = MIN(users_cache.first_seen_at, excluded.first_seen_at),
         last_seen_at     = MAX(users_cache.last_seen_at, excluded.last_seen_at)`,
      [
        p.user_id,
        p.display_name,
        p.avatar_code,
        p.message,
        p.home_prefecture,
        cnt,
        minAt,
        maxAt,
      ],
    );
  }

  return { fetchedCount: profiles.length, failedIds };
}

/**
 * 「最大 30 秒のデバウンス」(spec §5.4.1)。
 * - 既にタイマーが立っているなら何もしない
 * - 1 回発火後、次の呼び出しまた 30 秒待つ
 */
export function scheduleProfileFetch(onDone?: (r: FetchResult) => void): void {
  latestOnDone = onDone;
  if (pendingTimer !== null) return;
  pendingTimer = window.setTimeout(async () => {
    pendingTimer = null;
    try {
      const r = await flushPendingProfiles();
      onDone?.(r);
    } catch (e) {
      console.warn('[profile-fetch] scheduled flush failed:', e);
      scheduleRetry(onDone);
    }
  }, DEBOUNCE_MS);
}

export async function restoreProfileFetchRetry(
  onDone?: (r: FetchResult) => void,
): Promise<void> {
  if (restoredRetry || !isTauri()) return;
  restoredRetry = true;
  latestOnDone = onDone;

  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    `SELECT key, value FROM app_settings
     WHERE key IN ($1, $2)`,
    [RETRY_ATTEMPT_KEY, RETRY_AFTER_KEY],
  );
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const retryAfter = Number(values.get(RETRY_AFTER_KEY));
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return;

  retryAttempt = Math.max(0, Number(values.get(RETRY_ATTEMPT_KEY)) || 0);
  scheduleRetry(onDone, Math.max(0, retryAfter * 1000 - Date.now()));
}

/** デバウンス中のタイマーをキャンセル (テスト用) */
export function cancelScheduledFetch(): void {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  resetRetry().catch(() => {});
}

async function updateRetry(
  result: FetchResult,
  onDone?: (r: FetchResult) => void,
): Promise<void> {
  if (result.failedIds.length === 0) {
    await resetRetry();
    return;
  }
  scheduleRetry(onDone);
}

function scheduleRetry(onDone?: (r: FetchResult) => void, delayMs?: number): void {
  if (retryTimer !== null) return;
  const delay = delayMs ?? RETRY_MS[Math.min(retryAttempt, RETRY_MS.length - 1)]!;
  const nextAttempt = delayMs === undefined ? retryAttempt + 1 : retryAttempt;
  persistRetryState(Math.floor((Date.now() + delay) / 1000), nextAttempt).catch(
    () => {},
  );
  retryAttempt = nextAttempt;
  retryTimer = window.setTimeout(async () => {
    retryTimer = null;
    try {
      const result = await flushPendingProfiles();
      onDone?.(result);
    } catch (e) {
      console.warn('[profile-fetch] retry failed:', e);
      scheduleRetry(onDone);
    }
  }, delay);
}

async function persistRetryState(retryAfterSec: number, attempt: number): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value)
     VALUES ($1, $2), ($3, $4)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [
      RETRY_AFTER_KEY,
      String(retryAfterSec),
      RETRY_ATTEMPT_KEY,
      String(attempt),
    ],
  );
}

async function clearRetryState(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(`DELETE FROM app_settings WHERE key IN ($1, $2)`, [
    RETRY_AFTER_KEY,
    RETRY_ATTEMPT_KEY,
  ]);
}

async function resetRetry(): Promise<void> {
  retryAttempt = 0;
  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  await clearRetryState();
}
