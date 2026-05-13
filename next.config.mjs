/** @type {import('next').NextConfig} */
// Tauri は静的ホスト前提のため SSG (output: 'export') を使う。
// API Routes / Server Actions / SSR は使用しない方針。
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Tauri WebView は trailing slash 無しの方が安定
  trailingSlash: false,
  // dev サーバの HMR 用ポート（tauri.conf.json と一致させる）
  // ポート: package.json scripts.dev で -p 1420 を指定
};

export default nextConfig;
