import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

const enabled =
  process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES !== '0' &&
  process.env.NODE_ENV !== 'production';

export default function PlazaPreviewLayout({ children }: { children: ReactNode }) {
  if (!enabled) notFound();
  return <>{children}</>;
}
