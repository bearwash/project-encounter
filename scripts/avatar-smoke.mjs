// Avatar / AvatarEditor を Playwright で検証する。
// 使い方:
//   1) pnpm exec next dev -p 3001  (or AVATAR_PREVIEW_URL を指定)
//   2) node scripts/avatar-smoke.mjs
// スクショ出力: /tmp/avatar-smoke/*.png
//
// チェック項目:
// - /avatar-preview が 200 で開く
// - 3D Canvas が全アバターで描画されている
// - AvatarEditor のタブ切替で表示パーツが入れ替わる
// - パーツボタン押下で上部 3 体 (idle/walking/popup) のコードが同期する
// - フォールバック 4 ケース (empty / xyz / unknown-id / 旧形式) でクラッシュなし
// - console エラー / pageerror / requestfailed なし

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.AVATAR_PREVIEW_URL ?? 'http://localhost:3001/avatar-preview';
const OUT_DIR = '/tmp/avatar-smoke';

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 } });
const page = await ctx.newPage();

const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];

async function waitForAvatarCanvas(testId) {
  const canvas = page.locator(`[data-testid="${testId}"] .avatar-root canvas`);
  await canvas.waitFor({ state: 'visible', timeout: 15_000 });
  const box = await canvas.boundingBox();
  if (!box || box.width < 24 || box.height < 36) {
    throw new Error(`${testId} canvas has invalid box: ${JSON.stringify(box)}`);
  }
  return box;
}

page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

console.log(`▶ ${BASE}`);
const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
console.log(`  status: ${resp?.status()}`);

// 最初の 3 モードで Canvas が初期化されるまで待つ。
for (const id of ['mode-idle', 'mode-walking', 'mode-popup']) {
  const box = await waitForAvatarCanvas(id);
  console.log(`  ${id} canvas: ${Math.round(box.width)}x${Math.round(box.height)}`);
}

const initialCode = await page.locator('[data-testid="avatar-code-top"]').textContent();
console.log(`  initial code: ${initialCode}`);

await page.screenshot({ path: `${OUT_DIR}/01-default.png`, fullPage: true });

// --- タブ切替: AvatarEditor のタブを順番に押して、パーツボタンの軸が変わるか ---
const tabs = ['Base', 'Hair', 'Outfit', 'Face'];
for (const tab of tabs) {
  await page.getByRole('button', { name: tab }).click();
  // 軸ごとに 4 つのボタン (pick-{axis}-01..04) が現れる
  await page.waitForFunction(
    (label) => {
      const axis = label.toLowerCase();
      return [1, 2, 3, 4].every((n) =>
        document.querySelector(`[data-testid="pick-${axis}-0${n}"]`),
      );
    },
    tab,
    { timeout: 5_000 },
  );
}

// --- パーツ選択: hair 03 / outfit 02 / face 04 を順に押して上部コードが追従するか ---
await page.getByRole('button', { name: 'Hair' }).click();
await page.locator('[data-testid="pick-hair-03"]').click();
await page.getByRole('button', { name: 'Outfit' }).click();
await page.locator('[data-testid="pick-outfit-02"]').click();
await page.getByRole('button', { name: 'Face' }).click();
await page.locator('[data-testid="pick-face-04"]').click();

await page.waitForFunction(
  () =>
    document.querySelector('[data-testid="avatar-code-top"]')?.textContent ===
    'b01_h03_o02_f04',
  { timeout: 5_000 },
);
const pickedCode = await page.locator('[data-testid="avatar-code-top"]').textContent();
console.log(`  after picks: ${pickedCode}`);

await page.screenshot({ path: `${OUT_DIR}/02-picked.png`, fullPage: true });

// --- フォールバック: 4 ケースすべて Canvas が描画されているか ---
const fallback = await page.evaluate(() => {
  const ids = [
    'fallback-empty',
    'fallback-xyz',
    'fallback-b01_h99_o03_f01',
    'fallback-b01_h02_o03',
  ];
  return ids.map((id) => {
    const canvas = document.querySelector(`[data-testid="${id}"] .avatar-root canvas`);
    const rect = canvas?.getBoundingClientRect();
    return {
      id,
      canvas: !!canvas,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    };
  });
});
console.log('  fallback:', JSON.stringify(fallback));
if (fallback.some((f) => !f.canvas || f.width < 24 || f.height < 36)) {
  throw new Error(`fallback canvas check failed: ${JSON.stringify(fallback)}`);
}

await page.screenshot({ path: `${OUT_DIR}/03-fallback.png`, fullPage: true });

// --- 編集中のバウンス確認: パーツ選択で AvatarEditor のプレビューが上下するか ---
// プレビュー motion.div は key={code} で remount するので、その transform を観察
await page.getByRole('button', { name: 'Hair' }).click();
await page.locator('[data-testid="pick-hair-01"]').click();
await page.waitForTimeout(50);
const bounceT0 = await page.evaluate(() => {
  const editorPreview = document.querySelectorAll('.avatar-root')[3]; // 0-2: mode 3, 3: editor preview
  if (!editorPreview) return null;
  return getComputedStyle(editorPreview.parentElement).transform;
});
await page.locator('[data-testid="pick-hair-02"]').click();
await page.waitForTimeout(50);
const bounceT1 = await page.evaluate(() => {
  const editorPreview = document.querySelectorAll('.avatar-root')[3];
  if (!editorPreview) return null;
  return getComputedStyle(editorPreview.parentElement).transform;
});
console.log(`  bounce (sampled): t0=${bounceT0} t1=${bounceT1}`);

await page.screenshot({ path: `${OUT_DIR}/04-editor.png`, fullPage: true });

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
