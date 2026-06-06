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
  findBase,
  findHair,
  findOutfit,
  type AxisKey as CatalogAxisKey,
} from '@/features/encounter/parts/catalog';
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

      <div className="game-hud relative overflow-hidden rounded-[22px] p-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeAxis}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            // タブ切り替えを「シュッ!」と気持ちよく
            transition={{ type: 'spring', stiffness: 520, damping: 26, mass: 0.6 }}
            className="grid grid-cols-4 gap-2"
          >
            {manifest.axes[activeAxis].map((part) => {
              const selected = parts[activeAxis] === part.id;
              return (
                <PartSwatch
                  key={part.id}
                  axis={activeAxis}
                  id={part.id}
                  label={part.label}
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
    <div className="game-hud flex items-center justify-center rounded-[22px] p-4">
      <motion.div
        key={code}
        initial={{ y: -16, scale: 0.9 }}
        animate={{ y: 0, scale: 1 }}
        // パーツ変更を「ポヨン!」と弾ませる (stiffness↑ damping↓)
        transition={{ type: 'spring', stiffness: 520, damping: 14, mass: 0.6 }}
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
      transition={{ type: 'spring', stiffness: 600, damping: 18 }}
      className={`flex-1 rounded-full px-3 py-2 text-sm font-black tracking-wider transition-[transform,box-shadow] active:translate-y-[2px] ${
        active
          ? 'game-button game-button-danger text-cream-soft'
          : 'game-chip text-ink-soft'
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
  selected,
  onClick,
}: {
  axis: AxisKey;
  id: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      animate={selected ? { scale: 1.08 } : { scale: 1 }}
      // 選択時のポヨン (stiffness↑ damping↓ で弾む)。spring は 2 keyframe のみ対応。
      transition={{ type: 'spring', stiffness: 560, damping: 14 }}
      data-testid={`pick-${axis}-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-1 rounded-[18px] p-1.5 transition active:translate-y-[2px] ${
        selected
          ? 'game-button game-button-danger'
          : 'game-chip'
      }`}
    >
      <PartSwatchPreview axis={axis} id={id} />
      <span className={`text-[10px] font-black tracking-widest ${selected ? 'text-cream-soft' : 'text-ink-soft'}`}>
        {id}
      </span>
    </motion.button>
  );
}

function PartSwatchPreview({ axis, id }: { axis: CatalogAxisKey; id: string }) {
  if (axis === 'base') {
    const base = findBase(id);
    return (
      <div
        className="h-12 w-12 rounded-full border-2 border-cream-deep shadow-inner"
        style={{ backgroundColor: base.skin }}
        aria-hidden="true"
      />
    );
  }

  if (axis === 'hair') {
    const hair = findHair(id);
    return (
      <div
        className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-cream-deep bg-cream shadow-inner"
        aria-hidden="true"
      >
        <div
          className="absolute inset-x-1 top-2 h-6 rounded-t-full rounded-b-md"
          style={{ backgroundColor: hair.colors.primary }}
        />
        {hair.colors.secondary && (
          <div
            className="absolute right-1 top-2 h-6 w-5 rounded-tr-full rounded-bl-md"
            style={{ backgroundColor: hair.colors.secondary }}
          />
        )}
      </div>
    );
  }

  if (axis === 'outfit') {
    const outfit = findOutfit(id);
    return (
      <div
        className="flex h-12 w-12 flex-col overflow-hidden rounded-toy border-2 border-cream-deep shadow-inner"
        aria-hidden="true"
      >
        <div className="h-7" style={{ backgroundColor: outfit.colors.top }} />
        <div className="h-3" style={{ backgroundColor: outfit.colors.bottom }} />
        <div className="h-2" style={{ backgroundColor: outfit.colors.shoeUpper }} />
      </div>
    );
  }

  const faceLabel: Record<string, string> = {
    '01': ':)',
    '02': ':o',
    '03': ':]',
    '04': ';)',
  };

  return (
    <div
      className="grid h-12 w-12 place-items-center rounded-full border-2 border-cream-deep bg-cream text-sm font-black text-ink shadow-inner"
      aria-hidden="true"
    >
      {faceLabel[id] ?? ':)'}
    </div>
  );
}
