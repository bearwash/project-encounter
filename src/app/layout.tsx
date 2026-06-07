import type { Metadata, Viewport } from 'next';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import { QueryProvider } from '@/lib/query/QueryProvider';
import './globals.css';

// 全体に丸みのあるポップなフォントを適用する。
// 要件 §3.3 ノスタルジック・ポップ路線に合わせ、本文 (400/700) と
// 見出し / スタンプ (800/900) を 1 ファミリで揃える。
// `--font-rounded` を CSS 変数として export し、tailwind の
// fontFamily.sans / fontFamily.display 両方から参照する。
const rounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '700', '800', '900'],
  variable: '--font-rounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Project Encounter',
  description: 'BLE すれ違いアバターアプリ',
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  // ノスタルジック・ポップ路線 (要件 §3.3) に合わせ、アプリ基調の cream に合わせる。
  // (旧 #000000 はダーク基調を想起させトーンと不整合だった)
  themeColor: '#FAF1E0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={rounded.variable}>
      <body className="min-h-screen bg-cream font-sans text-ink">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
