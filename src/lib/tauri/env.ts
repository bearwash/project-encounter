/**
 * Tauri WebView 上で動いているかを判定する。
 *
 * 純ブラウザ (next dev 単独 や 開発用の /avatar-preview など) では false。
 * 各 queries / listener はこれで早期 return して、未定義 invoke によるクラッシュを防ぐ。
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return typeof w.__TAURI_INTERNALS__ !== 'undefined' || typeof w.__TAURI__ !== 'undefined';
}

/** Tauri 不在時に投げるエラー (UI 側で握り潰す/メッセージ化する判断は呼び出し側) */
export class TauriUnavailableError extends Error {
  constructor() {
    super('Tauri runtime is unavailable (browser-only mode)');
    this.name = 'TauriUnavailableError';
  }
}
