'use client';

/**
 * 広場の住人詳細パネル (ボトムシート)。
 *
 * spec: docs/specs/encounter-plaza.md §4.5
 *
 * - 高さ 40vh、画面下から Framer Motion でスライドアップ
 * - パネル外タップ or 下スワイプで閉じる
 */
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { Avatar } from './Avatar';
import { formatRelativeTime } from '@/lib/format/relative-time';
import { prefectureLabel } from '@/lib/prefecture/data';
import type { HistoryItem } from '@/types/encounter';

type Props = {
  resident: HistoryItem | null;
  onClose: () => void;
};

const CLOSE_DRAG_PX = 80;

export function PlazaDetailPanel({ resident, onClose }: Props) {
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > 500) onClose();
  };

  return (
    <AnimatePresence>
      {resident && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            // ゲーム的な「シュッ! ポヨン」スプリング (Neo-Brutalism と整合)
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            data-testid="plaza-detail-panel"
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-toy border-t-2 border-cream-deep bg-cream-soft p-5 shadow-toy-lg"
            style={{ height: '40vh' }}
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-cream-deep" />

            <div className="flex items-center gap-4">
              <Avatar code={resident.avatar_code} size={96} />
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="truncate text-xl font-black tracking-wide text-ink">
                  {resident.display_name}
                </h2>
                {prefectureLabel(resident.home_prefecture) && (
                  <span
                    className="text-xs font-bold text-ink-soft"
                    data-testid="plaza-detail-pref"
                  >
                    {prefectureLabel(resident.home_prefecture)}
                  </span>
                )}
                <span className="text-xs font-bold text-ink-muted">
                  最終すれちがい: {formatRelativeTime(resident.last_encountered_at)}
                </span>
                {resident.first_seen_at !== resident.last_encountered_at && (
                  <span className="text-xs font-bold text-ink-muted">
                    初対面: {formatRelativeTime(resident.first_seen_at)}
                  </span>
                )}
                <span className="text-xs font-black text-pop-red">
                  累計 {resident.encounter_count} 回
                </span>
              </div>
            </div>

            {resident.message && (
              <p className="rounded-toy border border-cream-deep bg-cream px-4 py-3 text-sm text-ink-soft">
                {resident.message}
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
