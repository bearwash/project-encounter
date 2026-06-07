import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { devPagesEnabled } from '@/lib/dev-pages';

export default function AvataviS001Layout({ children }: { children: ReactNode }) {
  if (!devPagesEnabled()) notFound();
  return <>{children}</>;
}
