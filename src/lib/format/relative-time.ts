/**
 * Unix epoch (sec) を「3 分前」「昨日」等の相対表記に。
 * spec: docs/specs/encounter-list.md §4.2
 *
 * 注意: `nowSec` 既定値は呼び出し時刻 (Date.now())。SSR/SSG 経路から
 * 引数省略で呼ぶと server/client で now がズレて hydration mismatch を
 * 起こすため、サーバーレンダーされ得る場所では nowSec を明示的に渡すこと
 * (本コードベースでは RegionalMap 等クライアント専用からのみ呼ばれる)。
 */
export function formatRelativeTime(epochSec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const diff = nowSec - epochSec;

  if (diff < 30) return 'たった今';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 60 * 60) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 60 * 60 * 24) return `${Math.floor(diff / 3600)} 時間前`;
  if (diff < 60 * 60 * 24 * 2) return '昨日';
  if (diff < 60 * 60 * 24 * 7) return `${Math.floor(diff / 86400)} 日前`;

  const d = new Date(epochSec * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
