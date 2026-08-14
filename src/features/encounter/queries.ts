import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import {
  readLastSessionOpenedAt,
  startOfToday,
  writeSessionOpenedNow,
} from '@/lib/encounter/session-stats';
import { isTauri, TauriUnavailableError } from '@/lib/tauri/env';
import type { HistoryItem, UnreadEncounter } from '@/types/encounter';

const UNREAD_KEY = ['encounters', 'unread'] as const;
const HISTORY_KEY = ['encounters', 'history'] as const;
const TODAY_COUNT_KEY = ['encounters', 'todayCount'] as const;
const LAST_OPENED_KEY = ['encounters', 'lastOpened'] as const;

function asError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  try {
    return new Error(JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
}

// =============================================================
// 未読エンカウント (spec: encounter-popup.md)
// =============================================================

type UnreadRow = {
  log_id: number;
  encountered_at: number;
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  home_prefecture: string | null;
  encounter_count: number;
  first_seen_at: number;
  last_seen_at: number;
};

async function fetchUnread(): Promise<UnreadEncounter[]> {
  if (!isTauri()) return [];
  try {
    const db = await getDb();
    const rows = await db.select<UnreadRow[]>(
      `SELECT
         l.log_id,
         l.encountered_at,
         u.user_id,
         u.display_name,
         u.avatar_code,
         u.message,
         u.home_prefecture,
         u.encounter_count,
         u.first_seen_at,
         u.last_seen_at
       FROM encounter_logs l
       JOIN users_cache u ON u.user_id = l.encountered_user_id
       WHERE l.is_read = 0
         AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = u.user_id)
       ORDER BY l.encountered_at ASC`,
    );

    return rows.map((r) => ({
      log_id: r.log_id,
      encountered_at: r.encountered_at,
      user: {
        user_id: r.user_id,
        display_name: r.display_name,
        avatar_code: r.avatar_code,
        message: r.message,
        home_prefecture: r.home_prefecture,
        encounter_count: r.encounter_count,
        first_seen_at: r.first_seen_at,
        last_seen_at: r.last_seen_at,
      },
    }));
  } catch (e) {
    console.error('[encounter.unread] failed:', e);
    throw asError(e);
  }
}

async function markRead(logId: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const db = await getDb();
    await db.execute('UPDATE encounter_logs SET is_read = 1 WHERE log_id = $1', [
      logId,
    ]);
  } catch (e) {
    console.error('[encounter.markRead] failed:', e);
    throw asError(e);
  }
}

export function useUnreadEncounters() {
  return useQuery({ queryKey: UNREAD_KEY, queryFn: fetchUnread });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_COUNT_KEY });
    },
  });
}

// =============================================================
// 履歴 (spec: encounter-list.md)
// =============================================================

async function fetchHistory(): Promise<HistoryItem[]> {
  if (!isTauri()) return [];
  try {
    const db = await getDb();
    const rows = await db.select<HistoryItem[]>(
      `SELECT
         user_id,
         display_name,
         avatar_code,
         message,
         home_prefecture,
         encounter_count,
         first_seen_at,
         last_seen_at,
         last_seen_at AS last_encountered_at
       FROM users_cache
       WHERE NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = users_cache.user_id)
       ORDER BY last_seen_at DESC`,
    );
    return rows;
  } catch (e) {
    console.error('[encounter.history] failed:', e);
    throw asError(e);
  }
}

export function useEncounterHistory() {
  return useQuery({ queryKey: HISTORY_KEY, queryFn: fetchHistory });
}

// =============================================================
// 「きょう N 回」「N 日ぶり」カウンタ
//   spec: docs/specs/walk-mode.md §4.2 / docs/specs/encounter-popup.md §4.3
// =============================================================

async function fetchTodayEncounterCount(): Promise<number> {
  if (!isTauri()) return 0;
  try {
    const db = await getDb();
    const sinceSec = startOfToday();
    const rows = await db.select<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM encounter_logs WHERE encountered_at >= $1',
      [sinceSec],
    );
    return rows[0]?.n ?? 0;
  } catch (e) {
    console.error('[encounter.todayCount] failed:', e);
    return 0;
  }
}

