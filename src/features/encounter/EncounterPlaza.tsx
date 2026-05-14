'use client';

/**
 * 横スクロール 2D の広場ビュー。
 *
 * spec: docs/specs/encounter-plaza.md
 *
 * - 住人 0 人: 空状態 UI + ウォークモード導線
 * - 住人 1+: 横スクロール上に均等配置、各住人は自律行動
 * - タップで詳細パネル (ボトムシート)
 *
 * MVP では背景 1 層 + 地面ラインに留め、3 層パララックス / 街灯 / 桜などは
 * Phase 2 で強化 (§7 オープン課題)。
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { HistoryItem } from '@/types/encounter';
import { PlazaDetailPanel } from './PlazaDetailPanel';
import { PlazaResident } from './PlazaResident';

// ステージは住人密度を一定 (1 人あたり PX_PER_RESIDENT) に保ちつつ広がる。
// 仕様 §4.1: 「画面幅 × ceil(住人数 / 30)」は viewport ピッチが粗く、
// 32 人と 60 人で見た目が変わらない欠点があったので比例計算に切替。
const MIN_STAGE_WIDTH = 800;
const PX_PER_RESIDENT = 50;
const STAGE_HEIGHT = 260;
const GROUND_HEIGHT = 48;
const RESIDENT_SIZE = 72;

type Props = {
  residents: HistoryItem[];
};

export function EncounterPlaza({ residents }: Props) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  if (residents.length === 0) {
    return <EmptyState />;
  }

  return (
    <PlazaStage
      residents={residents}
      onTap={setSelected}
      selected={selected}
      onClose={() => setSelected(null)}
    />
  );
}

function PlazaStage({
  residents,
  onTap,
  selected,
  onClose,
}: {
  residents: HistoryItem[];
  onTap: (r: HistoryItem) => void;
  selected: HistoryItem | null;
  onClose: () => void;
}) {
  const stageWidth = Math.max(MIN_STAGE_WIDTH, residents.length * PX_PER_RESIDENT);

  const positions = useMemo(() => {
    const margin = 60;
    const usable = stageWidth - margin * 2;
    const step = usable / Math.max(1, residents.length);
    return residents.map((r, i) => {
      const baseX = margin + step * (i + 0.5);
      // user_id から決定論的なジッタ ±20px
      let acc = 0;
      for (const c of r.user_id) acc = (acc * 31 + c.charCodeAt(0)) >>> 0;
      const jitter = (acc % 40) - 20;
      return baseX + jitter;
    });
  }, [residents, stageWidth]);

  return (
    <div className="relative">
      <div className="overflow-x-auto overflow-y-hidden rounded-toy border border-cream-deep shadow-toy">
        <div
          className="relative bg-gradient-to-b from-orange-200 via-orange-100 to-yellow-50"
          style={{ width: stageWidth, height: STAGE_HEIGHT }}
          data-testid="plaza-stage"
        >
          {/* 地面 */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-emerald-200/70"
            style={{ height: GROUND_HEIGHT }}
          />
          {/* 住人 */}
          {residents.map((r, i) => (
            <PlazaResident
              key={r.user_id}
              userId={r.user_id}
              avatarCode={r.avatar_code}
              initialX={positions[i]!}
              stageWidth={stageWidth}
              size={RESIDENT_SIZE}
              onTap={() => onTap(r)}
            />
          ))}
        </div>
      </div>

      <PlazaDetailPanel resident={selected} onClose={onClose} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-toy border border-dashed border-cream-deep bg-cream-soft p-8 text-center shadow-toy">
      <p className="text-base font-bold text-ink-soft">
        歩き出すと、ここに住人が増えていきます
      </p>
      <Link
        href="/walk"
        className="rounded-toy border-2 border-pop-blue bg-pop-blue px-5 py-2 font-black tracking-wider text-cream-soft shadow-toy-lg transition active:translate-y-[3px] active:shadow-none"
      >
        ウォークモードを始める
      </Link>
    </div>
  );
}
