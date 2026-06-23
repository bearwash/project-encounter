/**
 * wardrobe.ts — 広場アバターの「本格着せ替え」カタログとロジック。
 *
 * 設計方針（重要）:
 * - 既存の avatar_code (b/h/o/f) と 2D SVG パイプライン (manifest.json) は一切触らない。
 * - 着せ替えの主役は 3D の StylizedPlazaAvatar。ここでは PlazaPalette を組み立てる。
 * - 各カテゴリは独立した ID で選択し、`wardrobeToAppearance` で Partial<PlazaPalette> に変換する。
 * - 将来 Supabase 等へ永続化する場合は WardrobeSelection をシリアライズすればよい
 *   （拡張コード形式は別途 encode/decode を足す。今は self の見た目をその場で反映するだけ）。
 *
 * 美術方針: ノスタルジック・ポップ。サイバー/ネオン/ダークは使わない。
 */

import type {
  PlazaAccessoryKind,
  PlazaFaceShape,
  PlazaHairShape,
  PlazaHatKind,
  PlazaPalette,
} from '../StylizedPlazaAvatar';

/** 着せ替えカテゴリのキー。UI のタブ順にもなる。 */
export type WardrobeCategory =
  | 'hairStyle'
  | 'hairColor'
  | 'top'
  | 'bottom'
  | 'shoe'
  | 'hat'
  | 'accessory'
  | 'face'
  | 'backdrop';

export type WardrobeSelection = Record<WardrobeCategory, string>;

type Item = { id: string; label: string };

type HairStyleItem = Item & { shape: PlazaHairShape };
type HairColorItem = Item & { color: string; alt: string };
type TopItem = Item & { color: string; longTop: boolean; detail: 'plain' | 'stripe' };
type ColorItem = Item & { color: string };
type ShoeItem = Item & { color: string; sole: string };
type HatItem = Item & { kind: PlazaHatKind; color: string; accent?: string };
type AccessoryItem = Item & { kind: PlazaAccessoryKind; color: string };
type FaceItem = Item & { shape: PlazaFaceShape };
type BackdropItem = Item & { color: string | null };

// ─────────────────────────────────────────────────────────────────────────
// カタログ本体（やわらかいパステル〜ポップな配色で統一）
// ─────────────────────────────────────────────────────────────────────────

export const HAIR_STYLES: HairStyleItem[] = [
  { id: 'bob', label: 'ボブ', shape: 'bob' },
  { id: 'topknot', label: 'お団子', shape: 'topknot' },
  { id: 'sweep', label: '流し前髪', shape: 'sweep' },
  { id: 'tentacle', label: 'ロング', shape: 'tentacle' },
  { id: 'cap', label: 'マッシュ', shape: 'cap' },
];

export const HAIR_COLORS: HairColorItem[] = [
  { id: 'brown', label: 'ブラウン', color: '#5A3A22', alt: '#7A513A' },
  { id: 'ink', label: 'くろ', color: '#1F2026', alt: '#3C3E4A' },
  { id: 'blonde', label: 'きん', color: '#E8C570', alt: '#F3E3AC' },
  { id: 'apricot', label: 'あんず', color: '#E59A63', alt: '#F2C49C' },
  { id: 'rose', label: 'ローズ', color: '#E68AA8', alt: '#F4B9CD' },
  { id: 'mint', label: 'ミント', color: '#8FCFB0', alt: '#BFE6D2' },
  { id: 'lilac', label: 'ラベンダー', color: '#B7A6E0', alt: '#D7CCF0' },
  { id: 'silver', label: 'シルバー', color: '#CFCEDA', alt: '#E7E6EE' },
];

export const TOPS: TopItem[] = [
  { id: 'cream', label: 'クリームT', color: '#F3EFE2', longTop: false, detail: 'plain' },
  { id: 'sky', label: 'スカイT', color: '#5BC4DC', longTop: false, detail: 'plain' },
  { id: 'coral', label: 'コーラル', color: '#F0856E', longTop: false, detail: 'stripe' },
  { id: 'sun', label: 'レモンコート', color: '#F4CC57', longTop: true, detail: 'plain' },
  { id: 'leaf', label: 'リーフパーカー', color: '#7CC273', longTop: true, detail: 'plain' },
  { id: 'berry', label: 'ベリーニット', color: '#C56C9A', longTop: false, detail: 'stripe' },
  { id: 'denim', label: 'デニムシャツ', color: '#6E8FC2', longTop: false, detail: 'plain' },
  { id: 'ink', label: 'すみパーカー', color: '#2C313C', longTop: true, detail: 'plain' },
];

