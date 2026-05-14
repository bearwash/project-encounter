/**
 * mulberry32 (PRNG) + FNV-1a 32-bit (string → seed)。
 *
 * spec: docs/specs/avatar.md §5.2
 *
 * - 個体差を「user_id (UUID 文字列)」から決定的に生成するための再現可能な乱数
 * - 依存ライブラリ不要、数行で実装可能
 * - 同じ user_id は再起動しても同じシーケンスを生成 → "個性" を演出
 */

/** FNV-1a 32-bit。文字列を符号なし 32-bit 整数に。 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // FNV prime 0x01000193 を Math.imul で 32-bit 乗算
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32: シード固定の高速 PRNG。
 * 呼び出すたびに 0 <= x < 1 の浮動小数を返す関数を生成。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** user_id 文字列から mulberry32 を作る便利関数 */
export function makeRng(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}
