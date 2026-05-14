'use client';

import { useQueryClient } from '@tanstack/react-query';
import type Database from '@tauri-apps/plugin-sql';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { getDb } from '@/lib/db/client';
import { BLE_EVENT_ENCOUNTER_FOUND, type BlePayload } from '@/lib/tauri/ble';
import { isTauri } from '@/lib/tauri/env';
import { fetchRemoteProfile } from '@/lib/tauri/profile';

/**
 * Tauri event `ble://encounter-found` を購読し、
 * クールダウン制御 + プロフィール fetch を経て users_cache / encounter_logs に永続化する。
 *
 * 仕様:
 *   - ble-handshake.md §4.4 クールダウン
 *   - profile-sync.md §4 / §5.4 fetch & UPSERT
 *   - encounter-popup.md §4.5 既読化はポップアップ側
 *
 * 流れ:
 *   1. BLE が user_id (16 byte UUID) を受信
 *   2. クールダウン判定 (encounter_logs の最新を見る)
 *   3. encounter_logs に行を追加 (is_read=false)
 *   4. users_cache に未登録なら profile fetch (mock = Rust 側、本番 = Supabase)
 *      → 取得できたら UPSERT。取得できないなら未取得のまま放置
 *      (「未取得は表示しない」ポリシー — [[architecture-id-only-ble-cloud-sync]])
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

async function persistEncounter(p: BlePayload): Promise<boolean> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);

  // クールダウン判定 (spec §4.4): encounter_logs の最新時刻から cooldown 以内なら捨てる
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

  // 履歴を記録
  await db.execute(
    `INSERT INTO encounter_logs (encountered_user_id, encountered_at, is_read)
     VALUES ($1, $2, 0)`,
    [p.user_id, now],
  );

  // users_cache の状態を確認
  const existing = await db.select<{ user_id: string }[]>(
    'SELECT user_id FROM users_cache WHERE user_id = $1',
    [p.user_id],
  );

  if (existing.length === 0) {
    // 未取得: profile fetch (mock 経由)。失敗時は users_cache に書かない
    // = ポップアップにも広場にも出ない (spec §5.5)
    try {
      const profile = await fetchRemoteProfile(p.user_id);
      if (profile) {
        await db.execute(
          `INSERT INTO users_cache
             (user_id, display_name, avatar_code, message, encounter_count, first_seen_at, last_seen_at)
           VALUES ($1, $2, $3, $4, 1, $5, $5)`,
          [
            profile.user_id,
            profile.display_name,
            profile.avatar_code,
            profile.message,
            now,
          ],
        );
      } else {
        console.info('[encounter-listener] profile not found:', p.user_id);
      }
    } catch (e) {
      console.warn('[encounter-listener] profile fetch failed:', e);
    }
  } else {
    // 既存ユーザー: count + last_seen_at を更新
    await db.execute(
      `UPDATE users_cache SET
         encounter_count = encounter_count + 1,
         last_seen_at    = $1
       WHERE user_id = $2`,
      [now, p.user_id],
    );
  }

  return true;
}

async function getCooldownSec(db: Database): Promise<number> {
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'cooldown_sec'",
  );
  return Number(rows[0]?.value ?? 28800);
}
