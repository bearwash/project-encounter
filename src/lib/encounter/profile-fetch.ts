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

let pendingTimer: number | null = null;
let inflight: Promise<FetchResult> | null = null;

export type FetchResult = {
  fetchedCount: number;
  failedIds: string[];
};

/** 未取得 user_id を全て fetch して users_cache に反映する。 */
export async function flushPendingProfiles(): Promise<FetchResult> {
  if (inflight) return inflight;
  inflight = runFlush();
  try {
    return await inflight;
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
         (user_id, display_name, avatar_code, message, encounter_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name    = excluded.display_name,
         avatar_code     = excluded.avatar_code,
         message         = excluded.message,
         encounter_count = excluded.encounter_count,
         first_seen_at   = MIN(users_cache.first_seen_at, excluded.first_seen_at),
         last_seen_at    = MAX(users_cache.last_seen_at, excluded.last_seen_at)`,
      [p.user_id, p.display_name, p.avatar_code, p.message, cnt, minAt, maxAt],
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
  if (pendingTimer !== null) return;
  pendingTimer = window.setTimeout(async () => {
    pendingTimer = null;
    try {
      const r = await flushPendingProfiles();
      onDone?.(r);
    } catch (e) {
      console.warn('[profile-fetch] scheduled flush failed:', e);
    }
  }, DEBOUNCE_MS);
}

/** デバウンス中のタイマーをキャンセル (テスト用) */
export function cancelScheduledFetch(): void {
  if (pendingTimer !== null) {
    window.clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}
