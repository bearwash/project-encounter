/**
 * カラー共通定数 — voxel 3D アバターのパレット基底。
 * パーツカタログ (catalog.ts) は各バリアントの既定色をここから合成する。
 */

export const INK = '#000000';
export const OUTLINE_DEFAULT = 0.04;

/** スキントーン (Base 軸 b01-b04 で使用)。 */
export const SKIN_PALETTE = {
  b01: '#F4C9A0', // 標準
  b02: '#D9A77A', // やや日焼け
  b03: '#B07B52', // ブラウン
  b04: '#F7D4B5', // peach (S001 デフォルト)
} as const;

/** ヘアカラー (Hair 軸 h01-h06 の primary)。 */
export const HAIR_PRIMARY = {
  h01: '#5A3A22', // ダークブラウン
  h02: '#1A1A1F', // 黒
  h03: '#E8C570', // 金
  h04: '#C84A4A', // 赤
  h05: '#A6D78D', // mint green (S001 左半分)
  h06: '#D8D6E0', // 銀
} as const;

/** Hair h05 のセカンダリ (バイカラー右半分)。 */
export const HAIR_SECONDARY = {
  h05: '#F4A4C3', // soft pink (S001 右半分)
} as const;

/** Outfit (トップ) パレット。各 ID は { top, bottom, shoeUpper, shoeSole } をフルセット。 */
export const OUTFIT_PALETTE = {
  o01: {
    top: '#3FBFD1',
    bottom: '#1F3A60',
    shoeUpper: '#1F1A14',
    shoeSole: '#F0E8D8',
  },
  o02: {
    top: '#FF7AA8',
    bottom: '#3A2A45',
    shoeUpper: '#5C3F25',
    shoeSole: '#EFE6D2',
  },
  o03: {
    top: '#F5F1E3',
    bottom: '#52483B',
    shoeUpper: '#2A2620',
    shoeSole: '#EFEAE0',
  },
  o04: {
    // S001 — 黒パーカー + デニム + ハイカット (dark upper + white sole)
    top: '#1B1A1F',
    bottom: '#5F7BB4',
    shoeUpper: '#222026',
    shoeSole: '#EFEAE0',
  },
} as const;

export type SkinId = keyof typeof SKIN_PALETTE;
export type HairId = keyof typeof HAIR_PRIMARY;
export type OutfitId = keyof typeof OUTFIT_PALETTE;
