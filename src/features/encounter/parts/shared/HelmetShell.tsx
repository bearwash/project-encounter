'use client';

/**
 * HelmetShell — 頭 (中心 y=1.5, size 0.85^3) を完全に覆う「ヘルメット型」の共通ベース。
 *
 * 目的: hair バリアントの「禿げ部分」(横/後ろから見たとき頭スキンが透けて見える隙間) を
 *       構造的に排除する。
 *
 * 構成 (6-8 個の box でゆるく多面化):
 *   - top:        頭頂の薄いキャップ (y=1.93、僅かに前後左右オーバーハング)
 *   - back:       後頭部パネル (z=-0.45 にぴったり)
 *   - sideL/R:    側頭部 (x=±0.45)
 *   - frontline:  額の生え際 (上から下に流れる前髪の付け根)
 *   - cornerTL/TR/BL/BR: 頭頂の四隅にやや出っ張った "角" — シルエットを破る
 *
 * 各 box は左右で colorL / colorR に塗り分けるので、バイカラー (h05) にもそのまま対応。
 * 単色髪の場合は colorL = colorR を渡せば OK。
 */

import { FlatBox } from './FlatBox';

export type HelmetShellProps = {
  colorL: string;
  /** バイカラーで右半分の色。省略時は colorL と同色。 */
  colorR?: string;
};

export function HelmetShell({ colorL, colorR = colorL }: HelmetShellProps) {
  return (
    <group>
      {/* === 頭頂キャップ (上から見て頭を覆う、左右 split) === */}
      <FlatBox
        args={[0.48, 0.16, 0.92]}
        color={colorL}
        position={[-0.24, 1.94, -0.02]}
      />
      <FlatBox
        args={[0.48, 0.16, 0.92]}
        color={colorR}
        position={[0.24, 1.94, -0.02]}
      />

      {/* === 頭の前面に厚みを足す: 額の生え際ライン (左右 split) === */}
      <FlatBox
        args={[0.46, 0.18, 0.12]}
        color={colorL}
        position={[-0.225, 1.78, 0.46]}
      />
      <FlatBox
        args={[0.46, 0.18, 0.12]}
        color={colorR}
        position={[0.225, 1.78, 0.46]}
      />

      {/* === 後頭部パネル (うなじまで降りる) === */}
      <FlatBox
        args={[0.46, 0.92, 0.14]}
        color={colorL}
        position={[-0.225, 1.46, -0.49]}
      />
      <FlatBox
        args={[0.46, 0.92, 0.14]}
        color={colorR}
        position={[0.225, 1.46, -0.49]}
      />

      {/* === 側頭部カバー (耳〜こめかみ) — 頭幅 0.85 とほぼ揃えて bulge 防止 === */}
      <FlatBox
        args={[0.08, 0.7, 0.78]}
        color={colorL}
        position={[-0.46, 1.5, -0.06]}
      />
      <FlatBox
        args={[0.08, 0.7, 0.78]}
        color={colorR}
        position={[0.46, 1.5, -0.06]}
      />

      {/* === 後頭部〜頭頂の継ぎ目フィラー (シェル間の隙間を黙る) ===
       *   Y=1.85 で側頭部上端と頭頂キャップの間を 0.10 重ねる薄パネル */}
      <FlatBox
        args={[0.43, 0.1, 0.86]}
        color={colorL}
        position={[-0.215, 1.85, -0.04]}
      />
      <FlatBox
        args={[0.43, 0.1, 0.86]}
        color={colorR}
        position={[0.215, 1.85, -0.04]}
      />
    </group>
  );
}
