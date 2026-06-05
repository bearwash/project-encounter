// spec: docs/specs/encounter-popup.md §4.3 / docs/specs/walk-mode.md §4.2
//
// 「N 日ぶり」「きょう N 回」相当のサイレント・カウンタ用ユーティリティ。
// 3DS 時代の緑 LED 相当の「開ける前のワクワク」「待機中の手応え」を、
// 通知を出さずに数値で見せるために使う。
//
// last_session_opened_at は app_settings に保存。フォアグラウンド復帰の
// たびに上書きされる前に「前回値」を読み出して保持し、表示用に使う。

import { getDb } from '@/lib/db/client';

const KEY_LAST_OPENED = 'last_session_opened_at';

/** 当日 00:00 (ローカル時刻) の Unix epoch 秒 */
export function startOfToday(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** 整数日 (24h ごと) で「N 日前か」を返す。同日内なら 0。 */
export function daysSince(unixSec: number, now: Date = new Date()): number {
  const startNow = startOfToday(now);
  const startThen = startOfToday(new Date(unixSec * 1000));
  return Math.max(0, Math.floor((startNow - startThen) / 86400));
}

/** app_settings から前回の起動時刻を取得。未保存なら null。 */
export async function readLastSessionOpenedAt(): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM app_settings WHERE key = $1',
    [KEY_LAST_OPENED],
  );
  if (rows.length === 0) return null;
  const n = Number(rows[0]!.value);
  return Number.isFinite(n) ? n : null;
}

/** 現在時刻を app_settings.last_session_opened_at に upsert する。 */
export async function writeSessionOpenedNow(now: Date = new Date()): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [KEY_LAST_OPENED, String(Math.floor(now.getTime() / 1000))],
  );
}
