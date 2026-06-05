'use client';

/**
 * 出身県セレクタ (任意項目)。
 * spec: docs/specs/regional-map.md / docs/specs/profile.md §4.2
 *
 * - 「未設定 (非公開)」を先頭に置き、47 都道府県を地方ごとに optgroup でグループ化。
 * - 値は `code` ("01"〜"47") または空文字 (= null)。
 */

import { PREFECTURES, REGION_ORDER, type Region } from '@/lib/prefecture/data';

type Props = {
  value: string | null;
  onChange: (next: string | null) => void;
  id?: string;
};

export function PrefectureSelect({ value, onChange, id }: Props) {
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="w-full rounded-toy border border-cream-deep bg-cream-soft px-3 py-2 text-ink shadow-toy focus:border-pop-red focus:outline-none"
    >
      <option value="">未設定（非公開）</option>
      {REGION_ORDER.map((region) => (
        <optgroup key={region} label={region}>
          {PREFECTURES.filter((p) => p.region === region as Region).map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
