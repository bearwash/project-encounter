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

// avatar_code は b{NN}_h{NN}_o{NN}_f{NN} の「軸文字+2桁」を _ で連結した構造。
// 将来の軸 (a{NN} 等) を後方互換で許すため末尾の追加セグメントも許容する。
// (spec: avatar.md §3.2 / 要件 §4.3「未知の軸はパーサが無視」)
const AVATAR_CODE_PATTERN = /^[a-z][0-9]{2}(_[a-z][0-9]{2})*$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const PUBLIC_CONTACT_PATTERN = /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[ -]?){9,}|line\s*id|discord/i;
const OBJECTIONABLE_PATTERN = /死ね|しね|殺す|ころす|レイプ|セックス|ポルノ|きもい|クソ|fuck|shit|bitch|nigg/i;

function publicTextError(value: string): string | null {
  if (PUBLIC_CONTACT_PATTERN.test(value)) {
    return '公開プロフィールにURL・連絡先は載せられません';
  }
  if (OBJECTIONABLE_PATTERN.test(value)) {
    return '公開できない表現が含まれています';
  }
  return null;
}

/** コードポイント単位の文字数 (絵文字・サロゲートペアを 1 文字として数える)。 */
export function countChars(s: string): number {
  return [...s].length;
}

export function validateProfile(input: ProfileInput): ValidationError[] {
  const errors: ValidationError[] = [];

  // display_name (前後空白はトリムして数える)
  const trimmedName = input.display_name.trim();
  if (trimmedName.length === 0) {
    errors.push({ field: 'display_name', message: '名前を入力してください' });
  } else if (countChars(trimmedName) > PROFILE_LIMITS.DISPLAY_NAME_MAX) {
    errors.push({
      field: 'display_name',
      message: `${PROFILE_LIMITS.DISPLAY_NAME_MAX} 文字以内で入力してください`,
    });
  } else if (CONTROL_CHAR_PATTERN.test(input.display_name)) {
    errors.push({
      field: 'display_name',
      message: '改行や制御文字は使えません',
    });
  } else {
    const unsafeName = publicTextError(trimmedName);
    if (unsafeName) errors.push({ field: 'display_name', message: unsafeName });
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
      message: 'アバターコードの形式が正しくありません',
    });
  }

  // message (optional、前後空白はトリムして数える)
  if (countChars(input.message.trim()) > PROFILE_LIMITS.MESSAGE_MAX) {
    errors.push({
      field: 'message',
      message: `${PROFILE_LIMITS.MESSAGE_MAX} 文字以内で入力してください`,
    });
  } else if (CONTROL_CHAR_PATTERN.test(input.message)) {
    errors.push({ field: 'message', message: '改行や制御文字は使えません' });
  } else {
    const unsafeMessage = publicTextError(input.message.trim());
    if (unsafeMessage) errors.push({ field: 'message', message: unsafeMessage });
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
