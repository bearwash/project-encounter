// 参照画像 (characterimage1.png) と並べて見比べるための S001 ポートレート単体。
//   /tmp/s001-portrait.png — Canvas 内側のみ (フレーム/ラベル無し) を高解像で撮る。
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto('http://localhost:1420/avatavi-s001', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// FRONT パネル内の Canvas (gradient 背景の div) だけを抜き出す
const inner = page.locator('[data-testid="s001-front"] > div').nth(1); // div: [label, canvas-wrap]
await inner.waitFor({ state: 'visible' });
const box = await inner.boundingBox();
if (!box) throw new Error('canvas wrapper not found');

await page.screenshot({ path: '/tmp/s001-portrait.png', clip: box });
console.log('saved /tmp/s001-portrait.png');

await browser.close();
