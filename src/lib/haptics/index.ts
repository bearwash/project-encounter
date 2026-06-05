'use client';

// spec: docs/specs/haptics.md (TODO)
//
// 振動 (Haptics) を視覚 / 聴覚と合わせて鳴らすラッパー。
// `navigator.vibrate()` の薄い wrapper で、未対応環境 (デスクトップ Safari など)
// では no-op に degrade する。
//
// 設定はミュート可能 (localStorage)。SFX と同様に Profile 画面のトグルから
// ON / OFF を切り替えられる。

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'encounter:haptics-muted';

/** よく使うパターンのプリセット (ms 単位の配列 = vibrate pattern)。 */
const PATTERNS = {
  /** 軽い「コッ」: タップ全般 */
  tap: 8,
  /** ハイタッチ瞬間の「タンッ!」 (2 連打) */
  highfive: [12, 60, 18] as number[],
  /** 会釈の「ぺこっ」: tap より少し長め */
  bow: 16,
  /** ゲート通過 / 大きな遷移完了 */
  gate: [20, 80, 30] as number[],
  /** 保存成功 / 完了 */
  success: [10, 60, 10] as number[],
} as const;

type Pattern = keyof typeof PATTERNS;

class HapticsEngine {
  private muted = false;
  private listeners = new Set<(muted: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        // private mode 等。デフォルト on で続行。
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(v: boolean): void {
    if (this.muted === v) return;
    this.muted = v;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
      } catch {
        // ignore
      }
    }
    this.listeners.forEach((l) => l(v));
  }

  subscribe(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  /** プリセットを再生。未対応環境では何もしない。 */
  play(pattern: Pattern): void {
    if (this.muted) return;
    if (!this.isSupported()) return;
    try {
      navigator.vibrate(PATTERNS[pattern]);
    } catch {
      // 一部ブラウザは user gesture 外で失敗する。静かに無視。
    }
  }
}

export const haptics = new HapticsEngine();

/** ショートカット: 各シーンの呼び分けを薄く名前付け。 */
export const hapticTap = () => haptics.play('tap');
export const hapticHighFive = () => haptics.play('highfive');
export const hapticBow = () => haptics.play('bow');
export const hapticGate = () => haptics.play('gate');
export const hapticSuccess = () => haptics.play('success');

/** React フック: 現在のミュート状態を購読する。 */
export function useHapticsMuted(): boolean {
  return useSyncExternalStore(
    (cb) => haptics.subscribe(cb),
    () => haptics.isMuted(),
    () => false,
  );
}

export function setHapticsMuted(v: boolean): void {
  haptics.setMuted(v);
}
