'use client';

/**
 * 47 都道府県のタイルマップ + 出会った人のコレクション。
 * spec: docs/specs/regional-map.md
 *
 * - 12 行 × 10 列の正方形タイルで日本列島の形を近似
 * - 既訪県 (= 出身として登録された誰かに 1 人でも会った): 地方色のフィル
 * - 未訪県: グレーアウト
 * - 自分の出身地: 黄枠で強調
 * - タイル選択 → 下にスライドアップする bottom sheet にその県の住人リスト
 * - 0 件のとき: 中央に誘導テキスト
 */

import { useMemo, useState } from 'react';
import { Avatar } from '@/features/encounter/Avatar';
import { formatRelativeTime } from '@/lib/format/relative-time';
import { hapticTap } from '@/lib/haptics';
import {
  PREFECTURES,
  REGION_ORDER,
  TILE_COLS,
  TILE_ROWS,
  lookupPrefecture,
  type Prefecture,
  type Region,
} from '@/lib/prefecture/data';
import type { HistoryItem } from '@/types/encounter';

const TILE_PX = 36;
const GAP_PX = 4;

/** 地方ごとの差し色 (要件 §3.3 ノスタルジック・ポップ準拠) */
const REGION_FILL: Record<Region, string> = {
  '北海道':     '#9BD0E5',
  '東北':       '#A3D9A5',
  '関東':       '#FFC56C',
  '中部':       '#FFD3D9',
  '近畿':       '#F0A0A0',
  '中国':       '#D3B8E8',
  '四国':       '#FFF0A6',
  '九州沖縄':   '#FF9F8B',
};

type Props = {
  residents: HistoryItem[];
  /** 自分の出身県 (黄枠で強調)。未設定なら null。 */
  myHomePrefecture: string | null;
};

export function RegionalMap({ residents, myHomePrefecture }: Props) {
  // 県コード → 住人リスト
  const byPref = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const r of residents) {
      if (!r.home_prefecture) continue;
      const list = map.get(r.home_prefecture) ?? [];
      list.push(r);
      map.set(r.home_prefecture, list);
    }
    return map;
  }, [residents]);

  const visitedCount = byPref.size;

  const [selected, setSelected] = useState<Prefecture | null>(null);

  const stageW = TILE_COLS * (TILE_PX + GAP_PX) - GAP_PX;
  const stageH = TILE_ROWS * (TILE_PX + GAP_PX) - GAP_PX;

  return (
    <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden bg-cream p-4">
      {/* ヘッダー */}
      <header className="flex items-center justify-between rounded-toy border border-cream-deep bg-cream-soft px-4 py-2 shadow-toy">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            🗾
          </span>
          <span className="text-sm font-black tracking-wider text-ink">
            すれちがい日本地図
          </span>
        </div>
        <span
          className="font-mono text-sm font-black tracking-widest text-pop-red"
          data-testid="regional-map-progress"
        >
          {visitedCount} / 47
        </span>
      </header>

      {/* タイルマップ */}
      <div className="flex flex-1 items-center justify-center overflow-auto">
        <div
          className="relative"
          style={{ width: stageW, height: stageH }}
          data-testid="regional-map-stage"
        >
          {PREFECTURES.map((p) => {
            const count = byPref.get(p.code)?.length ?? 0;
            const visited = count > 0;
            const isMine = myHomePrefecture === p.code;
            const left = p.tile.col * (TILE_PX + GAP_PX);
            const top = p.tile.row * (TILE_PX + GAP_PX);
            const fill = visited ? REGION_FILL[p.region] : '#E6DECC';
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => {
                  hapticTap();
                  setSelected(p);
                }}
                data-testid={`pref-tile-${p.code}`}
                data-visited={visited}
                data-mine={isMine}
                className="absolute flex flex-col items-center justify-center rounded-md border-2 text-[10px] font-black tracking-tight shadow-toy transition active:translate-y-[2px] active:shadow-none"
                style={{
                  left,
                  top,
                  width: TILE_PX,
                  height: TILE_PX,
                  backgroundColor: fill,
                  borderColor: isMine ? '#F5C24A' : visited ? '#3B3024' : '#C8BFA8',
                  color: visited ? '#3B3024' : '#9A8E73',
                  opacity: visited || isMine ? 1 : 0.7,
                  boxShadow: isMine ? '0 0 0 3px rgba(245,194,74,0.5)' : undefined,
                }}
                aria-label={`${p.name} ${visited ? `${count} 人` : '未訪'}`}
              >
                <span className="leading-none">{p.name}</span>
                {visited && (
                  <span className="mt-0.5 rounded-full bg-cream-soft px-1 text-[8px] font-black tracking-widest text-pop-red">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 凡例 */}
      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] tracking-widest text-ink-muted">
        {REGION_ORDER.map((r) => (
          <span key={r} className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm border border-ink/40"
              style={{ backgroundColor: REGION_FILL[r] }}
            />
            {r}
          </span>
        ))}
      </footer>

      {/* 県の住人パネル (下から) */}
      <PrefectureSheet
        prefecture={selected}
        residents={selected ? byPref.get(selected.code) ?? [] : []}
        myHomePrefecture={myHomePrefecture}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function PrefectureSheet({
  prefecture,
  residents,
  myHomePrefecture,
  onClose,
}: {
  prefecture: Prefecture | null;
  residents: HistoryItem[];
  myHomePrefecture: string | null;
  onClose: () => void;
}) {
  if (!prefecture) return null;
  const isMine = lookupPrefecture(myHomePrefecture)?.code === prefecture.code;

  return (
    <>
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/40"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[55vh] flex-col gap-3 overflow-hidden rounded-t-toy border-t-2 border-cream-deep bg-cream-soft p-5 shadow-toy-lg"
        data-testid="pref-sheet"
        data-pref-code={prefecture.code}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-cream-deep" />
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-wide text-ink">
            📍 {prefecture.name}
            {isMine && (
              <span className="rounded-full bg-pop-yellow px-2 py-0.5 text-[10px] font-black tracking-widest text-ink shadow-inner">
                あなたの出身
              </span>
            )}
          </h2>
          <span className="text-xs font-bold tracking-widest text-ink-muted">
            {prefecture.region}
          </span>
        </div>

        {residents.length === 0 ? (
          <p className="rounded-toy border border-cream-deep bg-cream px-4 py-6 text-center text-sm text-ink-soft">
            この県の人とは、まだすれちがっていません。
          </p>
        ) : (
          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {residents.map((r) => (
              <li
                key={r.user_id}
                className="flex items-center gap-3 rounded-toy border border-cream-deep bg-cream px-3 py-2 shadow-toy"
              >
                <Avatar code={r.avatar_code} size={48} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-black text-ink">
                    {r.display_name}
                  </span>
                  <span className="text-[10px] tracking-widest text-ink-muted">
                    {formatRelativeTime(r.last_encountered_at)}・累計 {r.encounter_count} 回
                  </span>
                  {r.message && (
                    <span className="truncate text-xs text-ink-soft">{r.message}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
