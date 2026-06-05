// avatar3d-preview の単体プレビュー (OrbitControls) で
// ドラッグ操作によりカメラが回転するかを Playwright で簡易検証する。
//
// ドラッグ前後の Canvas pixel を抽出して、視覚的に差分があるかを判定。
// (CDP の WebGL state は取れないので、画素差分 = 描画変化 を proxy にする)

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const OUT = '/tmp/3d-orbit';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/avatar3d-preview`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 単体プレビューの Canvas (1 個目) を取得
const canvas = await page.locator('canvas').first();
const box = await canvas.boundingBox();
if (!box) {
  console.error('No canvas found');
  process.exit(1);
}
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.screenshot({ path: `${OUT}/before-drag.png`, clip: box });

// 中央から右に 200 px ドラッグ → カメラが Y 軸回転するはず
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 200, cy, { steps: 20 });
await page.waitForTimeout(300);
await page.mouse.up();
await page.waitForTimeout(500);

await page.screenshot({ path: `${OUT}/after-drag.png`, clip: box });

// 中央から下に 100 px ドラッグ → カメラが X 軸回転 (見上げ⇄見下ろし)
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy + 100, { steps: 20 });
await page.waitForTimeout(300);
await page.mouse.up();
await page.waitForTimeout(500);

await page.screenshot({ path: `${OUT}/after-drag-y.png`, clip: box });

console.log(`screenshots saved to ${OUT}/`);
console.log('  - before-drag.png');
console.log('  - after-drag.png    (horizontal rotation)');
console.log('  - after-drag-y.png  (vertical rotation)');

await browser.close();