/**
 * 当日 0 時以降の `encounter_logs` 件数。ウォークモード画面で「きょう N 回」表示に使う。
 * 30 秒ごとに自動再取得し、`useEncounterListener` の `invalidateQueries`
 * (TODAY_COUNT_KEY) でも更新される。
 */
export function useTodayEncounterCount() {
  return useQuery({
    queryKey: TODAY_COUNT_KEY,
    queryFn: fetchTodayEncounterCount,
    refetchInterval: 30_000,
  });
}

/**
 * 起動時の「前回開いた時刻」を 1 回だけ読み、その後すぐに現在時刻で上書きする。
 * 返り値は **前回値** (= 「N 日ぶり」表示に使う基準点)。初回起動は null。
 *
 * 呼び出し側 (`HomePage`) は同意済みかつフォアグラウンドのときに 1 度だけ走らせる。
 * Tauri 不在なら何もせず null を返す。
 */
export function useLastSessionOpened() {
  return useQuery({
    queryKey: LAST_OPENED_KEY,
    queryFn: async () => {
      if (!isTauri()) return null;
      try {
        const prev = await readLastSessionOpenedAt();
        await writeSessionOpenedNow();
        return prev;
      } catch (e) {
        console.error('[encounter.lastOpened] failed:', e);
        return null;
      }
    },
    // セッション中は再評価しない (起動 = 1 セッション)
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

// =============================================================
// 開発用: 擬似エンカウント投入 / 全クリア
//   実機 BLE が来るまでの UX 検証用。
//   spec: ble-handshake.md と同等のデータ形を擬似生成する。
// =============================================================

const SAMPLE_NAMES = ['Neko-9', 'Riku', 'sora', 'Pixel.42', 'mion', 'zoo', 'Hex'];
// avatar.md §3.2: b{NN}_h{NN}_o{NN}_f{NN}
const SAMPLE_AVATARS = [
  'b01_h01_o01_f01',
  'b02_h03_o02_f02',
  'b01_h04_o04_f04',
  'b03_h02_o03_f03',
  'b04_h03_o01_f01',
  'b02_h01_o04_f04',
];
const SAMPLE_MESSAGES = [
  '最近はRust勉強中！',
  'こんにちは',
  '散歩中',
  '',
  '今日は寒い',
  'すれ違いテスト',
];
// 日本地図ビュー検証のため複数の地域から拾う (seed のみ。本番では Supabase から来る)
const SAMPLE_PREFS = [
  '01', // 北海道
  '13', // 東京
  '14', // 神奈川
  '23', // 愛知
  '27', // 大阪
  '34', // 広島
  '40', // 福岡
  '47', // 沖縄
  null, // 未設定の人も混ぜる
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

async function seedOneEncounter(): Promise<void> {
  if (!isTauri()) throw new TauriUnavailableError();
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const userId = crypto.randomUUID();
    const name = pick(SAMPLE_NAMES);
    const avatar = pick(SAMPLE_AVATARS);
    const message = pick(SAMPLE_MESSAGES);
    const pref = pick(SAMPLE_PREFS);

    await db.execute(
      `INSERT INTO users_cache
         (user_id, display_name, avatar_code, message, home_prefecture,
          encounter_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6)`,
      [userId, name, avatar, message, pref, now],
    );

    await db.execute(
      `INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
       VALUES ($1, $2, 0)`,
      [userId, now],
    );
  } catch (e) {
    console.error('[encounter.seed] failed:', e);
    throw asError(e);
  }
}

async function clearAllEncounters(): Promise<void> {
  if (!isTauri()) return;
  try {
    const db = await getDb();
    // FK ON DELETE CASCADE が効くように encounter_logs を先に
    await db.execute('DELETE FROM encounter_logs');
    await db.execute('DELETE FROM users_cache');
  } catch (e) {
    console.error('[encounter.clear] failed:', e);
    throw asError(e);
  }
}

export function useSeedEncounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: seedOneEncounter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_COUNT_KEY });
    },
  });
}

export function useClearEncounters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearAllEncounters,
    onSuccess: () => {
      qc.setQueryData(UNREAD_KEY, []);
      qc.setQueryData(HISTORY_KEY, []);
      qc.setQueryData(TODAY_COUNT_KEY, 0);
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_COUNT_KEY });
    },
  });
}
