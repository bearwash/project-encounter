// ホーム / プロフィール画面が「Tauri 不在のブラウザ」で console エラーなしに描画されるか確認。
// 前提: pnpm exec next dev -p 3001 が動いていること。

import { chromium } from 'playwright';

const BASE = process.env.HOME_SMOKE_BASE ?? 'http://localhost:3001';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

const paths = ['/', '/profile', '/profile/avatar-editor', '/walk'];
for (const path of paths) {
  console.log(`▶ ${path}`);
  const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
  console.log(`  status: ${resp?.status()}`);
  await page.waitForTimeout(800); // let async queries settle
}

console.log('\n=== console errors ===');
for (const e of consoleErrors) console.log(`[ERR] ${e}`);
console.log('=== page errors ===');
for (const e of pageErrors) console.log(`[PAGE-ERR] ${e}`);

await browser.close();

const ok = consoleErrors.length === 0 && pageErrors.length === 0;
console.log(ok ? '\n✓ no errors' : '\n✗ errors detected');
process.exit(ok ? 0 : 1);
