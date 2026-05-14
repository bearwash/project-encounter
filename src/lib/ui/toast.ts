/**
 * 軽量トースト state。Provider 不要、event emitter で 1 個分の最新トーストを持つ。
 *
 * - 同じメッセージは 5 分以内は連発しない (オフライントーストが連発するのを抑止)
 * - 4 秒後に自動で消える
 * - kind は 'info' | 'warn' (色だけ違う)
 */
import { useSyncExternalStore } from 'react';

export type ToastKind = 'info' | 'warn';

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
};

const SUPPRESS_MS = 5 * 60 * 1000; // 同一文言の連発抑止
const AUTO_DISMISS_MS = 4000;

let nextId = 1;
let current: Toast | null = null;
const listeners = new Set<() => void>();
const lastShownAt = new Map<string, number>();
let dismissTimer: number | null = null;

function emit() {
  for (const l of listeners) l();
}

export function showToast(message: string, kind: ToastKind = 'info'): void {
  const now = Date.now();
  const key = `${kind}:${message}`;
  const prev = lastShownAt.get(key);
  if (prev && now - prev < SUPPRESS_MS) return;
  lastShownAt.set(key, now);

  current = { id: nextId++, message, kind };
  emit();

  if (dismissTimer !== null) {
    window.clearTimeout(dismissTimer);
  }
  dismissTimer = window.setTimeout(() => {
    current = null;
    dismissTimer = null;
    emit();
  }, AUTO_DISMISS_MS);
}

export function dismissToast(): void {
  current = null;
  if (dismissTimer !== null) {
    window.clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Toast | null {
  return current;
}

function getServerSnapshot(): Toast | null {
  return null;
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
