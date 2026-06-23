'use client';

import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { formatRelativeTime } from '@/lib/format/relative-time';
import { lookupPrefecture } from '@/lib/prefecture/data';
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

  const pref = resident ? lookupPrefecture(resident.home_prefecture)?.name : null;
  const message =
    resident?.message ||
    (resident ? `${resident.display_name} とすれちがいました。` : '');

  return (
    <AnimatePresence>
      {resident && (
        <motion.div
          initial={{ y: 42, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 34, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.42 }}
          onDragEnd={handleDragEnd}
          data-testid="plaza-detail-panel"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(94vw,760px)] px-3 sm:bottom-7"
        >
          <div className="messenger-dialog pointer-events-auto">
            <div className="messenger-dialog-name">
              {resident.display_name}
            </div>

            <button
              type="button"
              aria-label="close dialog"
              className="messenger-dialog-close"
              onClick={onClose}
            >
              <span aria-hidden />
            </button>

            <div className="messenger-dialog-text">
              {message}
            </div>

            <div className="messenger-dialog-footer">
              <div className="messenger-dialog-meta">
                {pref && (
                  <span data-testid="plaza-detail-pref">
                    {pref}
                  </span>
                )}
                <span>
                  {resident.encounter_count}回
                </span>
                <span>
                  {formatRelativeTime(resident.last_encountered_at)}
                </span>
              </div>
              <button
                type="button"
                aria-label="next"
                className="messenger-dialog-next"
                onClick={onClose}
              >
                <span aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
