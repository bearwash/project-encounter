'use client';

import { useQueryClient } from '@tanstack/react-query';
import type Database from '@tauri-apps/plugin-sql';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { getDb } from '@/lib/db/client';
import { BLE_EVENT_ENCOUNTER_FOUND, type BlePayload } from '@/lib/tauri/ble';
import { isTauri } from '@/lib/tauri/env';

/**
 * Tauri event `ble://encounter-found` を購読し、
 * クールダウン制御を経て users_cache / encounter_logs に永続化する。
 *
 * 仕様:
 *   - ble-handshake.md §4.4 クールダウン (`app_settings.cooldown_sec`)
 *   - encounter-popup.md §4.5 既読化はポップアップ側で扱う
 */
export function useEncounterListener() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return;
    const unlistenPromise = listen<BlePayload>(
      BLE_EVENT_ENCOUNTER_FOUND,
      async (event) => {
        try {
          const inserted = await persistEncounter(event.payload);
          if (inserted) {
            qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
            qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
          }
        } catch (e) {
          console.error('[encounter-listener] failed:', e);
        }
      },
    );

    return () => {
      unlistenPromise.then((un) => un()).catch(() => {});
    };
  }, [qc]);
}

type ExistingRow = {
  user_id: string;
  encounter_count: number;
  last_seen_at: number;
};

async function persistEncounter(p: BlePayload): Promise<boolean> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  const existing = await db.select<ExistingRow[]>(
    'SELECT user_id, encounter_count, last_seen_at FROM users_cache WHERE user_id = $1',
    [p.id],
  );

  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO users_cache
         (user_id, display_name, avatar_code, message, encounter_count, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 1, $5, $5)`,
      [p.id, p.name, p.avatar, p.msg ?? '', now],
    );
    await db.execute(
      `INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
       VALUES ($1, $2, 0)`,
      [p.id, now],
    );
    return true;
  }

  // 既存ユーザー: クールダウン判定 (spec §4.4)
  const cooldownSec = await getCooldownSec(db);
  if (now - existing[0]!.last_seen_at < cooldownSec) {
    return false;
  }

  await db.execute(
    `UPDATE users_cache SET
       display_name    = $1,
       avatar_code     = $2,
       message         = $3,
       encounter_count = encounter_count + 1,
       last_seen_at    = $4
     WHERE user_id = $5`,
    [p.name, p.avatar, p.msg ?? '', now, p.id],
  );
  await db.execute(
    `INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
     VALUES ($1, $2, 0)`,
    [p.id, now],
  );
  return true;
}

async function getCooldownSec(db: Database): Promise<number> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'cooldown_sec'",
  );
  return Number(rows[0]?.value ?? 28800);
}
