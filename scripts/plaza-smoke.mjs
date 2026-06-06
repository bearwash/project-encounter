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

async function waitForPlazaCanvas() {
  const canvas = page.locator('[data-testid="encounter-plaza-3d"] canvas');
  await canvas.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await canvas.boundingBox();
  if (!box || box.width < 300 || box.height < 300) {
    throw new Error(`plaza canvas has invalid box: ${JSON.stringify(box)}`);
  }
  return box;
}

page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

console.log(`▶ ${BASE}`);
const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
console.log(`  status: ${resp?.status()}`);

// --- 空状態 ---
await page.locator('[data-testid="count-0"]').click();
await waitForPlazaCanvas();
await page.getByText('まだだれもいないみたい').waitFor({ timeout: 5_000 });
await page.getByText('歩き出すと、ここに住人が増えていくよ').waitFor({ timeout: 5_000 });
const emptyText = await page.getByText('まだだれもいないみたい').count();
console.log(`  empty state visible: ${emptyText === 1}`);
await page.screenshot({ path: `${OUT_DIR}/01-empty.png`, fullPage: true });

// --- 1 人 ---
await page.locator('[data-testid="count-1"]').click();
await page.getByText('住人 1 人').waitFor({ timeout: 5_000 });
const canvas1 = await waitForPlazaCanvas();
console.log(`  1 person canvas: ${Math.round(canvas1.width)}x${Math.round(canvas1.height)}`);
await page.screenshot({ path: `${OUT_DIR}/02-one.png`, fullPage: true });

// --- 32 人: Canvas が維持され、カメラパンできる ---
await page.locator('[data-testid="count-32"]').click();
await page.getByText('住人 32 人').waitFor({ timeout: 5_000 });
const canvas32 = await waitForPlazaCanvas();
await page.mouse.move(canvas32.x + canvas32.width * 0.75, canvas32.y + canvas32.height * 0.5);
await page.mouse.down();
await page.mouse.move(canvas32.x + canvas32.width * 0.25, canvas32.y + canvas32.height * 0.5, {
  steps: 8,
});
await page.mouse.up();
console.log(`  32 people canvas: ${Math.round(canvas32.width)}x${Math.round(canvas32.height)}`);
await page.screenshot({ path: `${OUT_DIR}/03-thirty-two.png`, fullPage: true });

// --- 60 人: 多人数でも Canvas が落ちない ---
await page.locator('[data-testid="count-60"]').click();
await page.getByText('住人 60 人').waitFor({ timeout: 5_000 });
const canvas60 = await waitForPlazaCanvas();
console.log(`  60 people canvas: ${Math.round(canvas60.width)}x${Math.round(canvas60.height)}`);
await page.screenshot({ path: `${OUT_DIR}/04-sixty.png`, fullPage: true });

// --- 8 人 + 合流アニメテスト ---
await page.locator('[data-testid="count-8"]').click();
await page.getByText('住人 8 人').waitFor({ timeout: 5_000 });
await waitForPlazaCanvas();
await page.locator('[data-testid="join-demo"]').click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT_DIR}/05-join-demo.png`, fullPage: true });
console.log('  join demo replayed');

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