export const BOTTOMS: ColorItem[] = [
  { id: 'navy', label: 'ネイビー', color: '#28405F' },
  { id: 'charcoal', label: 'チャコール', color: '#2F2D38' },
  { id: 'denim', label: 'デニム', color: '#5E77A8' },
  { id: 'olive', label: 'オリーブ', color: '#48533A' },
  { id: 'cocoa', label: 'ココア', color: '#6C493A' },
  { id: 'plum', label: 'プラム', color: '#5A3A52' },
];

export const SHOES: ShoeItem[] = [
  { id: 'ink', label: 'くろ', color: '#20242A', sole: '#FFF8DD' },
  { id: 'white', label: 'しろ', color: '#EFEAE0', sole: '#C9C3B5' },
  { id: 'red', label: 'あか', color: '#D2503F', sole: '#F4E7C8' },
  { id: 'sky', label: 'みず', color: '#5BB7CC', sole: '#FFF8DD' },
  { id: 'mustard', label: 'からし', color: '#D69B3C', sole: '#FFF6DA' },
];

export const HATS: HatItem[] = [
  { id: 'none', label: 'なし', kind: 'none', color: '#000000' },
  { id: 'cap-red', label: 'キャップ赤', kind: 'cap', color: '#E0584C', accent: '#F3EFE2' },
  { id: 'cap-navy', label: 'キャップ紺', kind: 'cap', color: '#2F4A74', accent: '#F4CC57' },
  { id: 'beanie', label: 'ニット帽', kind: 'beanie', color: '#E08AA0', accent: '#F3EFE2' },
  { id: 'straw', label: '麦わら', kind: 'straw', color: '#E8C87E', accent: '#E86C8B' },
  { id: 'ribbon', label: 'リボン', kind: 'ribbon', color: '#F0856E', accent: '#FFF8DD' },
  { id: 'crown', label: '王冠', kind: 'crown', color: '#F4CC57', accent: '#F15E4A' },
];

export const ACCESSORIES: AccessoryItem[] = [
  { id: 'none', label: 'なし', kind: 'none', color: '#000000' },
  { id: 'glasses', label: 'メガネ', kind: 'glasses', color: '#2C313C' },
  { id: 'round', label: '丸メガネ', kind: 'round', color: '#6C493A' },
  { id: 'headphones', label: 'ヘッドフォン', kind: 'headphones', color: '#E0584C' },
  { id: 'mask', label: 'マスク', kind: 'mask', color: '#F3EFE2' },
  { id: 'blush', label: 'ほっぺ', kind: 'blush', color: '#F08AA0' },
];

export const FACES: FaceItem[] = [
  { id: 'smile', label: 'にこ', shape: 'smile' },
  { id: 'focus', label: 'すまし', shape: 'focus' },
  { id: 'wink', label: 'ウインク', shape: 'wink' },
  { id: 'dot', label: 'びっくり', shape: 'dot' },
];

export const BACKDROPS: BackdropItem[] = [
  { id: 'none', label: 'なし', color: null },
  { id: 'sky', label: 'そら', color: '#7FD3E0' },
  { id: 'sun', label: 'ひだまり', color: '#F4CC57' },
  { id: 'rose', label: 'はなびら', color: '#F0A9C2' },
  { id: 'leaf', label: 'しんりょく', color: '#8FCB7E' },
];

/** カテゴリ → カタログ配列。UI のグリッド描画に使う。 */
export const WARDROBE_CATALOG: Record<WardrobeCategory, readonly Item[]> = {
  hairStyle: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  top: TOPS,
  bottom: BOTTOMS,
  shoe: SHOES,
  hat: HATS,
  accessory: ACCESSORIES,
  face: FACES,
  backdrop: BACKDROPS,
};

export const WARDROBE_CATEGORIES: readonly WardrobeCategory[] = [
  'hairStyle',
  'hairColor',
  'top',
  'bottom',
  'shoe',
  'hat',
  'accessory',
  'face',
  'backdrop',
] as const;

