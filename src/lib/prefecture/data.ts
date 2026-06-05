// spec: docs/specs/regional-map.md
//
// 47 都道府県の静的データ。
// - `code`: ISO 3166-2:JP の下 2 桁を使う ("01" 北海道 〜 "47" 沖縄)。
// - `tile`: 「日本列島タイルマップ」での配置 (row, col)。完全に地理正確な
//   メルカトル投影ではなく、Wikipedia "Tile maps of Japan" 風の単純化配置を
//   採用する。MVP では「日本列島の形を想起できる」程度で十分。
//
// Supabase / SQLite に保存する値は `code` 文字列 ("01"〜"47") を採用する。
// 未設定は NULL。

export type PrefectureCode =
  | '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20'
  | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' | '30'
  | '31' | '32' | '33' | '34' | '35' | '36' | '37' | '38' | '39' | '40'
  | '41' | '42' | '43' | '44' | '45' | '46' | '47';

export type Region =
  | '北海道'
  | '東北'
  | '関東'
  | '中部'
  | '近畿'
  | '中国'
  | '四国'
  | '九州沖縄';

export type Prefecture = {
  code: PrefectureCode;
  name: string;
  region: Region;
  /** タイルマップ上の (row, col)。`TILE_ROWS` × `TILE_COLS` のグリッドに収まる。 */
  tile: { row: number; col: number };
};

/** タイルマップのグリッドサイズ。 */
export const TILE_ROWS = 12;
export const TILE_COLS = 10;

/**
 * 47 都道府県 — 北 (北海道) から南 (沖縄) の標準コード順。
 *
 * タイル座標は手描きで、日本列島の形を 12 行 × 10 列にデフォルメしたもの。
 * 右上が北海道、左下が九州・沖縄。`row` が大きいほど南。
 */
export const PREFECTURES: readonly Prefecture[] = [
  // 北海道
  { code: '01', name: '北海道', region: '北海道',  tile: { row: 0, col: 8 } },

  // 東北
  { code: '02', name: '青森',   region: '東北',    tile: { row: 1, col: 8 } },
  { code: '03', name: '岩手',   region: '東北',    tile: { row: 2, col: 9 } },
  { code: '04', name: '宮城',   region: '東北',    tile: { row: 3, col: 9 } },
  { code: '05', name: '秋田',   region: '東北',    tile: { row: 2, col: 8 } },
  { code: '06', name: '山形',   region: '東北',    tile: { row: 3, col: 8 } },
  { code: '07', name: '福島',   region: '東北',    tile: { row: 4, col: 8 } },

  // 関東
  { code: '08', name: '茨城',   region: '関東',    tile: { row: 5, col: 9 } },
  { code: '09', name: '栃木',   region: '関東',    tile: { row: 5, col: 8 } },
  { code: '10', name: '群馬',   region: '関東',    tile: { row: 5, col: 7 } },
  { code: '11', name: '埼玉',   region: '関東',    tile: { row: 6, col: 8 } },
  { code: '12', name: '千葉',   region: '関東',    tile: { row: 6, col: 9 } },
  { code: '13', name: '東京',   region: '関東',    tile: { row: 6, col: 7 } },
  { code: '14', name: '神奈川', region: '関東',    tile: { row: 7, col: 7 } },

  // 中部
  { code: '15', name: '新潟',   region: '中部',    tile: { row: 4, col: 7 } },
  { code: '16', name: '富山',   region: '中部',    tile: { row: 5, col: 6 } },
  { code: '17', name: '石川',   region: '中部',    tile: { row: 5, col: 5 } },
  { code: '18', name: '福井',   region: '中部',    tile: { row: 6, col: 5 } },
  { code: '19', name: '山梨',   region: '中部',    tile: { row: 7, col: 6 } },
  { code: '20', name: '長野',   region: '中部',    tile: { row: 6, col: 6 } },
  { code: '21', name: '岐阜',   region: '中部',    tile: { row: 7, col: 5 } },
  { code: '22', name: '静岡',   region: '中部',    tile: { row: 8, col: 7 } },
  { code: '23', name: '愛知',   region: '中部',    tile: { row: 8, col: 6 } },

  // 近畿
  { code: '24', name: '三重',   region: '近畿',    tile: { row: 8, col: 5 } },
  { code: '25', name: '滋賀',   region: '近畿',    tile: { row: 7, col: 4 } },
  { code: '26', name: '京都',   region: '近畿',    tile: { row: 6, col: 4 } },
  { code: '27', name: '大阪',   region: '近畿',    tile: { row: 8, col: 4 } },
  { code: '28', name: '兵庫',   region: '近畿',    tile: { row: 7, col: 3 } },
  { code: '29', name: '奈良',   region: '近畿',    tile: { row: 9, col: 4 } },
  { code: '30', name: '和歌山', region: '近畿',    tile: { row: 9, col: 3 } },

  // 中国
  { code: '31', name: '鳥取',   region: '中国',    tile: { row: 6, col: 3 } },
  { code: '32', name: '島根',   region: '中国',    tile: { row: 6, col: 2 } },
  { code: '33', name: '岡山',   region: '中国',    tile: { row: 7, col: 2 } },
  { code: '34', name: '広島',   region: '中国',    tile: { row: 7, col: 1 } },
  { code: '35', name: '山口',   region: '中国',    tile: { row: 8, col: 1 } },

  // 四国
  { code: '36', name: '徳島',   region: '四国',    tile: { row: 9, col: 2 } },
  { code: '37', name: '香川',   region: '四国',    tile: { row: 8, col: 2 } },
  { code: '38', name: '愛媛',   region: '四国',    tile: { row: 9, col: 1 } },
  { code: '39', name: '高知',   region: '四国',    tile: { row: 10, col: 2 } },

  // 九州沖縄
  { code: '40', name: '福岡',   region: '九州沖縄', tile: { row: 9, col: 0 } },
  { code: '41', name: '佐賀',   region: '九州沖縄', tile: { row: 10, col: 0 } },
  { code: '42', name: '長崎',   region: '九州沖縄', tile: { row: 10, col: 1 } },
  { code: '43', name: '熊本',   region: '九州沖縄', tile: { row: 11, col: 0 } },
  { code: '44', name: '大分',   region: '九州沖縄', tile: { row: 9, col: 1 } },
  { code: '45', name: '宮崎',   region: '九州沖縄', tile: { row: 11, col: 1 } },
  { code: '46', name: '鹿児島', region: '九州沖縄', tile: { row: 11, col: 2 } },
  { code: '47', name: '沖縄',   region: '九州沖縄', tile: { row: 11, col: 3 } },
];

const PREF_BY_CODE: ReadonlyMap<PrefectureCode, Prefecture> = new Map(
  PREFECTURES.map((p) => [p.code, p]),
);

/** code から県情報を引く。未知コード or null は undefined を返す。 */
export function lookupPrefecture(
  code: string | null | undefined,
): Prefecture | undefined {
  if (!code) return undefined;
  return PREF_BY_CODE.get(code as PrefectureCode);
}

/** 表示用: 「📍青森」のような短い文字列。未設定は null を返す。 */
export function prefectureLabel(code: string | null | undefined): string | null {
  const p = lookupPrefecture(code);
  return p ? `📍${p.name}` : null;
}

export const REGION_ORDER: readonly Region[] = [
  '北海道',
  '東北',
  '関東',
  '中部',
  '近畿',
  '中国',
  '四国',
  '九州沖縄',
];
