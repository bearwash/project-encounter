// 契約: docs/contracts/tauri-commands.md (ble.*)

import { invoke } from '@tauri-apps/api/core';

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

export const ble = {
  start: () => invoke<void>('ble_start'),
  stop: () => invoke<void>('ble_stop'),
  walkStart: () => invoke<void>('ble_walk_mode_start'),
  walkStop: () => invoke<void>('ble_walk_mode_stop'),
  status: () => invoke<BleStatus>('ble_status'),
};
