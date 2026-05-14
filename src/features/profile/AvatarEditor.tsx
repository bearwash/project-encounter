'use client';

/**
 * AvatarEditor — 4 軸 × 4 種のパーツを選んでアバターを組み立てる純粋 UI。
 *
 * spec: docs/specs/avatar.md §8
 *
 * - 上部: プレビューエリア (Avatar mode=idle)、軸変更で Framer Motion バウンス
 * - 下部: タブ (Base / Hair / Outfit / Face) + パーツ選択グリッド
 * - 保存などの永続化は呼び出し側 (props.onSave) に委ねる
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Avatar } from '@/features/encounter/Avatar';
import {
  avatarCodeFromParts,
  resolveAvatarCode,
  type ResolvedAvatar,
} from '@/lib/avatar/fallback';
import { AXES, manifest, type AxisKey } from '@/lib/avatar/manifest';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  savePending?: boolean;
  /** 編集中の avatar_code をモノスペースで表示する (デバッグ + マニア向け) */
  showCode?: boolean;
  /** タブグリッドにスクロールできるよう高さ制約をかける場合に使う */
  className?: string;
};

const TAB_LABEL: Record<AxisKey, string> = {
  base: 'Base',
  hair: 'Hair',
  outfit: 'Outfit',
  face: 'Face',
};

export function AvatarEditor({
  value,
  onChange,
  onSave,
  savePending = false,
  showCode = true,
  className = '',
}: Props) {
  const parts = useMemo(() => resolveAvatarCode(value), [value]);
  const code = useMemo(() => avatarCodeFromParts(parts), [parts]);

  const [activeAxis, setActiveAxis] = useState<AxisKey>('base');

  const handlePick = (axis: AxisKey, id: string) => {
    const next: ResolvedAvatar = { ...parts, [axis]: id };
    onChange(avatarCodeFromParts(next));
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <PreviewArea code={code} />

      <div className="flex gap-2">
        {AXES.map((axis) => (
          <TabButton
            key={axis}
            active={activeAxis === axis}
            label={TAB_LABEL[axis]}
            onClick={() => setActiveAxis(axis)}
          />
        ))}
      </div>

      <div className="relative overflow-hidden rounded-toy border border-cream-deep bg-cream-soft p-3 shadow-toy">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeAxis}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-4 gap-2"
          >
            {manifest.axes[activeAxis].map((part) => {
              const swatchCode = avatarCodeFromParts({ ...parts, [activeAxis]: part.id });
              const selected = parts[activeAxis] === part.id;
              return (
                <PartSwatch
                  key={part.id}
                  axis={activeAxis}
                  id={part.id}
                  label={part.label}
                  swatchCode={swatchCode}
                  selected={selected}
                  onClick={() => handlePick(activeAxis, part.id)}
                />
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {showCode && (
        <code className="self-center font-mono text-xs text-ink-muted" data-testid="avatar-code">
          {code}
        </code>
      )}

      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={savePending}
          className="rounded-toy border-2 border-pop-red bg-pop-red px-4 py-2.5 font-black tracking-wider text-cream-soft shadow-toy-lg transition active:translate-y-[3px] active:shadow-none disabled:opacity-50"
        >
          {savePending ? '保存中…' : '保存'}
        </button>
      )}
    </div>
  );
}

function PreviewArea({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-center rounded-toy border border-cream-deep bg-cream-soft p-4 shadow-toy">
      <motion.div
        key={code}
        initial={{ y: -12 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      >
        <Avatar code={code} mode="idle" size={160} />
      </motion.div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className={`flex-1 rounded-toy border-2 px-3 py-1.5 text-sm font-black tracking-wider shadow-toy transition active:translate-y-[2px] active:shadow-none ${
        active
          ? 'border-pop-red bg-pop-red text-cream-soft'
          : 'border-cream-deep bg-cream-soft text-ink-soft'
      }`}
    >
      {label}
    </motion.button>
  );
}

function PartSwatch({
  axis,
  id,
  label,
  swatchCode,
  selected,
  onClick,
}: {
  axis: AxisKey;
  id: string;
  label: string;
  swatchCode: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      animate={selected ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.2 }}
      data-testid={`pick-${axis}-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded-toy border-2 p-1.5 shadow-toy transition active:translate-y-[2px] active:shadow-none ${
        selected
          ? 'border-pop-red bg-pop-red/10'
          : 'border-cream-deep bg-cream-soft'
      }`}
    >
      <div className="pointer-events-none">
        <Avatar code={swatchCode} mode="idle" size={48} />
      </div>
      <span className={`text-[10px] font-bold tracking-widest ${selected ? 'text-pop-red' : 'text-ink-soft'}`}>
        {id}
      </span>
    </motion.button>
  );
}
