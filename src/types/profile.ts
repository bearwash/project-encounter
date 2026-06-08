// 仕様: docs/specs/profile.md §4.2
// 契約: docs/contracts/db-schema.sql / docs/contracts/ble-payload.schema.json
import { avatarCodeFromParts, DEFAULT_RESOLVED } from '@/lib/avatar/fallback';

export type MyProfile = {
  user_id: string;
  display_name: string;
  avatar_code: string;
  message: string;
  /** ISO 3166-2:JP 下 2 桁 ("01"〜"47")。null=未設定。spec: regional-map.md */
  home_prefecture: string | null;
  updated_at: number;
};

export const PROFILE_LIMITS = {
  DISPLAY_NAME_MAX: 16,
  AVATAR_CODE_MAX: 64,
  MESSAGE_MAX: 30,
} as const;

// docs/specs/avatar.md §3.2: b{NN}_h{NN}_o{NN}_f{NN} 形式 (固定 15 文字)。
// フォールバック先 (resolveAvatarCode) と一致させるため manifest.defaultCode から導出する。
// 以前はここで 'b01_h01_o01_f01' をハードコードしており、未知コード時の
// フォールバック見た目 (manifest 由来) と新規プロフィール初期値が食い違っていた。
export const DEFAULT_AVATAR_CODE = avatarCodeFromParts(DEFAULT_RESOLVED);
