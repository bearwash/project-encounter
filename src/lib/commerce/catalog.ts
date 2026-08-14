export type CoinProductId =
  | 'com.projectencounter.coins.120'
  | 'com.projectencounter.coins.650'
  | 'com.projectencounter.coins.1400';

export type CoinProduct = {
  id: CoinProductId;
  name: string;
  description: string;
  coins: number;
  bonusLabel: string | null;
  art: 'handful' | 'pouch' | 'trunk';
};

export type StoreListing = CoinProduct & {
  localizedPrice: string | null;
  available: boolean;
};

export const COIN_PRODUCTS: readonly CoinProduct[] = [
  {
    id: 'com.projectencounter.coins.120',
    name: 'コインひとつかみ',
    description: '小物や色を試すときに。',
    coins: 120,
    bonusLabel: null,
    art: 'handful',
  },
  {
    id: 'com.projectencounter.coins.650',
    name: '旅のポーチ',
    description: '工房でじっくり遊べる量。',
    coins: 650,
    bonusLabel: '+50 ボーナス',
    art: 'pouch',
  },
  {
    id: 'com.projectencounter.coins.1400',
    name: '旅支度のトランク',
    description: '季節のアイテムもまとめて。',
    coins: 1_400,
    bonusLabel: '+200 ボーナス',
    art: 'trunk',
  },
] as const;

export const TEST_PURCHASES_ENABLED =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_ENABLE_TEST_PURCHASES === '1';
