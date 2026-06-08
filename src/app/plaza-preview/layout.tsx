import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { devPagesEnabled } from '@/lib/dev-pages';

export default function PlazaPreviewLayout({ children }: { children: ReactNode }) {
  if (!devPagesEnabled()) notFound();
  return <>{children}</>;
}
