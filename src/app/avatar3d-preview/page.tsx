'use client';

// Next.js 15: `ssr: false` を使うには 'use client' 必須。
// R3F Canvas を含むため SSR を切る (HomePage と同じ対処)。
import dynamic from 'next/dynamic';

const Avatar3DPreviewPage = dynamic(() => import('./inner.client'), {
  ssr: false,
});

export default Avatar3DPreviewPage;
