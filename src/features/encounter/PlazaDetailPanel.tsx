'use client';

import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  REPORT_REASONS,
  type ReportReason,
} from '@/features/safety/moderation';
import { formatRelativeTime } from '@/lib/format/relative-time';
import { lookupPrefecture } from '@/lib/prefecture/data';
import type { HistoryItem } from '@/types/encounter';

type Props = {
  resident: HistoryItem | null;
  onClose: () => void;
  onBlock: (resident: HistoryItem) => Promise<void>;
  onReport: (
    resident: HistoryItem,
    reason: ReportReason,
  ) => Promise<{ delivered: boolean }>;
};

const CLOSE_DRAG_PX = 80;

export function PlazaDetailPanel({ resident, onClose, onBlock, onReport }: Props) {
  const [safetyMode, setSafetyMode] = useState<'report' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSafetyMode(null);
    setBusy(false);
    setNotice(null);
    setError(null);
  }, [resident?.user_id]);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > 500) onClose();
  };

  const report = async (reason: ReportReason) => {
    if (!resident) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onReport(resident, reason);
      setNotice(
        result.delivered
          ? '通報を受け付けました。内容を確認します。'
          : '通報を端末に保存しました。通信できる状態で再送してください。',
      );
      setSafetyMode(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : '通報を送れませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!resident) return;
    setBusy(true);
    setError(null);
    try {
      await onBlock(resident);
      onClose();
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : 'ブロックできませんでした。');
      setBusy(false);
    }
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

            {safetyMode === 'report' && (
              <div className="messenger-dialog-safety-sheet" role="group" aria-label="通報理由">
                <strong>通報する理由を選んでください</strong>
                <div>
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => report(reason.value)}
                      disabled={busy}
                    >
                      {reason.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setSafetyMode(null)} disabled={busy}>キャンセル</button>
              </div>
            )}

            {safetyMode === 'block' && (
              <div className="messenger-dialog-safety-sheet messenger-dialog-safety-sheet--danger" role="group" aria-label="ブロックの確認">
                <strong>{resident.display_name} をブロックしますか？</strong>
                <p>今後、挨拶・広場・タワーに表示されません。</p>
                <div>
                  <button type="button" onClick={block} disabled={busy}>ブロックする</button>
                  <button type="button" onClick={() => setSafetyMode(null)} disabled={busy}>キャンセル</button>
                </div>
              </div>
            )}

            {notice && <p className="messenger-dialog-safety-notice" role="status">{notice}</p>}
            {error && <p className="messenger-dialog-safety-error" role="alert">{error}</p>}

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
              <div className="messenger-dialog-safety-actions">
                <button type="button" onClick={() => setSafetyMode('report')}>通報</button>
                <button type="button" onClick={() => setSafetyMode('block')}>ブロック</button>
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
