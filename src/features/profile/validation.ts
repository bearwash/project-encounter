import { lookupPrefecture } from '@/lib/prefecture/data';
import { PROFILE_LIMITS } from '@/types/profile';

export type ProfileInput = {
  display_name: string;
  avatar_code: string;
  message: string;
  /** "01"〜"47" or null (= 未設定 = 非公開)。spec: regional-map.md */
  home_prefecture: string | null;
};

export type ValidationError = {
  field: keyof ProfileInput;
  message: string;
};

const AVATAR_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

export function validateProfile(input: ProfileInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // display_name
  const trimmed = input.display_name.trim();
  if (trimmed.length === 0) {
    errors.push({ field: 'display_name', message: '名前を入力してください' });
  } else if (input.display_name.length > PROFILE_LIMITS.DISPLAY_NAME_MAX) {
    errors.push({
      field: 'display_name',
      message: `${PROFILE_LIMITS.DISPLAY_NAME_MAX} 文字以内で入力してください`,
    });
  } else if (CONTROL_CHAR_PATTERN.test(input.display_name)) {
    errors.push({
      field: 'display_name',
      message: '改行や制御文字は使えません',
    });
  }

  // avatar_code
  if (input.avatar_code.length === 0) {
    errors.push({
      field: 'avatar_code',
      message: 'アバターコードを入力してください',
    });
  } else if (input.avatar_code.length > PROFILE_LIMITS.AVATAR_CODE_MAX) {
    errors.push({
      field: 'avatar_code',
      message: `${PROFILE_LIMITS.AVATAR_CODE_MAX} 文字以内で入力してください`,
    });
  } else if (!AVATAR_CODE_PATTERN.test(input.avatar_code)) {
    errors.push({
      field: 'avatar_code',
      message: '英数字 / _ / - のみ使えます',
    });
  }

  // message (optional)
  if (input.message.length > PROFILE_LIMITS.MESSAGE_MAX) {
    errors.push({
      field: 'message',
      message: `${PROFILE_LIMITS.MESSAGE_MAX} 文字以内で入力してください`,
    });
  } else if (CONTROL_CHAR_PATTERN.test(input.message)) {
    errors.push({ field: 'message', message: '改行や制御文字は使えません' });
  }

  // home_prefecture (optional)。null = 未設定 (= 非公開)。
  // 値があるなら 47 都道府県のいずれかでなければならない。
  if (
    input.home_prefecture !== null &&
    !lookupPrefecture(input.home_prefecture)
  ) {
    errors.push({
      field: 'home_prefecture',
      message: '未知の都道府県コードです',
    });
  }

  return errors;
}
