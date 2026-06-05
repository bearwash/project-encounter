'use client';

// Next.js 15: `ssr: false` を使うには 'use client' 必須。
// R3F Canvas を含むため SSR を切る。
import dynamic from 'next/dynamic';

const AvataviS001Page = dynamic(() => import('./inner.client'), {
  ssr: false,
});

export default AvataviS001Page;
