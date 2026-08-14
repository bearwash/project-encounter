'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { QueryProvider } from '@/lib/query/QueryProvider';

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