/** タブの表示順とラベル。 */
export const WARDROBE_TABS: { key: WardrobeCategory; label: string }[] = [
  { key: 'hairStyle', label: '髪型' },
  { key: 'hairColor', label: '髪色' },
  { key: 'top', label: 'トップス' },
  { key: 'bottom', label: 'ボトムス' },
  { key: 'shoe', label: 'くつ' },
  { key: 'hat', label: '帽子' },
  { key: 'accessory', label: '小物' },
  { key: 'face', label: '表情' },
  { key: 'backdrop', label: '背景' },
];

export const DEFAULT_WARDROBE: WardrobeSelection = {
  hairStyle: 'bob',
  hairColor: 'ink',
  top: 'cream',
  bottom: 'charcoal',
  shoe: 'ink',
  hat: 'none',
  accessory: 'none',
  face: 'focus',
  backdrop: 'none',
};

function pick<T extends Item>(list: readonly T[], id: string): T {
  return (list.find((x) => x.id === id) ?? list[0]!) as T;
}

export function normalizeWardrobeSelection(value: unknown): WardrobeSelection {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Partial<Record<WardrobeCategory, unknown>>)
      : {};
  const normalized = { ...DEFAULT_WARDROBE };

  for (const category of WARDROBE_CATEGORIES) {
    const candidate = source[category];
    if (typeof candidate !== 'string') continue;
    if (!WARDROBE_CATALOG[category].some((item) => item.id === candidate)) continue;
    normalized[category] = candidate;
  }

  return normalized;
}

/** 選択状態を 3D アバターの appearanceOverrides (Partial<PlazaPalette>) に変換する。 */
export function wardrobeToAppearance(sel: WardrobeSelection): Partial<PlazaPalette> {
  const hairStyle = pick(HAIR_STYLES, sel.hairStyle);
  const hairColor = pick(HAIR_COLORS, sel.hairColor);
  const top = pick(TOPS, sel.top);
  const bottom = pick(BOTTOMS, sel.bottom);
  const shoe = pick(SHOES, sel.shoe);
  const hat = pick(HATS, sel.hat);
  const accessory = pick(ACCESSORIES, sel.accessory);
  const face = pick(FACES, sel.face);
  const backdrop = pick(BACKDROPS, sel.backdrop);

  return {
    hair: hairColor.color,
    hairAlt: hairColor.alt,
    hairShape: hairStyle.shape,
    top: top.color,
    bottom: bottom.color,
    shoe: shoe.color,
    sole: shoe.sole,
    face: face.shape,
    longTop: top.longTop,
    detail: top.detail,
    hat: { kind: hat.kind, color: hat.color, accent: hat.accent },
    accessory: { kind: accessory.kind, color: accessory.color },
    backdrop: backdrop.color ?? undefined,
  };
}

/**
 * カタログ項目から UI スウォッチ用の代表色を取り出す（簡易プレビュー用）。
 * カテゴリごとに「らしさ」が伝わる色を返す。
 */
export function swatchColors(
  category: WardrobeCategory,
  id: string,
): { primary: string; secondary?: string } {
  switch (category) {
    case 'hairStyle': {
      // 髪型はシルエット重視。代表色はダークにして形を見せる。
      return { primary: '#6B5142' };
    }
    case 'hairColor': {
      const c = pick(HAIR_COLORS, id);
      return { primary: c.color, secondary: c.alt };
    }
    case 'top': {
      const c = pick(TOPS, id);
      return { primary: c.color };
    }
    case 'bottom': {
      const c = pick(BOTTOMS, id);
      return { primary: c.color };
    }
    case 'shoe': {
      const c = pick(SHOES, id);
      return { primary: c.color, secondary: c.sole };
    }
    case 'hat': {
      const c = pick(HATS, id);
      return { primary: c.kind === 'none' ? '#D9D4C6' : c.color, secondary: c.accent };
    }
    case 'accessory': {
      const c = pick(ACCESSORIES, id);
      return { primary: c.kind === 'none' ? '#D9D4C6' : c.color };
    }
    case 'face': {
      return { primary: '#2C313C' };
    }
    case 'backdrop': {
      const c = pick(BACKDROPS, id);
      return { primary: c.color ?? '#D9D4C6' };
    }
  }
}
