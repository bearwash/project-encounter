/**
 * avatar_code (例: base01_top03_bot02) を分解して表示する暫定アバター。
 * 要件定義 §3.3 のボクセル/ピクセルアート方針への布石として、
 * パーツコードから決定的にパステル配色のキャラクターを描く。
 *
 * トコトコ歩く / きょろきょろ等の本格的な動的挙動は次フェーズで実装する。
 * spec: docs/specs/profile.md §4.4
 */

const PALETTE = [
  '#E55A4C', // pop-red
  '#F5A623', // pop-orange
  '#FFD23F', // pop-yellow
  '#76C25B', // pop-green
  '#5DA9E9', // pop-blue
  '#A47BC0', // pop-purple
];

function hashCode(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorFor(part: string): string {
  return PALETTE[hashCode(part) % PALETTE.length]!;
}

export function Avatar({
  code,
  size = 64,
  animated = true,
}: {
  code: string;
  size?: number;
  /** 待機モーション (呼吸) を有効化。リストでは false にしても良い */
  animated?: boolean;
}) {
  const parts = code.split('_');
  const [base = 'base', top = 'top', bot = 'bot'] = parts;
  const hairColor = colorFor(top);
  const shirtColor = colorFor(base);
  const pantsColor = colorFor(bot);

  // 8x8 ピクセル風キャラ — 各要素は size の 1/8 単位
  const u = size / 8;

  return (
    <div
      className={`relative shrink-0 ${animated ? 'animate-breath' : ''}`}
      style={{ width: size, height: size }}
      aria-label={`avatar ${code}`}
    >
      {/* hair */}
      <div
        className="absolute rounded-[20%]"
        style={{
          left: u * 2,
          top: u * 0.5,
          width: u * 4,
          height: u * 2.2,
          background: hairColor,
        }}
      />
      {/* face */}
      <div
        className="absolute rounded-[28%] bg-[#FFE3C9]"
        style={{
          left: u * 2.3,
          top: u * 1.6,
          width: u * 3.4,
          height: u * 2.2,
        }}
      />
      {/* eyes */}
      <div
        className="absolute rounded-full bg-ink"
        style={{ left: u * 3.0, top: u * 2.4, width: u * 0.5, height: u * 0.5 }}
      />
      <div
        className="absolute rounded-full bg-ink"
        style={{ left: u * 4.5, top: u * 2.4, width: u * 0.5, height: u * 0.5 }}
      />
      {/* shirt */}
      <div
        className="absolute rounded-[18%]"
        style={{
          left: u * 1.6,
          top: u * 4.0,
          width: u * 4.8,
          height: u * 2.4,
          background: shirtColor,
        }}
      />
      {/* pants */}
      <div
        className="absolute rounded-b-[18%]"
        style={{
          left: u * 2.2,
          top: u * 6.0,
          width: u * 3.6,
          height: u * 1.8,
          background: pantsColor,
        }}
      />
    </div>
  );
}
