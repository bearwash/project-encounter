// 契約: docs/contracts/tauri-commands.md (ble.*)

import { invoke, requestPermissions } from '@tauri-apps/api/core';
import { isTauri, TauriUnavailableError } from './env';

export type BleMode = 'idle' | 'normal' | 'walk';

/** どの BLE 実装を使っているか (UI と BlePanel で見える化) */
export type BleBackend = 'mock' | 'btleplug' | 'tauri-plugin';

export type BleStatus = {
  mode: BleMode;
  backend: BleBackend;
  bluetooth_on: boolean;
  permission_granted: boolean;
  advertise_active: boolean;
  scan_active: boolean;
  seen_count: number;
  pending_count: number;
  pending_gatt_count: number;
  last_seen_at: number | null;
  last_seen_user_id: string | null;
  last_drained_count: number;
  last_drained_at: number | null;
  last_error: string | null;
};

/**
 * BLE Advertise / Scan のペイロード。
 * spec: docs/specs/ble-handshake.md §4.2 / docs/contracts/ble-payload.schema.json
 *
 * user_id (UUID 文字列) のみ。プロフィール本体は profile.fetch_remote
 * (= Supabase 代用 mock) 経由で別途取得する。
 */
export type BlePayload = {
  user_id: string;
  seen_at?: number;
};

export type BleDebugEvent = {
  at: number;
  label: string;
  detail: string;
};

export type BleDebugSnapshot = {
  backend: BleBackend;
  mode: BleMode;
  events: BleDebugEvent[];
};

export const BLE_EVENT_ENCOUNTER_FOUND = 'ble://encounter-found';

const OFFLINE_STATUS: BleStatus = {
  mode: 'idle',
  backend: 'mock',
  bluetooth_on: false,
  permission_granted: false,
  advertise_active: false,
  scan_active: false,
  seen_count: 0,
  pending_count: 0,
  pending_gatt_count: 0,
  last_seen_at: null,
  last_seen_user_id: null,
  last_drained_count: 0,
  last_drained_at: null,
  last_error: null,
};

const OFFLINE_DEBUG: BleDebugSnapshot = {
  backend: 'mock',
  mode: 'idle',
  events: [],
};

const ifTauri = <T>(fn: () => Promise<T>): Promise<T> =>
  isTauri() ? fn() : Promise.reject(new TauriUnavailableError());

let permissionRequestPromise: Promise<void> | null = null;

async function requestNativeBlePermissions(): Promise<void> {
  if (!isTauri()) return;
  permissionRequestPromise ??= requestPermissions('encounter-ble')
    .then(() => undefined)
    .catch(() => {
      // Desktop / unsupported plugin path. Native start still reports hard failures.
    })
    .finally(() => {
      permissionRequestPromise = null;
    });
  await permissionRequestPromise;
}

export const ble = {
  start: () =>
    ifTauri(async () => {
      await requestNativeBlePermissions();
      return invoke<void>('ble_start');
    }),
  stop: () => ifTauri(() => invoke<void>('ble_stop')),
  walkStart: () =>
    ifTauri(async () => {
      await requestNativeBlePermissions();
      return invoke<void>('ble_walk_mode_start');
    }),
  walkStop: () => ifTauri(() => invoke<void>('ble_walk_mode_stop')),
  drainPending: () =>
    isTauri()
      ? invoke<number>('ble_drain_pending_encounters')
      : Promise.resolve(0),
  status: (): Promise<BleStatus> =>
    isTauri() ? invoke<BleStatus>('ble_status') : Promise.resolve(OFFLINE_STATUS),
  debugSnapshot: (): Promise<BleDebugSnapshot> =>
    isTauri()
      ? invoke<BleDebugSnapshot>('ble_debug_snapshot')
      : Promise.resolve(OFFLINE_DEBUG),
  debugNote: (label: string, detail: string): Promise<void> =>
    isTauri()
      ? invoke<void>('ble_debug_note', { label, detail })
      : Promise.resolve(),
};
