import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// 本番ビルド (next build, static export) でのみ非公開にしたい。
// `process.env.NODE_ENV` は dev サーバでも構成によって挙動が揺れるので、
// 明示的に NEXT_PUBLIC_ENABLE_DEV_PAGES を使う。
// dev 時はデフォルト ON、本番 export 時は OFF にしたければ
// `NEXT_PUBLIC_ENABLE_DEV_PAGES=0 pnpm build` で抑止する。
const enabled =
  process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES !== '0' &&
  process.env.NODE_ENV !== 'production';

export default function AvatarPreviewLayout({ children }: { children: ReactNode }) {
  if (!enabled) notFound();
  return <>{children}</>;
}
