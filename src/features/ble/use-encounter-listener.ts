'use client';

import { useQueryClient } from '@tanstack/react-query';
import type Database from '@tauri-apps/plugin-sql';
import { addPluginListener, type PluginListener } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { getDb } from '@/lib/db/client';
import {
  flushPendingProfiles,
  scheduleProfileFetch,
} from '@/lib/encounter/profile-fetch';
import { BLE_EVENT_ENCOUNTER_FOUND, type BlePayload } from '@/lib/tauri/ble';
import { isTauri } from '@/lib/tauri/env';

/**
 * Tauri event `ble://encounter-found` を購読し、
 * クールダウン制御 → encounter_logs に永続化 → 一括プロフィール fetch を予約。
 *
 * spec:
 *   - ble-handshake.md §4.4 クールダウン
 *   - profile-sync.md §5.4 トリガ (受信時の 30s デバウンス)
 *   - profile-sync.md §5.5 「未取得は表示しない」(users_cache に書かれるまで非表示)
 *
 * 旧 listener は受信のたびに単発 fetch していたが、複数同時受信時に N round-trip
 * になっていた。今は encounter_logs だけ即時 insert し、未取得 user_id の一括
 * fetch は scheduleProfileFetch (30s デバウンス) に集約する。
 */
export function useEncounterListener() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return;
    let pluginListener: PluginListener | null = null;
    let disposed = false;

    const handlePayload = async (payload: BlePayload) => {
      try {
        const inserted = await persistEncounterLog(payload);
        if (!inserted) return;

        qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
        qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
        qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });

        // §5.4.1: 受信時の一括 fetch は最大 30s でデバウンス
        scheduleProfileFetch(() => {
          qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
          qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
          qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });
        });
      } catch (e) {
        console.error('[encounter-listener] failed:', e);
      }
    };

    const unlistenPromise = listen<BlePayload>(
      BLE_EVENT_ENCOUNTER_FOUND,
      (event) => handlePayload(event.payload),
    );

    addPluginListener<BlePayload>(
      'encounter-ble',
      'encounter-found',
      (payload) => handlePayload(payload),
    )
      .then((listener) => {
        if (disposed) {
          listener.unregister().catch(() => {});
        } else {
          pluginListener = listener;
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlistenPromise.then((un) => un()).catch(() => {});
      pluginListener?.unregister().catch(() => {});
    };
  }, [qc]);
}

/**
 * encounter_logs への 1 行追加。クールダウン中なら捨てる。
 * users_cache は触らない (一括 fetch 側の責務)。
 */
async function persistEncounterLog(p: BlePayload): Promise<boolean> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  const cooldownSec = await getCooldownSec(db);
  const recent = await db.select<{ encountered_at: number }[]>(
    `SELECT encountered_at FROM encounter_logs
     WHERE encountered_user_id = $1
     ORDER BY encountered_at DESC LIMIT 1`,
    [p.user_id],
  );
  if (recent.length > 0 && now - recent[0]!.encountered_at < cooldownSec) {
    return false;
  }

  await db.execute(
    `INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
     VALUES ($1, $2, 0)`,
    [p.user_id, now],
  );
  return true;
}

async function getCooldownSec(db: Database): Promise<number> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'cooldown_sec'",
  );
  return Number(rows[0]?.value ?? 28800);
}

/**
 * HomePage のフォアグラウンド復帰時に即時 flush を呼ぶ用の re-export。
 * `flushPendingProfiles` 自身は idempotent / in-flight 排他制御済み。
 */
export { flushPendingProfiles };
