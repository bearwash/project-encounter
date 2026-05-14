'use client';

import { formatRelativeTime } from '@/lib/format/relative-time';
import { Avatar } from './Avatar';
import { useEncounterHistory } from './queries';

export function EncounterList() {
  const { data, isLoading, error } = useEncounterHistory();

  if (isLoading) {
    return <div className="p-2 text-sm text-ink-muted">読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="p-2 text-sm font-bold text-pop-red">
        履歴の取得に失敗しました: {error.message}
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p className="text-sm font-bold text-ink-soft">
          まだすれ違いの記録がありません
        </p>
        <p className="text-xs text-ink-muted">
          歩き出すと、ここに記録が増えていきます
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-cream-deep">
      {items.map((u) => (
        <li key={u.user_id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
          <Avatar code={u.avatar_code} size={48} animated={false} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-bold text-ink">
                {u.display_name}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {formatRelativeTime(u.last_encountered_at)}
              </span>
            </div>
            {u.message && (
              <p className="truncate text-xs text-ink-soft">{u.message}</p>
            )}
          </div>
          {u.encounter_count > 1 && (
            <span className="shrink-0 rounded-full bg-pop-yellow px-2 py-0.5 text-[10px] font-bold tracking-wider text-ink">
              ×{u.encounter_count}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
