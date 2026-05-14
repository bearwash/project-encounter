/**
 * Supabase クライアントの singleton。
 *
 * spec: docs/specs/profile-sync.md §5.1, §5.2
 *
 * - 環境変数:
 *     NEXT_PUBLIC_SUPABASE_URL
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   いずれかが空なら mock モードと見なし、`getSupabase()` は `null` を返す。
 *   この場合、profile fetch は Rust mock にフォールバックし、自プロフィール
 *   PUT は no-op になる (= ローカルのみ保存)。
 *
 * - SSR (Next.js build / server side) では `null` を返す。ブラウザでだけ初期化。
 *
 * - localStorage を auth storage に使うので、Tauri WebView 上でも持続する
 *   (アンインストールでクリア)。
 */
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

let client: SupabaseClient | null = null;

/** Supabase が設定されているか (URL + ANON KEY が両方ある) */
export function isSupabaseEnabled(): boolean {
  return Boolean(URL && ANON);
}

/** クライアントを取得。未設定時 / SSR では null。 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!isSupabaseEnabled()) return null;
  if (!client) {
    client = createClient(URL!, ANON!, {
      auth: {
        // Tauri 上でも browser localStorage に session を載せる
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
        storageKey: 'project-encounter-supabase-auth',
      },
    });
  }
  return client;
}
