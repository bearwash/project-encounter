'use client';

/**
 * Avatar — avatar_code を 4 軸 SVG パーツに分解し、重ね合わせて表示する。
 *
 * 描画方式: SVG パーツの重ね合わせ + CSS @keyframes アニメーション
 * (spec: docs/specs/avatar.md §2)
 *
 * - mode='idle'    : 呼吸 + まばたき
 * - mode='walking' : idle + 足踏み
 * - mode='popup'   : 左から入場 → 足踏み → 呼吸 + まばたき
 *
 * パーツ SVG は public/avatars/{file} を fetch し、`<svg>` の中身だけを
 * `<g class="layer-{axis}">` に展開する。同パスは Map でキャッシュ。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AXES, manifest, type AxisKey } from '@/lib/avatar/manifest';
import { resolveAvatarCode } from '@/lib/avatar/fallback';

export type AvatarMode = 'idle' | 'walking' | 'popup';

type Props = {
  code: string;
  mode?: AvatarMode;
  /** 描画幅 (px)。高さは viewBox 比率 (64:96) に合わせる */
  size?: number;
  className?: string;
};

const svgInnerCache = new Map<string, Promise<string>>();

function extractSvgInner(raw: string): string {
  const match = raw.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  return match ? match[1]! : '';
}

function loadPartInner(file: string): Promise<string> {
  let cached = svgInnerCache.get(file);
  if (!cached) {
    cached = fetch(`/avatars/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`avatar part ${file}: ${r.status}`);
        return r.text();
      })
      .then(extractSvgInner)
      .catch((err) => {
        // 失敗時は空文字を返してクラッシュ禁止 (spec §6)
        // eslint-disable-next-line no-console
        console.warn('[Avatar] failed to load part', file, err);
        return '';
      });
    svgInnerCache.set(file, cached);
  }
  return cached;
}

export function Avatar({ code, mode = 'idle', size = 64, className = '' }: Props) {
  const resolved = useMemo(() => resolveAvatarCode(code), [code]);

  const [layers, setLayers] = useState<Record<AxisKey, string>>({
    base: '',
    hair: '',
    outfit: '',
    face: '',
  });

  // 古い fetch が後から resolve して新しい code を上書きしないよう、世代でガード
  const genRef = useRef(0);

  useEffect(() => {
    const myGen = ++genRef.current;

    Promise.all(
      manifest.layerOrder.map(async (axis) => {
        const part = manifest.axes[axis].find((p) => p.id === resolved[axis]);
        const html = part ? await loadPartInner(part.file) : '';
        return [axis, html] as const;
      })
    ).then((entries) => {
      if (myGen !== genRef.current) return;
      const next = { base: '', hair: '', outfit: '', face: '' } as Record<AxisKey, string>;
      for (const [a, h] of entries) next[a] = h;
      setLayers(next);
    });
  }, [resolved]);

  const height = Math.round((size * 96) / 64);

  return (
    <div
      className={`avatar-root avatar-mode-${mode} ${className}`}
      style={{ width: size, height }}
      aria-label={`avatar ${code}`}
      role="img"
    >
      <svg
        className="avatar-figure"
        viewBox={manifest.viewBox}
        width={size}
        height={height}
        preserveAspectRatio="xMidYMid meet"
      >
        {AXES.map((axis) => {
          const anchorName = manifest.layerAnchor[axis];
          const anchor = anchorName ? manifest.anchors[anchorName] : null;
          const transform = anchor ? `translate(${anchor.x} ${anchor.y})` : undefined;
          return (
            <g
              key={axis}
              className={`layer-${axis}`}
              transform={transform}
              dangerouslySetInnerHTML={{ __html: layers[axis] }}
            />
          );
        })}
      </svg>
    </div>
  );
}
