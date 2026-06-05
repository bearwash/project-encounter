// 髪の禿げ部分 (頭スキンが透けている所) を探すための多角度スナップ。
// avatar3d-preview の単体ビューを OrbitControls で複数角度に動かして撮る。
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1000, height: 800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto('http://localhost:1420/avatavi-s001', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// FRONT / RIGHT / BACK は既に s001-snap.mjs で出している。
// ここでは少しズーム & 別アングルを取って、頭頂・斜め後ろ・上から眺める。
//
// 戦術: avatar3d-preview の単体 Canvas で OrbitControls を回す。
await page.goto('http://localhost:1420/avatar3d-preview', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const canvas = page.locator('canvas').first();
await canvas.waitFor({ state: 'visible' });
const box = await canvas.boundingBox();
if (!box) throw new Error('canvas not found');

// 単体プレビューの code を S001 にする
await page
  .locator('input[type="text"]')
  .first()
  .fill('b04_h05_o04_f01');
await page.waitForTimeout(500);

// "色" は単体プレビューでは override 出来ないため、S001 専用ページの方を使い直す。
// ただし avatar3d-preview の単体は OrbitControls 付きなので回せる。
//   ※ S001 カラーは出ないが、髪の幾何形状確認は十分。
//
// マウスドラッグでカメラを回す: 上から / 斜め後ろ / 真横 / 真下から など。
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

const angles = [
  { label: 'top-down', dx: 0, dy: 200 }, // 上から見下ろし
  { label: 'low-up', dx: 0, dy: -180 }, // あおり (下から)
  { label: 'back-3q', dx: 300, dy: 0 }, // 背中 3/4
  { label: 'front-3q', dx: -150, dy: 0 }, // 前 3/4
  { label: 'over-shoulder', dx: 180, dy: -80 },
];

for (const a of angles) {
  // 一旦リセット用に元位置からドラッグ
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + a.dx, cy + a.dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `/tmp/s001-inspect-${a.label}.png`,
    clip: box,
  });
  console.log(`saved /tmp/s001-inspect-${a.label}.png`);
  // 戻す
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - a.dx, cy - a.dy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

await browser.close();
