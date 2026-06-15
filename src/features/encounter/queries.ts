import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import {
  readLastSessionOpenedAt,
  startOfToday,
  writeSessionOpenedNow,
} from '@/lib/encounter/session-stats';
import { isTauri } from '@/lib/tauri/env';
import type { HistoryItem, UnreadEncounter } from '@/types/encounter';

const UNREAD_KEY = ['encounters', 'unread'] as const;
const HISTORY_KEY = ['encounters', 'history'] as const;
const TODAY_COUNT_KEY = ['encounters', 'todayCount'] as const;
const LAST_OPENED_KEY = ['encounters', 'lastOpened'] as const;
const WEB_ENCOUNTERS_KEY = 'project_encounter.encounters';
const WEB_LAST_OPENED_KEY = 'project_encounter.last_session_opened_at';

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

type WebEncounterRecord = UnreadEncounter & {
  is_read: boolean;
};

async function fetchUnread(): Promise<UnreadEncounter[]> {
  if (!isTauri()) {
    const records = readWebEncounters();
    const aggregates = aggregateWebEncounters(records);
    return records
      .filter((item) => !item.is_read)
      .map((item) => toUnreadEncounter(item, aggregates))
      .sort((a, b) => a.encountered_at - b.encountered_at);
  }
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
         a.encounter_count,
         a.first_seen_at,
         a.last_seen_at
       FROM encounter_logs l
       JOIN users_cache u ON u.user_id = l.encountered_user_id
       JOIN (
         SELECT
           encountered_user_id AS user_id,
           COUNT(*) AS encounter_count,
           MIN(encountered_at) AS first_seen_at,
           MAX(encountered_at) AS last_seen_at
         FROM encounter_logs
         GROUP BY encountered_user_id
       ) a ON a.user_id = u.user_id
       WHERE l.is_read = 0
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
  if (!isTauri()) {
    writeWebEncounters(
      readWebEncounters().map((item) =>
        item.log_id === logId ? { ...item, is_read: true } : item,
      ),
    );
    return;
  }
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
  if (!isTauri()) {
    return Array.from(aggregateWebEncounters(readWebEncounters()).values()).sort(
      (a, b) => b.last_encountered_at - a.last_encountered_at,
    );
  }
  try {
    const db = await getDb();
    const rows = await db.select<HistoryItem[]>(
      `SELECT
         u.user_id,
         u.display_name,
         u.avatar_code,
         u.message,
         u.home_prefecture,
         COALESCE(a.encounter_count, u.encounter_count) AS encounter_count,
         COALESCE(a.first_seen_at, u.first_seen_at) AS first_seen_at,
         COALESCE(a.last_seen_at, u.last_seen_at) AS last_seen_at,
         COALESCE(a.last_seen_at, u.last_seen_at) AS last_encountered_at
       FROM users_cache u
       LEFT JOIN (
         SELECT
           encountered_user_id AS user_id,
           COUNT(*) AS encounter_count,
           MIN(encountered_at) AS first_seen_at,
           MAX(encountered_at) AS last_seen_at
         FROM encounter_logs
         GROUP BY encountered_user_id
       ) a ON a.user_id = u.user_id
       ORDER BY COALESCE(a.last_seen_at, u.last_seen_at) DESC`,
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
  if (!isTauri()) {
    const sinceSec = startOfToday();
    return readWebEncounters().filter((item) => item.encountered_at >= sinceSec)
      .length;
  }
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
      if (!isTauri()) return readAndWriteWebLastOpened();
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
  if (!isTauri()) {
    seedOneWebEncounter();
    return;
  }
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
  if (!isTauri()) {
    writeWebEncounters([]);
    return;
  }
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

function readWebEncounters(): WebEncounterRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WEB_ENCOUNTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(WEB_ENCOUNTERS_KEY);
      return [];
    }
    return parsed.filter(isWebEncounterRecord);
  } catch (e) {
    console.error('[encounter.web.read] failed:', e);
    window.localStorage.removeItem(WEB_ENCOUNTERS_KEY);
    return [];
  }
}

function writeWebEncounters(records: WebEncounterRecord[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WEB_ENCOUNTERS_KEY, JSON.stringify(records));
}

function seedOneWebEncounter(): void {
  const now = Math.floor(Date.now() / 1000);
  const records = readWebEncounters();
  const userId = crypto.randomUUID();
  const nextLogId =
    records.reduce((max, item) => Math.max(max, item.log_id), 0) + 1;
  records.push({
    log_id: nextLogId,
    encountered_at: now,
    is_read: false,
    user: {
      user_id: userId,
      display_name: pick(SAMPLE_NAMES),
      avatar_code: pick(SAMPLE_AVATARS),
      message: pick(SAMPLE_MESSAGES),
      home_prefecture: pick(SAMPLE_PREFS),
      encounter_count: 1,
      first_seen_at: now,
      last_seen_at: now,
    },
  });
  writeWebEncounters(records);
}

function readAndWriteWebLastOpened(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(WEB_LAST_OPENED_KEY);
  const prev = raw === null ? null : Number(raw);
  window.localStorage.setItem(
    WEB_LAST_OPENED_KEY,
    String(Math.floor(Date.now() / 1000)),
  );
  return typeof prev === 'number' && Number.isFinite(prev) && prev > 0
    ? prev
    : null;
}

function toUnreadEncounter(
  record: WebEncounterRecord,
  aggregates: Map<string, HistoryItem>,
): UnreadEncounter {
  const aggregate = aggregates.get(record.user.user_id);
  return {
    log_id: record.log_id,
    encountered_at: record.encountered_at,
    user: aggregate
      ? {
          user_id: aggregate.user_id,
          display_name: aggregate.display_name,
          avatar_code: aggregate.avatar_code,
          message: aggregate.message,
          home_prefecture: aggregate.home_prefecture,
          encounter_count: aggregate.encounter_count,
          first_seen_at: aggregate.first_seen_at,
          last_seen_at: aggregate.last_seen_at,
        }
      : record.user,
  };
}

function aggregateWebEncounters(records: WebEncounterRecord[]): Map<string, HistoryItem> {
  const byUserId = new Map<string, HistoryItem>();
  for (const record of records) {
    const existing = byUserId.get(record.user.user_id);
    if (!existing) {
      byUserId.set(record.user.user_id, {
        ...record.user,
        encounter_count: 1,
        first_seen_at: record.encountered_at,
        last_seen_at: record.encountered_at,
        last_encountered_at: record.encountered_at,
      });
      continue;
    }
    const firstSeenAt = Math.min(existing.first_seen_at, record.encountered_at);
    const lastSeenAt = Math.max(existing.last_seen_at, record.encountered_at);
    byUserId.set(record.user.user_id, {
      ...existing,
      ...record.user,
      encounter_count: existing.encounter_count + 1,
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      last_encountered_at: lastSeenAt,
    });
  }
  return byUserId;
}

function isWebEncounterRecord(value: unknown): value is WebEncounterRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<WebEncounterRecord>;
  const user = item.user;
  return (
    typeof item.log_id === 'number' &&
    typeof item.encountered_at === 'number' &&
    typeof item.is_read === 'boolean' &&
    typeof user === 'object' &&
    user !== null &&
    typeof user.user_id === 'string' &&
    typeof user.display_name === 'string' &&
    typeof user.avatar_code === 'string' &&
    typeof user.message === 'string' &&
    (typeof user.home_prefecture === 'string' || user.home_prefecture === null) &&
    typeof user.encounter_count === 'number' &&
    typeof user.first_seen_at === 'number' &&
    typeof user.last_seen_at === 'number'
  );
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
