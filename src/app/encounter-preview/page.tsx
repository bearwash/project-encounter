'use client';

/**
 * EncounterPopup (公園入口の対面挨拶シーン) の dev only プレビューページ。
 * spec: docs/specs/encounter-popup.md
 *
 * - 件数プリセット (1 / 3 / 20 / 25 / 60) で 20 人区切り・「会いにいく」を検証
 * - 「再起動」ボタンで snapshot を初期化
 * - markRead は DB を持たない (Tauri 外) ので useMarkRead 内で no-op
 */
import { useMemo, useState } from 'react';
import { EncounterPopup } from '@/features/encounter/EncounterPopup';
import { makeRng } from '@/lib/avatar/random';
import { DEFAULT_AVATAR_CODE } from '@/types/profile';
import type { UnreadEncounter } from '@/types/encounter';

const COUNT_PRESETS = [1, 3, 20, 25, 60] as const;

const SAMPLE_NAMES = [
  'Neko-9', 'Riku', 'sora', 'Pixel.42', 'mion', 'zoo', 'Hex',
  'もも', 'はる', 'たくみ', 'Aoba', 'Lin', 'Yui', 'Kai', 'のあ', 'Rio',
];
const SAMPLE_MESSAGES = [
  '最近はRust勉強中！',
  'こんにちは',
  '散歩中です',
  '',
  '今日は寒い',
  'すれ違いテスト',
  'ねむい',
  '公園にいます',
  'コーヒー飲みたい',
];

function makeMockItems(count: number): UnreadEncounter[] {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => {
    const rng = makeRng(`enc-${i}`);
    const b = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const h = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const o = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const f = String(1 + Math.floor(rng() * 4)).padStart(2, '0');
    const name = SAMPLE_NAMES[Math.floor(rng() * SAMPLE_NAMES.length)]!;
    const msg = SAMPLE_MESSAGES[Math.floor(rng() * SAMPLE_MESSAGES.length)]!;
    // 半数程度はリピーター (count >= 2) になるようにして高ハイタッチ率
    const ec = 1 + Math.floor(rng() * 8);
    const prefIdx = Math.floor(rng() * 48); // 0=未設定
    return {
      log_id: i + 1,
      encountered_at: now - i * 60,
      user: {
        user_id: `mock-${i.toString().padStart(4, '0')}`,
        display_name: `${name}#${i}`,
        avatar_code: `b${b}_h${h}_o${o}_f${f}`,
        message: msg,
        home_prefecture:
          prefIdx === 0 ? null : String(prefIdx).padStart(2, '0'),
        encounter_count: ec,
        first_seen_at: now - i * 86400,
        last_seen_at: now - i * 60,
      },
    };
  });
}

export default function EncounterPreviewPage() {
  const [count, setCount] = useState<number>(3);
  const [generation, setGeneration] = useState(0);
  const items = useMemo(() => makeMockItems(count), [count]);
  const [closed, setClosed] = useState(false);

  // 起動時の SVG 読み込みなどを毎回リセットしたい場合用 (key で remount)
  const restart = () => {
    setGeneration((g) => g + 1);
    setClosed(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black tracking-wide text-pop-red">
          ENCOUNTER PREVIEW
        </h1>
        <span className="text-xs font-bold text-ink-muted">
          未読 {count} 件 / 残{count > 20 ? ` セッション後 ${count - 20} 件` : ''}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {COUNT_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setCount(n);
              restart();
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
          onClick={restart}
          className="rounded-toy border-2 border-pop-blue bg-cream-soft px-3 py-1.5 text-xs font-black tracking-widest text-pop-blue shadow-toy transition active:translate-y-[2px] active:shadow-none"
        >
          再起動
        </button>
      </div>

      <p className="text-xs leading-relaxed text-ink-soft">
        画面のどこかをタップで次へ。20 人ごとに「会いにいく」、最後で「広場へ入る」が出る。
        広場へ入るとプレビューでは閉じる挙動のみ (本番では Plaza へクロスフェード)。
      </p>

      {/* スマホ縦長フレーム (iPhone 13 相当 390x844) で実機表示に近づける */}
      <div
        className="relative mx-auto overflow-hidden rounded-[36px] border-[10px] border-ink bg-cream shadow-toy-lg"
        style={{ width: 390, height: 720 }}
        data-testid="phone-frame"
      >
        {!closed ? (
          <EncounterPopup
            key={generation}
            items={items}
            myAvatarCode={DEFAULT_AVATAR_CODE}
            onClose={() => setClosed(true)}
            onEnterPlaza={() => setClosed(true)}
          />
          /* preview では合流アニメは検証しない (Plaza が同時に出ないため)。
             ID 配列は捨てる */
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-ink-soft">
            シーンを閉じました。「再起動」で再表示。
          </div>
        )}
      </div>
    </main>
  );
}
