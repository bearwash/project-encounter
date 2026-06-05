// 3D ページ (avatar3d-preview / plaza-preview / home) の状態を Playwright で確認する。
// - console エラー / pageerror / failed request を全部拾う
// - スクリーンショットを /tmp/3d-check/*.png に保存
//
// 使い方:
//   pnpm dev  # 別ターミナルで 1420 番起動済み前提
//   node scripts/3d-check.mjs

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const OUT = '/tmp/3d-check';

const PAGES = [
  { key: 'avatar3d', url: `${BASE}/avatar3d-preview` },
  { key: 'plaza',    url: `${BASE}/plaza-preview` },
  { key: 'home',     url: `${BASE}/` },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();

  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') });
  });
  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  console.log(`\n=== ${p.key.toUpperCase()} (${p.url}) ===`);
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(5000); // R3F の Canvas が初期化 + 1 フレーム描画されるまで待つ
    await page.screenshot({ path: `${OUT}/${p.key}.png`, fullPage: true });
    console.log(`screenshot: ${OUT}/${p.key}.png`);
  } catch (e) {
    console.log(`[goto failed]: ${e?.message ?? e}`);
  }

  console.log(`pageErrors: ${pageErrors.length}`);
  for (const e of pageErrors) {
    console.log(`  - ${e.name}: ${e.message}`);
    if (e.stack) console.log(e.stack);
  }
  console.log(`console.error: ${consoleMessages.filter((m) => m.type === 'error').length}`);
  for (const m of consoleMessages.filter((m) => m.type === 'error').slice(0, 5)) {
    console.log(`  - ${m.text.slice(0, 200)}`);
  }
  console.log(`requestfailed: ${failedRequests.length}`);
  for (const f of failedRequests.slice(0, 5)) {
    console.log(`  - ${f.url}  (${f.failure})`);
  }

  await ctx.close();
}

await browser.close();
console.log('\ndone.');
