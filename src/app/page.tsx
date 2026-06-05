'use client';

// Next.js 15 では `dynamic(..., { ssr: false })` を Server Component で使えない
// (`'use client'` 必須)。本体は HomePage.client.tsx 側で `'use client'` 宣言済み。
// このローダー page は dynamic で SSR を切るだけの薄いラッパー。
import dynamic from 'next/dynamic';

const HomePage = dynamic(() => import('./HomePage.client'), { ssr: false });

export default HomePage;
