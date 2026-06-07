import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { devPagesEnabled } from '@/lib/dev-pages';

export default function EncounterPreviewLayout({ children }: { children: ReactNode }) {
  if (!devPagesEnabled()) notFound();
  return <>{children}</>;
}
