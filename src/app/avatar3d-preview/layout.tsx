import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// avatar-preview と同じガード: dev / 明示的 ON 環境でのみ公開。
const enabled =
  process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES !== '0' &&
  process.env.NODE_ENV !== 'production';

export default function Avatar3DPreviewLayout({ children }: { children: ReactNode }) {
  if (!enabled) notFound();
  return <>{children}</>;
}
