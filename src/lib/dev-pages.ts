/**
 * dev プレビューページ (/avatar-preview, /plaza-preview 等) の公開可否。
 *
 * 旧実装は `NEXT_PUBLIC_ENABLE_DEV_PAGES !== '0' && NODE_ENV !== 'production'`
 * という AND 構成で、`next build` では常に NODE_ENV==='production' のため
 * env の値に関係なく常に無効化され、env ノブが死んでいた。
 *
 * 仕様:
 *   - `NEXT_PUBLIC_ENABLE_DEV_PAGES=1` → 強制 ON (本番 export でも公開。staging 用)
 *   - `NEXT_PUBLIC_ENABLE_DEV_PAGES=0` → 強制 OFF (dev でも非公開)
 *   - 未設定                          → dev は ON、本番 (production) は OFF
 */
export function devPagesEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}
