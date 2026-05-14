// 契約: docs/contracts/tauri-commands.md (ble.*)

import { invoke } from '@tauri-apps/api/core';
import { isTauri, TauriUnavailableError } from './env';

export type BleMode = 'idle' | 'normal' | 'walk';

export type BleStatus = {
  mode: BleMode;
  bluetooth_on: boolean;
  permission_granted: boolean;
  advertise_active: boolean;
  scan_active: boolean;
};

export type BlePayload = {
  id: string;
  name: string;
  avatar: string;
  msg?: string;
};

export const BLE_EVENT_ENCOUNTER_FOUND = 'ble://encounter-found';

const OFFLINE_STATUS: BleStatus = {
  mode: 'idle',
  bluetooth_on: false,
  permission_granted: false,
  advertise_active: false,
  scan_active: false,
};

const ifTauri = <T>(fn: () => Promise<T>): Promise<T> =>
  isTauri() ? fn() : Promise.reject(new TauriUnavailableError());

export const ble = {
  start: () => ifTauri(() => invoke<void>('ble_start')),
  stop: () => ifTauri(() => invoke<void>('ble_stop')),
  walkStart: () => ifTauri(() => invoke<void>('ble_walk_mode_start')),
  walkStop: () => ifTauri(() => invoke<void>('ble_walk_mode_stop')),
  status: (): Promise<BleStatus> =>
    isTauri() ? invoke<BleStatus>('ble_status') : Promise.resolve(OFFLINE_STATUS),
};
