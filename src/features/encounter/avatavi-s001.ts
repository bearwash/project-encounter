/**
 * AVATAVI S001 — characterimage1 / characterimage2 / character-image3 で示された公式キャラの定数。
 *
 * 旧設計では S001_COLORS で色を上書きしていたが、新パーツカタログ (parts/catalog.ts) が
 * 各バリアントの既定色を内部保持するため、color override は不要になった。
 *
 * S001_AVATAR_CODE をデフォルトプロフィールや「迷ったときの安全値」として使う。
 */

/** S001 の avatar_code (b=base / h=hair / o=outfit / f=face)。 */
export const S001_AVATAR_CODE = 'b04_h05_o04_f01';
