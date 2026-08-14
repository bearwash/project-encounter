import { getDb } from '@/lib/db/client';
import { loadBlockedUserIds } from '@/features/safety/moderation';
import { isTauri } from '@/lib/tauri/env';
import type { HistoryItem } from '@/types/encounter';

export type TowerTicket = {
  encounterLogId: number;
  userId: string;
  displayName: string;
  avatarCode: string;
  message: string;
  encounterCount: number;
  encounterSequence: number;
  encounteredAt: number;
};

export type TowerTicketStats = {
  available: number;
  used: number;
  total: number;
};

type TowerTicketRow = {
  encounter_log_id: number;
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  encounter_count: number;
  encounter_sequence: number;
  encountered_at: number;
};

type CountRow = { total: number; used: number };

type BrowserTowerState = {
  tickets: TowerTicket[];
  usedIds: number[];
  highestFloorByTicket: Record<string, number>;
};

const BROWSER_STATE_KEY = 'project-encounter:tower-test-state:v2';
const DEFAULT_AVATAR = 'b01_h01_o01_f01';

const SAMPLE_HEROES = [
  ['momo', 'もも', 'また会えたね', 'b01_h05_o03_f01'],
  ['riku', 'リク', '今日もよろしく！', 'b02_h02_o01_f03'],
  ['sora', 'ソラ', '上の階まで行こう', 'b04_h04_o02_f01'],
  ['yui', 'ゆい', '魔法ならまかせて', 'b03_h01_o04_f04'],
] as const;

function makeBrowserSeed(): BrowserTowerState {
  const now = Math.floor(Date.now() / 1000);
  // momo は同じ相手と 2 回すれ違った状態。別 log_id なので 2 回出撃できる。
  const order = [0, 1, 0, 2, 3, 1, 2, 3];
  const counts = new Map<string, number>();
  const tickets = order.map((heroIndex, index) => {
    const [userId, displayName, message, avatarCode] = SAMPLE_HEROES[heroIndex]!;
    const encounterCount = (counts.get(userId) ?? 0) + 1;
    counts.set(userId, encounterCount);
    return {
      encounterLogId: index + 1,
      userId: `preview-${userId}`,
      displayName,
      avatarCode,
      message,
      encounterCount,
      encounterSequence: encounterCount,
      encounteredAt: now - (order.length - index) * 180,
    } satisfies TowerTicket;
  });

  return { tickets, usedIds: [], highestFloorByTicket: {} };
}

