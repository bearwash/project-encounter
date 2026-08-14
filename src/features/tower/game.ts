import type { TowerTicket } from './tower-data';

export type BattlePhase =
  | 'ready'
  | 'entering'
  | 'command'
  | 'attacking'
  | 'casting'
  | 'enemy-defeated'
  | 'floor-transition'
  | 'tired-return';

export type BattleAction = 'fight' | 'magic';

export type TowerEnemy = {
  key: string;
  name: string;
  kind: 'slime' | 'moth' | 'golem' | 'shade';
  hp: number;
  maxHp: number;
  bodyColor: string;
  accentColor: string;
};

const ENEMIES = [
  { name: 'しずくオバケ', kind: 'slime', bodyColor: '#55B8D7', accentColor: '#B9EFE7' },
  { name: '灯りモス', kind: 'moth', bodyColor: '#E98BA7', accentColor: '#FFD34D' },
  { name: '石ころ番', kind: 'golem', bodyColor: '#8EA09B', accentColor: '#E9DDBA' },
  { name: '夜ふかし影', kind: 'shade', bodyColor: '#5E617E', accentColor: '#B7A6E0' },
] as const;

export function makeEnemy(floor: number): TowerEnemy {
  const safeFloor = Math.max(1, Math.floor(floor));
  const template = ENEMIES[(safeFloor - 1) % ENEMIES.length]!;
  // 1F は魔法なら確実に倒せ、通常攻撃なら帰還も確認できるバランス。
  const maxHp = 4 + Math.floor((safeFloor - 1) * 1.55);
  return {
    key: `${safeFloor}-${template.kind}`,
    ...template,
    hp: maxHp,
    maxHp,
  };
}
export function actionDamage(
  action: BattleAction,
  hero: TowerTicket,
  floor: number,
): number {
  const roll = hashString(`${hero.encounterLogId}:${hero.userId}:${floor}:${action}`);
  if (action === 'magic') return 5 + (roll % 3) + Math.floor(floor / 6);
  return 2 + (roll % 2) + Math.floor(floor / 8);
}

export function phaseMessage(
  phase: BattlePhase,
  hero: TowerTicket | null,
  enemy: TowerEnemy,
  damage: number | null,
): string {
  switch (phase) {
    case 'ready':
      return 'すれ違った仲間から、出撃する勇者を選ぼう。';
    case 'entering':
      return `${hero?.displayName ?? '勇者'}がやってきた！`;
    case 'command':
      return `${enemy.name}が道をふさいでいる。どうする？`;
    case 'attacking':
      return `ハンマーの一撃！ ${damage ?? 0}ダメージ！`;
    case 'casting':
      return `色の魔法がはじけた！ ${damage ?? 0}ダメージ！`;
    case 'enemy-defeated':
      return `${enemy.name}を倒した！ このまま次の階へ！`;
    case 'floor-transition':
      return `${hero?.displayName ?? '勇者'}は帰らず、階段を上っている…`;
    case 'tired-return':
      return '力を使い切った…。ゆっくり広場へ戻ろう。';
  }
}

function hashString(value: string) {
  let acc = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    acc ^= value.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return acc >>> 0;
}
