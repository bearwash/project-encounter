'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  addPluginListener,
  invoke,
  type PluginListener,
} from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  flushPendingProfiles,
  restoreProfileFetchRetry,
  scheduleProfileFetch,
} from '@/lib/encounter/profile-fetch';
import { ble, BLE_EVENT_ENCOUNTER_FOUND, type BlePayload } from '@/lib/tauri/ble';
import { isTauri } from '@/lib/tauri/env';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const afterInserted = () => {
      qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
      qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
      qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });

      // §5.4.1: 受信時の一括 fetch は最大 30s でデバウンス
      scheduleProfileFetch(() => {
        qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
        qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
        qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });
      });
    };

    const handlePayload = async (payload: BlePayload) => {
      try {
        const inserted = await recordEncounter(payload);
        if (!inserted) return;
        afterInserted();
      } catch (e) {
        console.error('[encounter-listener] failed:', e);
      }
    };

    const drainNativePending = async () => {
      try {
        const inserted = await ble.drainPending();
        if (inserted > 0) afterInserted();
      } catch (e) {
        console.warn('[encounter-listener] drain pending failed:', e);
      }
    };

    drainNativePending();
    restoreProfileFetchRetry(() => {
      qc.invalidateQueries({ queryKey: ['encounters', 'unread'] });
      qc.invalidateQueries({ queryKey: ['encounters', 'history'] });
      qc.invalidateQueries({ queryKey: ['encounters', 'todayCount'] });
    }).catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === 'visible') drainNativePending();
    };
    document.addEventListener('visibilitychange', onVisible);

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
      document.removeEventListener('visibilitychange', onVisible);
      unlistenPromise.then((un) => un()).catch(() => {});
      pluginListener?.unregister().catch(() => {});
    };
  }, [qc]);
}

async function recordEncounter(p: BlePayload): Promise<boolean> {
  const userId = normalizeUserId(p.user_id);
  if (!userId) return false;

  return invoke<boolean>('encounter_record_received_user_id', {
    userId,
    encounteredAt: normalizeSeenAt(p.seen_at),
  });
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const userId = value.trim().toLowerCase();
  return UUID_RE.test(userId) ? userId : null;
}

function normalizeSeenAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

/**
 * HomePage のフォアグラウンド復帰時に即時 flush を呼ぶ用の re-export。
 * `flushPendingProfiles` 自身は idempotent / in-flight 排他制御済み。
 */
export { flushPendingProfiles };
