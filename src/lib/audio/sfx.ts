'use client';

// spec: docs/specs/sfx.md
//
// 公園入口の対面挨拶シーンで鳴らす効果音 (SE) を Web Audio API で合成する。
// 外部音源を持たずノスタルジック・ポップ路線 (要件 §3.3) を維持する目的:
// - 隊列入場の「コツコツ」(triangle wave sweep)
// - 会釈の「ぺこっ」 (sine wave sweep)
// - ハイタッチの「ピロリンッ」 (square + sine 重ね)
// - ゲート通過の「シャラン」 (sine の和音、時間差再生)
//
// AudioContext は user gesture 後に lazy 初期化 (autoplay policy 対策)。
// ミュート状態は localStorage に保存し、Profile 画面のトグルで切り替える。

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'encounter:sfx-muted';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

type BurstOpts = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
  sweepTo?: number;
};

class SFXEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private listeners = new Set<(muted: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch {
        // private mode 等。デフォルト on で続行
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

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const w = window as WebkitWindow;
      const AC = window.AudioContext ?? w.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private burst(ctx: AudioContext, opts: BurstOpts): void {
    const start = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.duration / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, start + dur);
    }
    const vol = opts.volume ?? 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** 隊列の先頭が前に出てくる靴音 (コツコツ × 2)。enter フェーズで鳴らす。 */
  playFootstep(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.burst(ctx, { freq: 380, sweepTo: 220, duration: 70, type: 'triangle', volume: 0.09 });
    this.burst(ctx, {
      freq: 380,
      sweepTo: 220,
      duration: 70,
      type: 'triangle',
      volume: 0.09,
      delay: 0.13,
    });
  }

  /** 会釈の「ぺこっ」。初回 (encounter_count == 1) の greet フェーズで鳴らす。 */
  playBow(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.burst(ctx, { freq: 520, sweepTo: 340, duration: 220, type: 'sine', volume: 0.12 });
  }

  /** ハイタッチの「ピロリンッ」。再会 (encounter_count >= 2) の greet フェーズで鳴らす。 */
  playHighFive(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.burst(ctx, { freq: 1200, duration: 80, type: 'square', volume: 0.08 });
    this.burst(ctx, { freq: 1600, duration: 100, type: 'sine', volume: 0.12, delay: 0.05 });
    this.burst(ctx, { freq: 2100, duration: 110, type: 'sine', volume: 0.09, delay: 0.12 });
  }

  /** ゲート通過の「シャラン」。gate-pass フェーズ突入時に鳴らす。 */
  playGate(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    [800, 1000, 1300, 1600].forEach((f, i) => {
      this.burst(ctx, {
        freq: f,
        duration: 280,
        type: 'sine',
        volume: 0.09,
        delay: i * 0.05,
      });
    });
  }
}

export const sfx = new SFXEngine();

/** React フック: 現在のミュート状態を購読する。 */
export function useSfxMuted(): boolean {
  return useSyncExternalStore(
    (cb) => sfx.subscribe(cb),
    () => sfx.isMuted(),
    () => false,
  );
}

export function setSfxMuted(v: boolean): void {
  sfx.setMuted(v);
}
