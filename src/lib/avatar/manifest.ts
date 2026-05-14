/**
 * public/avatars/manifest.json を型付きで読み込む。
 * spec: docs/specs/avatar.md §3.5
 */
import manifestJson from '../../../public/avatars/manifest.json';

export type AxisKey = 'base' | 'hair' | 'outfit' | 'face';

export type PartDef = {
  id: string;
  file: string;
  label: string;
};

export type Anchor = { x: number; y: number };

export type AvatarManifest = {
  version: number;
  viewBox: string;
  anchors: Record<string, Anchor>;
  sizes: Record<string, number>;
  /** どの軸がどのアンカーを原点とするか。null は viewBox 絶対座標 */
  layerAnchor: Record<AxisKey, string | null>;
  axes: Record<AxisKey, PartDef[]>;
  defaultCode: string;
  layerOrder: AxisKey[];
};

export const manifest = manifestJson as AvatarManifest;

export const AXES: readonly AxisKey[] = ['base', 'hair', 'outfit', 'face'] as const;

export const AXIS_PREFIX: Record<AxisKey, string> = {
  base: 'b',
  hair: 'h',
  outfit: 'o',
  face: 'f',
};

export const PREFIX_TO_AXIS: Record<string, AxisKey> = {
  b: 'base',
  h: 'hair',
  o: 'outfit',
  f: 'face',
};

export function findPart(axis: AxisKey, id: string): PartDef | undefined {
  return manifest.axes[axis].find((p) => p.id === id);
}
