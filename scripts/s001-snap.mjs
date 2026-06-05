// AVATAVI S001 のリファレンスブループリント全体と、各 3 面図を個別に PNG 化する。
//
// 出力:
//   /tmp/s001-blueprint.png    全体 (FRONT / RIGHT / BACK + WALK + SPEC)
//   /tmp/s001-front.png        FRONT パネル単体
//   /tmp/s001-right.png        RIGHT SIDE パネル単体
//   /tmp/s001-back.png         BACK パネル単体
//   /tmp/s001-walk.png         WALK CYCLE 行
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1600 },
  deviceScaleFactor: 2, // ピクセルアートらしい高解像
});
const page = await ctx.newPage();

await page.goto('http://localhost:1420/avatavi-s001', { waitUntil: 'networkidle' });
// R3F の最初のレンダリングは遅延が出るので少し待つ
await page.waitForTimeout(3500);

const root = page.locator('main').first();
await root.waitFor({ state: 'visible' });

// 全体
await page.screenshot({ path: '/tmp/s001-blueprint.png', fullPage: true });
console.log('saved /tmp/s001-blueprint.png');

// 個別パネル
const targets = [
  { sel: '[data-testid="s001-front"]', out: '/tmp/s001-front.png' },
  { sel: '[data-testid="s001-right"]', out: '/tmp/s001-right.png' },
  { sel: '[data-testid="s001-back"]', out: '/tmp/s001-back.png' },
  { sel: '[data-testid="s001-walkcycle"]', out: '/tmp/s001-walk.png' },
  { sel: '[data-testid="s001-spec"]', out: '/tmp/s001-spec.png' },
  { sel: '[data-testid="s001-palette"]', out: '/tmp/s001-palette.png' },
];

for (const t of targets) {
  const el = page.locator(t.sel).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) {
    console.warn(`skip (no bounding box): ${t.sel}`);
    continue;
  }
  await page.screenshot({ path: t.out, clip: box });
  console.log(`saved ${t.out}`);
}

await browser.close();
