import type { Metadata, Viewport } from 'next';
import { QueryProvider } from '@/lib/query/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Project Encounter',
  description: 'BLE すれ違いアバターアプリ',
};

export const viewport: Viewport = {
  themeColor: '#000000',
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
    <html lang="ja">
      <body className="min-h-screen bg-black text-white">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
