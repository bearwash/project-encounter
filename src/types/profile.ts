// 仕様: docs/specs/profile.md §4.2
// 契約: docs/contracts/db-schema.sql / docs/contracts/ble-payload.schema.json

export type MyProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  updated_at: number;
};

export const PROFILE_LIMITS = {
  DISPLAY_NAME_MAX: 16,
  AVATAR_CODE_MAX: 64,
  MESSAGE_MAX: 30,
} as const;

export const DEFAULT_AVATAR_CODE = 'base01_top01_bot01';
