'use client';

import { formatRelativeTime } from '@/lib/format/relative-time';
import { Avatar } from './Avatar';
import { useEncounterHistory } from './queries';

export function EncounterList() {
  const { data, isLoading, error } = useEncounterHistory();

  if (isLoading) {
    return <div className="text-sm text-neutral-500">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-neon-pink">
        履歴の取得に失敗しました: {error.message}
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded border border-dashed border-neutral-800 p-8 text-center">
        <p className="text-sm text-neutral-400">
          まだすれ違いの記録がありません
        </p>
        <p className="text-xs text-neutral-600">
          歩き出すと、ここに記録が増えていきます
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-900">
      {items.map((u) => (
        <li
          key={u.user_id}
          className="flex items-center gap-3 py-3"
        >
          <Avatar code={u.avatar_code} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-white">
                {u.display_name}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {formatRelativeTime(u.last_encountered_at)}
              </span>
            </div>
            {u.message && (
              <p className="truncate text-xs text-neutral-400">{u.message}</p>
            )}
          </div>
          {u.encounter_count > 1 && (
            <span className="shrink-0 rounded-full border border-neon/40 px-2 py-0.5 text-[10px] tracking-widest text-neon">
              ×{u.encounter_count}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