function readBrowserState(): BrowserTowerState {
  if (typeof window === 'undefined') return makeBrowserSeed();
  try {
    const raw = window.localStorage.getItem(BROWSER_STATE_KEY);
    if (!raw) {
      const seeded = makeBrowserSeed();
      writeBrowserState(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<BrowserTowerState>;
    if (!Array.isArray(parsed.tickets) || !Array.isArray(parsed.usedIds)) {
      throw new Error('invalid tower preview state');
    }
    return {
      tickets: parsed.tickets,
      usedIds: parsed.usedIds.filter((id): id is number => Number.isInteger(id)),
      highestFloorByTicket: parsed.highestFloorByTicket ?? {},
    };
  } catch (error) {
    console.warn('[tower] test state restore failed:', error);
    const seeded = makeBrowserSeed();
    writeBrowserState(seeded);
    return seeded;
  }
}

function writeBrowserState(state: BrowserTowerState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BROWSER_STATE_KEY, JSON.stringify(state));
}

export async function loadAvailableTowerTickets(): Promise<TowerTicket[]> {
  if (!isTauri()) {
    const state = readBrowserState();
    const used = new Set(state.usedIds);
    const blocked = await loadBlockedUserIds();
    return state.tickets.filter(
      (ticket) => !used.has(ticket.encounterLogId) && !blocked.has(ticket.userId),
    );
  }

  const db = await getDb();
  const rows = await db.select<TowerTicketRow[]>(
    `WITH sequenced_logs AS (
       SELECT
         log_id,
         encountered_user_id,
         encountered_at,
         ROW_NUMBER() OVER (
           PARTITION BY encountered_user_id
           ORDER BY encountered_at ASC, log_id ASC
         ) AS encounter_sequence
       FROM encounter_logs
     )
     SELECT
       l.log_id AS encounter_log_id,
       l.encountered_user_id AS user_id,
       COALESCE(u.display_name, '旅人') AS display_name,
       COALESCE(u.avatar_code, $1) AS avatar_code,
       COALESCE(u.message, '') AS message,
       COALESCE(u.encounter_count, 1) AS encounter_count,
       l.encounter_sequence,
       l.encountered_at
     FROM sequenced_logs l
     LEFT JOIN users_cache u ON u.user_id = l.encountered_user_id
     LEFT JOIN tower_dispatches d ON d.encounter_log_id = l.log_id
     WHERE d.encounter_log_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.user_id = l.encountered_user_id)
     ORDER BY l.encountered_at ASC`,
    [DEFAULT_AVATAR],
  );

  return rows.map((row) => ({
    encounterLogId: row.encounter_log_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarCode: row.avatar_code,
    message: row.message,
    encounterCount: row.encounter_count,
    encounterSequence: row.encounter_sequence,
    encounteredAt: row.encountered_at,
  }));
}

export async function loadTowerTicketStats(): Promise<TowerTicketStats> {
  if (!isTauri()) {
    const state = readBrowserState();
    const blocked = await loadBlockedUserIds();
    const visibleTickets = state.tickets.filter((ticket) => !blocked.has(ticket.userId));
    const visibleIds = new Set(visibleTickets.map((ticket) => ticket.encounterLogId));
    return {
      total: visibleTickets.length,
      used: state.usedIds.filter((id) => visibleIds.has(id)).length,
      available: visibleTickets.filter((ticket) => !state.usedIds.includes(ticket.encounterLogId)).length,
    };
  }

  const db = await getDb();
  const rows = await db.select<CountRow[]>(
    `SELECT
       (SELECT COUNT(*) FROM encounter_logs l
        WHERE NOT EXISTS (
          SELECT 1 FROM blocked_users b WHERE b.user_id = l.encountered_user_id
        )) AS total,
       (SELECT COUNT(*) FROM tower_dispatches d
        WHERE NOT EXISTS (
          SELECT 1 FROM blocked_users b WHERE b.user_id = d.user_id
        )) AS used`,
  );
  const total = Number(rows[0]?.total ?? 0);
  const used = Number(rows[0]?.used ?? 0);
  return { total, used, available: Math.max(0, total - used) };
}

/**
 * すれ違いログ 1 行を出撃済みにする。PRIMARY KEY 制約が最後の二重消費防止になる。
 */
export async function consumeTowerTicket(ticket: TowerTicket): Promise<boolean> {
  if (!isTauri()) {
    const state = readBrowserState();
    if (state.usedIds.includes(ticket.encounterLogId)) return false;
    state.usedIds.push(ticket.encounterLogId);
    state.highestFloorByTicket[String(ticket.encounterLogId)] = 1;
    writeBrowserState(state);
    return true;
  }

  const db = await getDb();
  try {
    const result = await db.execute(
      `INSERT INTO tower_dispatches
         (encounter_log_id, user_id, dispatched_at, highest_floor)
       VALUES ($1, $2, $3, 1)`,
      [ticket.encounterLogId, ticket.userId, Math.floor(Date.now() / 1000)],
    );
    return result.rowsAffected === 1;
  } catch (error) {
    // 同じ log_id の二重 INSERT は「すでに別操作で消費済み」として扱う。
    console.warn('[tower] ticket could not be consumed:', error);
    return false;
  }
}

export async function recordTowerFloor(ticketId: number, floor: number): Promise<void> {
  const safeFloor = Math.max(1, Math.floor(floor));
  if (!isTauri()) {
    const state = readBrowserState();
    state.highestFloorByTicket[String(ticketId)] = Math.max(
      state.highestFloorByTicket[String(ticketId)] ?? 1,
      safeFloor,
    );
    writeBrowserState(state);
    return;
  }

  const db = await getDb();
  await db.execute(
    `UPDATE tower_dispatches
     SET highest_floor = MAX(highest_floor, $1)
     WHERE encounter_log_id = $2`,
    [safeFloor, ticketId],
  );
}

/** 開発ブラウザ専用: 実決済・実 BLE を使わず、すれ違い 1 回を追加する。 */
export async function addBrowserTestEncounter(): Promise<void> {
  if (isTauri()) return;
  const state = readBrowserState();
  const source = SAMPLE_HEROES[state.tickets.length % SAMPLE_HEROES.length]!;
  const [shortId, displayName, message, avatarCode] = source;
  const userId = `preview-${shortId}`;
  const encounterCount = state.tickets.filter((ticket) => ticket.userId === userId).length + 1;
  const nextId = Math.max(0, ...state.tickets.map((ticket) => ticket.encounterLogId)) + 1;
  state.tickets.push({
    encounterLogId: nextId,
    userId,
    displayName,
    avatarCode,
    message,
    encounterCount,
    encounterSequence: encounterCount,
    encounteredAt: Math.floor(Date.now() / 1000),
  });
  writeBrowserState(state);
}

export async function loadStreetpassResidents(): Promise<HistoryItem[]> {
  if (!isTauri()) {
    const blocked = await loadBlockedUserIds();
    const unique = new Map<string, TowerTicket>();
    for (const ticket of readBrowserState().tickets) {
      if (!blocked.has(ticket.userId)) unique.set(ticket.userId, ticket);
    }
    return [...unique.values()].map((ticket) => ({
      user_id: ticket.userId,
      display_name: ticket.displayName,
      avatar_code: ticket.avatarCode,
      message: ticket.message,
      home_prefecture: null,
      encounter_count: readBrowserState().tickets.filter((entry) => entry.userId === ticket.userId).length,
      first_seen_at: Math.min(
        ...readBrowserState().tickets
          .filter((entry) => entry.userId === ticket.userId)
          .map((entry) => entry.encounteredAt),
      ),
      last_seen_at: Math.max(
        ...readBrowserState().tickets
          .filter((entry) => entry.userId === ticket.userId)
          .map((entry) => entry.encounteredAt),
      ),
      last_encountered_at: Math.max(
        ...readBrowserState().tickets
          .filter((entry) => entry.userId === ticket.userId)
          .map((entry) => entry.encounteredAt),
      ),
    }));
  }

  const db = await getDb();
  return db.select<HistoryItem[]>(
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
}

/** 開発ブラウザ専用: 出撃消費だけを戻し、同じすれ違いログで再検証できるようにする。 */
export async function resetBrowserTowerProgress(): Promise<void> {
  if (isTauri()) return;
  const state = readBrowserState();
  state.usedIds = [];
  state.highestFloorByTicket = {};
  writeBrowserState(state);
}
