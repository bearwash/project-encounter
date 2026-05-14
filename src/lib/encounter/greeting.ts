/**
 * 対面挨拶シーン (公園の入口) の共通定数と文言。
 * spec: docs/specs/encounter-popup.md §5.3-§5.6
 *
 * 文言は §8 オープン課題でチューニング対象。i18n 化のため
 * 関数化しておく (将来 react-i18next 等へ差し替えやすくする)。
 *
 * トーン: ひらがな寄りのキュート系 ("Mii 広場" のやさしい日本語に寄せる)。
 * 商標「すれ違い通信」「Mii 広場」は §6 で使用不可 — 動詞 / 形容詞での言い換え。
 */

export const GREETING_TIMINGS = {
  /** オープニングの「きょうのすれちがい N 人」スタンプ (タメ感のため少し長め) */
  OPENING_MS: 1600,
  /** 隊列の先頭が前に出てくる */
  ENTER_MS: 500,
  /** 入場直後の「!」驚き吹き出し */
  EXCLAIM_MS: 400,
  /** 対面後の小休止 */
  MEET_HOLD_MS: 200,
  /** ハイタッチ全体 (上 200 + 触れ 50 + 戻り 200) */
  HIGHFIVE_MS: 450,
  /** 会釈 (お辞儀) */
  BOW_MS: 400,
  /** 「あいさつ！」/「ぺこっ」フラッシュ */
  TAP_FLASH_MS: 360,
  /** 紙吹雪が舞ってる長さ (ハイタッチ時のみ) */
  CONFETTI_MS: 700,
  /** タップ後に右へフレームアウト */
  LEAVE_MS: 300,
  /** ゲート通過のカメラパン (§5.7 ステップ 2-3) */
  GATE_PASS_MS: 800,
  /** 広場ビューへのクロスフェード (§5.7 ステップ 4) */
  CROSSFADE_MS: 500,
  /** 連打防止のデバウンス (§5.9 エッジケース) */
  TAP_DEBOUNCE_MS: 200,
} as const;

/** 1 セッションで連続表示する上限 (§4.4, §5.6.1) */
export const SESSION_LIMIT = 20;

/**
 * encounter_count に応じたシステムプレフィックス。
 * spec §5.5 の表に対応 (将来 i18n に差し替える)。
 * ひらがな寄りキュート系。
 */
export function greetingPrefix(count: number): string {
  if (count <= 1) return 'はじめまして！';
  if (count === 2) return 'またあえたね！';
  if (count === 3) return '3 回目だね♪';
  if (count <= 9) return `${count} 回目だね♪`;
  return `もう ${count} 回目だっ！`;
}

export type GreetType = 'highfive' | 'bow';

export function greetType(encounterCount: number): GreetType {
  return encounterCount >= 2 ? 'highfive' : 'bow';
}

/** ハイタッチ瞬間 / 会釈瞬間に中央に出すフラッシュ文言 */
export function greetFlashWord(type: GreetType): string {
  return type === 'highfive' ? 'あいさつ！' : 'ぺこっ';
}

/** 累計回数を可視化するためのスタンプ文字列 (★ + 数字) */
export function encounterStamp(count: number): string {
  if (count <= 0) return '';
  // 1-3 は ★ をそのまま、4 以上は ★N に集約
  if (count <= 3) return '★'.repeat(count);
  return `★×${count}`;
}
