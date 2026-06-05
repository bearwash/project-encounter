'use client';

/**
 * 日本地図ビュー (出会った人のコレクション)。
 * spec: docs/specs/regional-map.md
 *
 * - 広場 (HomePage) のヘッダー 🗾 ボタン から遷移
 * - 47 都道府県のタイルマップ + 県別の住人リスト
 * - 自分の出身県は黄色枠で強調
 */

import Link from 'next/link';
import { useEncounterHistory } from '@/features/encounter/queries';
import { useProfile } from '@/features/profile/queries';
import { RegionalMap } from '@/features/regional-map/RegionalMap';

export default function MapPage() {
  const profile = useProfile();
  const history = useEncounterHistory();

  return (
    <main className="fixed inset-0 overflow-hidden bg-cream">
      <RegionalMap
        residents={history.data ?? []}
        myHomePrefecture={profile.data?.home_prefecture ?? null}
      />
      {/* 戻る */}
      <Link
        href="/"
        aria-label="広場に戻る"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-cream-deep bg-cream-soft text-lg font-black text-ink-soft shadow-toy transition active:translate-y-[2px] active:shadow-none"
      >
        ×
      </Link>
    </main>
  );
}
