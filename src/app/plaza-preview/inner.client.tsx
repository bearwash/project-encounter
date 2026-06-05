'use client';

/**
 * EncounterPlaza の dev only プレビューページ。
 * 住人数を切り替えて空状態 / 1 人 / 多数の挙動を目視確認できる。
 */
import { useMemo, useState } from 'react';
import { EncounterPlaza3D as EncounterPlaza } from '@/features/encounter/EncounterPlaza3D';
import { makeRng } from '@/lib/avatar/random';
import type { HistoryItem } from '@/types/encounter';

const COUNT_PRESETS = [0, 1, 8, 32, 60] as const;

const SAMPLE_NAMES = [
  'Neko-9', 'Riku', 'sora', 'Pixel.42', 'mion', 'zoo', 'Hex',
  'もも', 'はる', 'たくみ', 'Aoba', 'Lin', 'Yui', 'Kai', 'のあ', 'Rio',
];
const SAMPLE_MESSAGES = [
  '最近はRust勉強中！',
  'こんにちは',
  '散歩中',
  '',
  '今日は寒い',
  'すれ違いテスト',
  'ねむい',
  '公園にいます',
];

function makeMockResidents(count: number): HistoryItem[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => {
    const rng = makeRng(`mock-${i}`);
    const b = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const h = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const o = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const f = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const name = SAMPLE_NAMES[Math.floor(rng() * SAMPLE_NAMES.length)]!;
    const message = SAMPLE_MESSAGES[Math.floor(rng() * SAMPLE_MESSAGES.length)]!;
    const daysAgo = Math.floor(rng() * 14);
    const prefIdx = Math.floor(rng() * 48); // 0=未設定 + 1..47
    return {
      user_id: `mock-${i.toString().padStart(4, '0')}`,
      display_name: `${name}#${i}`,
      avatar_code: `b${b}_h${h}_o${o}_f${f}`,
      message,
      home_prefecture:
        prefIdx === 0 ? null : String(prefIdx).padStart(2, '0'),
      encounter_count: 1 + Math.floor(rng() * 12),
      first_seen_at: now - daysAgo * 86400,
      last_seen_at: now - Math.floor(rng() * 3600),
      last_encountered_at: now - Math.floor(rng() * 3600),
    };
  });
}

export default function PlazaPreviewPage() {
  const [count, setCount] = useState<number>(8);
  const residents = useMemo(() => makeMockResidents(count), [count]);
  // 合流アニメ検証用 (encounter-plaza.md §4.4)。
  // 「合流テスト」ボタンで全住人を「ゲートからフレームイン」状態に戻す。
  const [joiningIds, setJoiningIds] = useState<string[]>([]);
  // mount 識別: residents が再生成されると key が変わるので合流アニメ自体は
  // 自然にリセットされる。
  const [generation, setGeneration] = useState(0);

  const startJoinDemo = () => {
    setJoiningIds(residents.map((r) => r.user_id));
    setGeneration((g) => g + 1);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black tracking-wide text-pop-red">PLAZA PREVIEW</h1>
        <span className="text-xs font-bold text-ink-muted">住人 {count} 人</span>
      </header>

      <div className="flex flex-wrap gap-2">
        {COUNT_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setCount(n);
              setJoiningIds([]);
            }}
            data-testid={`count-${n}`}
            className={`rounded-toy border-2 px-3 py-1.5 text-xs font-black tracking-widest shadow-toy transition active:translate-y-[2px] active:shadow-none ${
              count === n
                ? 'border-pop-red bg-pop-red text-cream-soft'
                : 'border-cream-deep bg-cream-soft text-ink-soft'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={startJoinDemo}
          className="rounded-toy border-2 border-pop-blue bg-cream-soft px-3 py-1.5 text-xs font-black tracking-widest text-pop-blue shadow-toy transition active:translate-y-[2px] active:shadow-none"
          data-testid="join-demo"
        >
          合流アニメを再生
        </button>
      </div>

      <div
        key={generation}
        className="h-[480px] overflow-hidden rounded-toy border border-cream-deep shadow-toy"
      >
        <EncounterPlaza residents={residents} joiningIds={joiningIds} />
      </div>
    </main>
  );
}
