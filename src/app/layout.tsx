import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppProviders from './AppProviders';

export const metadata: Metadata = {
  title: 'Project Encounter',
  description: '近くですれ違った旅人が広場に集まり、仲間としてタワーへ挑むアバターアプリ。',
  icons: {
    icon: '/favicon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#63c2bc',
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
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
