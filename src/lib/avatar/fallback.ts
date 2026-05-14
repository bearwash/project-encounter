/**
 * parse 済み AvatarParts を、manifest に存在する ID に確定させる。
 * 未知 ID / 欠落軸はすべてデフォルトコードで補完。
 *
 * spec: docs/specs/avatar.md §6
 */
import { AXES, AXIS_PREFIX, findPart, manifest, type AxisKey } from './manifest';
import { parseAvatarCode } from './parse';

export type ResolvedAvatar = Record<AxisKey, string>;

const DEFAULTS: ResolvedAvatar = (() => {
  const parsed = parseAvatarCode(manifest.defaultCode);
  const out = {} as ResolvedAvatar;
  for (const axis of AXES) {
    out[axis] = parsed[axis] ?? '01';
  }
  return out;
})();

export function resolveAvatarCode(code: string | null | undefined): ResolvedAvatar {
  const parsed = parseAvatarCode(code);
  const out = {} as ResolvedAvatar;
  for (const axis of AXES) {
    const id = parsed[axis];
    out[axis] = id && findPart(axis, id) ? id : DEFAULTS[axis];
  }
  return out;
}

export function avatarCodeFromParts(parts: ResolvedAvatar): string {
  return AXES.map((a) => `${AXIS_PREFIX[a]}${parts[a]}`).join('_');
}

export const DEFAULT_RESOLVED: ResolvedAvatar = DEFAULTS;
