/**
 * パーツカタログ — 各軸 (base/hair/outfit/face) の利用可能 ID 一覧 + ラベル + 既定色。
 *
 * 「パーツ選択 = 色選択」のため、各ヘアバリアント等は固有の色を持つ。
 * 個別カスタマイズが必要になったら catalog エントリを増やすか、別 prop で上書きする。
 */

import {
  HAIR_PRIMARY,
  HAIR_SECONDARY,
  OUTFIT_PALETTE,
  SKIN_PALETTE,
  type HairId,
  type OutfitId,
  type SkinId,
} from './shared/colors';

export type AxisKey = 'base' | 'hair' | 'outfit' | 'face';
export type PartId = string; // '01'..'06'

export type BaseDef = {
  id: PartId;
  label: string;
  skin: string;
};

export type HairDef = {
  id: PartId;
  label: string;
  /** Hair バリアント形状を選ぶキー (Hair.tsx の variant switch に対応)。 */
  shape: 'short' | 'long' | 'spike' | 'verysHort' | 'bicolor' | 'fluffy';
  colors: { primary: string; secondary?: string };
  /**
   * 任意: GLB ファイルパス (public/ からの絶対パス)。
   * 指定があれば voxel FlatBox 構成ではなく GLB が使われる。
   * GLB が無い場合は voxel にフォールバック (= shape が使われる)。
   */
  gltf?: string;
};

export type OutfitDef = {
  id: PartId;
  label: string;
  /** Outfit バリアント形状 (Outfit.tsx の variant switch)。 */
  shape: 'tee' | 'hoodie' | 'dress' | 'jacket';
  colors: {
    top: string;
    bottom: string;
    shoeUpper: string;
    shoeSole: string;
  };
};

export type FaceDef = {
  id: PartId;
  label: string;
  /** Face バリアント (Face.tsx)。 */
  shape: 'smile' | 'surprised' | 'smug' | 'wink';
};

export const BASE_CATALOG: BaseDef[] = [
  { id: '01', label: '標準肌',        skin: SKIN_PALETTE.b01 },
  { id: '02', label: '小麦肌',        skin: SKIN_PALETTE.b02 },
  { id: '03', label: 'ブラウン肌',    skin: SKIN_PALETTE.b03 },
  { id: '04', label: 'ピーチ肌',      skin: SKIN_PALETTE.b04 },
];

export const HAIR_CATALOG: HairDef[] = [
  {
    id: '01',
    label: 'ショート (茶)',
    shape: 'short',
    colors: { primary: HAIR_PRIMARY.h01 },
  },
  {
    id: '02',
    label: 'ロング (黒)',
    shape: 'long',
    colors: { primary: HAIR_PRIMARY.h02 },
  },
  {
    id: '03',
    label: 'スパイク (金)',
    shape: 'spike',
    colors: { primary: HAIR_PRIMARY.h03 },
  },
  {
    id: '04',
    label: 'ベリショ (赤)',
    shape: 'verysHort',
    colors: { primary: HAIR_PRIMARY.h04 },
  },
  {
    id: '05',
    label: 'バイカラー (緑/桃) — S001',
    shape: 'bicolor',
    colors: { primary: HAIR_PRIMARY.h05, secondary: HAIR_SECONDARY.h05 },
  },
  {
    id: '06',
    label: 'ふんわり (銀)',
    shape: 'fluffy',
    colors: { primary: HAIR_PRIMARY.h06 },
  },
];

export const OUTFIT_CATALOG: OutfitDef[] = [
  { id: '01', label: 'T シャツ (青)',   shape: 'tee',    colors: OUTFIT_PALETTE.o01 },
  { id: '02', label: 'ワンピース (桃)', shape: 'dress',  colors: OUTFIT_PALETTE.o02 },
  { id: '03', label: 'ジャケット (白)', shape: 'jacket', colors: OUTFIT_PALETTE.o03 },
  { id: '04', label: 'パーカー (黒)',   shape: 'hoodie', colors: OUTFIT_PALETTE.o04 },
];

export const FACE_CATALOG: FaceDef[] = [
  { id: '01', label: 'スマイル',     shape: 'smile' },
  { id: '02', label: '驚き',         shape: 'surprised' },
  { id: '03', label: 'どや',         shape: 'smug' },
  { id: '04', label: 'ウインク',     shape: 'wink' },
];

/** 検索ヘルパー。ID 未存在なら 1 番目を返す (フォールバック)。 */
export function findBase(id?: PartId): BaseDef {
  return BASE_CATALOG.find((b) => b.id === id) ?? BASE_CATALOG[0]!;
}
export function findHair(id?: PartId): HairDef {
  return HAIR_CATALOG.find((h) => h.id === id) ?? HAIR_CATALOG[0]!;
}
export function findOutfit(id?: PartId): OutfitDef {
  return OUTFIT_CATALOG.find((o) => o.id === id) ?? OUTFIT_CATALOG[0]!;
}
export function findFace(id?: PartId): FaceDef {
  return FACE_CATALOG.find((f) => f.id === id) ?? FACE_CATALOG[0]!;
}
