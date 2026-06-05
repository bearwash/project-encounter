// 実アプリ各ページで S001 がレンダリングされているかを目視確認するスクリーンショット。
//
// 対象:
//   /avatar-preview  Legacy <Avatar /> がすべて S001 になっているか
//   /plaza-preview   3D 広場の住人がすべて S001 か
//
// 出力:
//   /tmp/s001-app-avatar-preview.png
//   /tmp/s001-app-plaza-preview.png
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1600 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const targets = [
  { url: '/avatar-preview', out: '/tmp/s001-app-avatar-preview.png' },
  { url: '/plaza-preview', out: '/tmp/s001-app-plaza-preview.png' },
];

for (const t of targets) {
  await page.goto(`http://localhost:1420${t.url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000); // R3F の初期レンダ猶予
  await page.screenshot({ path: t.out, fullPage: true });
  console.log(`saved ${t.out}`);
}

await browser.close();
