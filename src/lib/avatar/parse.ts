/**
 * avatar_code (例: b01_h02_o03_f04) を 4 軸のオブジェクトにパースする。
 *
 * - 軸の順序は問わない（順序逆転にも耐える）
 * - 未知軸 (例: a05) は黙って無視 → 後方互換
 * - 軸の欠落 (例: 旧 11 文字 b01_h01_o01) は欠落軸を undefined で返す → 前方互換
 * - 不正なトークンは無視（クラッシュ禁止）
 *
 * spec: docs/specs/avatar.md §3.2, §6
 */
import { PREFIX_TO_AXIS, type AxisKey } from './manifest';

export type AvatarParts = Partial<Record<AxisKey, string>>;

const ID_RE = /^\d{2}$/;

export function parseAvatarCode(code: string | null | undefined): AvatarParts {
  const out: AvatarParts = {};
  if (!code || typeof code !== 'string') return out;

  for (const token of code.split('_')) {
    if (token.length < 2) continue;
    const prefix = token[0]!;
    const id = token.slice(1);
    const axis = PREFIX_TO_AXIS[prefix];
    if (axis && ID_RE.test(id)) {
      out[axis] = id;
    }
  }
  return out;
}
