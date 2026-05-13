/**
 * avatar_code (例: base01_top03_bot02) を分解して表示するプレースホルダ。
 * 後で WebGL / Image 等に差し替え可能なように、外部 API は code と size のみ。
 * spec: docs/specs/profile.md §4.4
 */

const PALETTE = [
  '#39ff14', // neon
  '#00f0ff', // cyan
  '#ff2bd6', // pink
  '#ffb800',
  '#a155ff',
  '#34d399',
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
}: {
  code: string;
  size?: number;
}) {
  const parts = code.split('_');
  const [base = 'base', top = 'top', bot = 'bot'] = parts;
  const baseColor = colorFor(base);
  const topColor = colorFor(top);
  const botColor = colorFor(bot);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-950"
      style={{ width: size, height: size }}
      aria-label={`avatar ${code}`}
    >
      <div
        className="absolute inset-x-0 top-0 h-1/3"
        style={{ background: topColor, opacity: 0.7 }}
      />
      <div
        className="absolute inset-x-0 top-1/3 h-1/3"
        style={{ background: baseColor, opacity: 0.9 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: botColor, opacity: 0.7 }}
      />
      <div className="absolute inset-0 flex items-center justify-center mix-blend-overlay">
        <span className="font-mono text-[8px] text-black/70">{base}</span>
      </div>
    </div>
  );
}
