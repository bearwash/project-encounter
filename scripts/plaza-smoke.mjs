// EncounterPlaza を Playwright で検証する。
// 前提: pnpm exec next dev -p 3001 が動いていること。
// 出力: /tmp/plaza-smoke/*.png

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.PLAZA_PREVIEW_URL ?? 'http://localhost:3001/plaza-preview';
const OUT_DIR = '/tmp/plaza-smoke';

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();

const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

console.log(`▶ ${BASE}`);
const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
console.log(`  status: ${resp?.status()}`);

// --- 空状態 ---
await page.locator('[data-testid="count-0"]').click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="plaza-stage"]') === null,
  { timeout: 5_000 },
);
const emptyText = await page.getByText('歩き出すと、ここに住人が増えていきます').count();
console.log(`  empty state visible: ${emptyText === 1}`);
await page.screenshot({ path: `${OUT_DIR}/01-empty.png`, fullPage: true });

// --- 1 人 ---
await page.locator('[data-testid="count-1"]').click();
await page.waitForSelector('[data-testid="plaza-stage"]', { timeout: 5_000 });
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="plaza-resident-"]').length === 1,
);
const stageWidth1 = await page.evaluate(
  () => document.querySelector('[data-testid="plaza-stage"]').getBoundingClientRect().width,
);
console.log(`  1 person stage width: ${stageWidth1}`);
await page.screenshot({ path: `${OUT_DIR}/02-one.png`, fullPage: true });

// --- 32 人: ステージ幅が拡張、横スクロール可 ---
await page.locator('[data-testid="count-32"]').click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="plaza-resident-"]').length === 32,
);
const stageWidth32 = await page.evaluate(
  () => document.querySelector('[data-testid="plaza-stage"]').getBoundingClientRect().width,
);
console.log(`  32 people stage width: ${stageWidth32}`);
await page.screenshot({ path: `${OUT_DIR}/03-thirty-two.png`, fullPage: true });

// --- 60 人: ステージがさらに 2 倍に ---
await page.locator('[data-testid="count-60"]').click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="plaza-resident-"]').length === 60,
);
const stageWidth60 = await page.evaluate(
  () => document.querySelector('[data-testid="plaza-stage"]').getBoundingClientRect().width,
);
console.log(`  60 people stage width: ${stageWidth60}`);
await page.screenshot({ path: `${OUT_DIR}/04-sixty.png`, fullPage: true });

// --- 8 人 で詳細パネルテスト ---
await page.locator('[data-testid="count-8"]').click();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="plaza-resident-"]').length === 8,
);

// 1 体目をタップ
const first = page.locator('[data-testid^="plaza-resident-"]').first();
await first.click({ force: true });
await page.waitForSelector('[data-testid="plaza-detail-panel"]', { timeout: 5_000 });
console.log('  detail panel opened');
await page.screenshot({ path: `${OUT_DIR}/05-detail.png`, fullPage: true });

// 背面 (overlay) クリックで閉じる
await page.locator('.bg-ink\\/40').click();
await page.waitForFunction(
  () => document.querySelector('[data-testid="plaza-detail-panel"]') === null,
);
console.log('  detail panel closed');

// --- 自律行動: 2 秒待って住人が動いているか (状態が時間とともに変わるか) ---
const before = await page.evaluate(() => {
  const residents = document.querySelectorAll('[data-testid^="plaza-resident-"]');
  return Array.from(residents).map((el) => el.getAttribute('data-state'));
});
await page.waitForTimeout(3500);
const after = await page.evaluate(() => {
  const residents = document.querySelectorAll('[data-testid^="plaza-resident-"]');
  return Array.from(residents).map((el) => el.getAttribute('data-state'));
});
const changed = before.filter((s, i) => s !== after[i]).length;
console.log(`  residents that changed state in 3.5s: ${changed} / ${before.length}`);

// --- レポート ---
console.log('\n=== console ===');
for (const m of consoleMessages) console.log(`[${m.type}] ${m.text}`);
console.log('=== page errors ===');
for (const e of pageErrors) console.log(`[ERR] ${e}`);
console.log('=== failed requests ===');
for (const r of failedRequests) console.log(`[REQ] ${r}`);

await browser.close();

const hasErr =
  pageErrors.length > 0 ||
  consoleMessages.some((m) => m.type === 'error') ||
  failedRequests.length > 0;
process.exit(hasErr ? 1 : 0);
