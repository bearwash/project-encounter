import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDb } from '@/lib/db/client';
import type { HistoryItem, UnreadEncounter } from '@/types/encounter';

const UNREAD_KEY = ['encounters', 'unread'] as const;
const HISTORY_KEY = ['encounters', 'history'] as const;

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
  encounter_count: number;
  first_seen_at: number;
  last_seen_at: number;
};

async function fetchUnread(): Promise<UnreadEncounter[]> {
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
         u.encounter_count,
         u.first_seen_at,
         u.last_seen_at
       FROM encounter_logs l
       JOIN users_cache u ON u.user_id = l.encountered_user_id
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
    },
  });
}

// =============================================================
// 履歴 (spec: encounter-list.md)
// =============================================================

async function fetchHistory(): Promise<HistoryItem[]> {
  try {
    const db = await getDb();
    const rows = await db.select<HistoryItem[]>(
      `SELECT
         user_id,
         display_name,
         avatar_code,
         message,
         encounter_count,
         first_seen_at,
         last_seen_at,
         last_seen_at AS last_encountered_at
       FROM users_cache
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
// 開発用: 擬似エンカウント投入 / 全クリア
//   実機 BLE が来るまでの UX 検証用。
//   spec: ble-handshake.md と同等のデータ形を擬似生成する。
// =============================================================

const SAMPLE_NAMES = ['Neko-9', 'Riku', 'sora', 'Pixel.42', 'mion', 'zoo', 'Hex'];
const SAMPLE_AVATARS = [
  'base01_top01_bot01',
  'base02_top03_bot02',
  'base01_top05_bot04',
  'base03_top02_bot01',
];
const SAMPLE_MESSAGES = [
  '最近はRust勉強中！',
  'こんにちは',
  '散歩中',
  '',
  '今日は寒い',
  'すれ違いテスト',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

async function seedOneEncounter(): Promise<void> {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);
    const userId = crypto.randomUUID();
    const name = pick(SAMPLE_NAMES);
    const avatar = pick(SAMPLE_AVATARS);
    const message = pick(SAMPLE_MESSAGES);

    await db.execute(
      `INSERT INTO users_cache
         (user_id, display_name, avatar_code, message, encounter_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 1, $5, $5)`,
      [userId, name, avatar, message, now],
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
    },
  });
}

export function useClearEncounters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearAllEncounters,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
      qc.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
}
