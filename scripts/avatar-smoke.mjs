// Avatar / AvatarEditor を Playwright で検証する。
// 使い方:
//   1) pnpm exec next dev -p 3001  (or AVATAR_PREVIEW_URL を指定)
//   2) node scripts/avatar-smoke.mjs
// スクショ出力: /tmp/avatar-smoke/*.png
//
// チェック項目:
// - /avatar-preview が 200 で開く
// - 4 軸 SVG パーツが全アバターで描画されている
// - AvatarEditor のタブ切替で表示パーツが入れ替わる
// - パーツボタン押下で上部 3 体 (idle/walking/popup) のコードが同期する
// - CSS アニメ (breath / step / blink) が running
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

page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

console.log(`▶ ${BASE}`);
const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30_000 });
console.log(`  status: ${resp?.status()}`);

// 全 avatar (3 modes + 4 fallback + editor preview + 4 swatch = 12) の layer が
// 埋まるまで待つ。最初の 3 体だけでも先に確認する。
await page.waitForSelector('[data-testid="mode-idle"] .avatar-figure', { timeout: 15_000 });
await page.waitForFunction(
  () => {
    const ids = ['mode-idle', 'mode-walking', 'mode-popup'];
    return ids.every((id) => {
      const svg = document.querySelector(`[data-testid="${id}"] .avatar-figure`);
      return svg && ['base', 'hair', 'outfit', 'face'].every(
        (a) => svg.querySelector(`.layer-${a}`)?.innerHTML.trim(),
      );
    });
  },
  { timeout: 15_000 },
);

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
      return document.querySelectorAll(`[data-testid^="pick-${axis}-"]`).length === 4;
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

// --- アニメ確認: CSS @keyframes が running か ---
const animProbe = await page.evaluate(() => {
  const probe = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      name: cs.animationName,
      duration: cs.animationDuration,
      state: cs.animationPlayState,
    };
  };
  return {
    breath: probe('[data-testid="mode-idle"] .avatar-figure'),
    stepL: probe('[data-testid="mode-walking"] .avatar-figure .leg-l'),
    stepR: probe('[data-testid="mode-walking"] .avatar-figure .leg-r'),
    blink: probe('[data-testid="mode-idle"] .avatar-figure .eyes'),
  };
});
console.log('  anim:', JSON.stringify(animProbe));

// --- フォールバック: 4 ケースすべて 4 軸描画されているか ---
const fallback = await page.evaluate(() => {
  const ids = [
    'fallback-empty',
    'fallback-xyz',
    'fallback-b01_h99_o03_f01',
    'fallback-b01_h02_o03',
  ];
  return ids.map((id) => {
    const fig = document.querySelector(`[data-testid="${id}"] .avatar-figure`);
    return {
      id,
      base: !!fig?.querySelector('.layer-base')?.innerHTML.trim(),
      hair: !!fig?.querySelector('.layer-hair')?.innerHTML.trim(),
      outfit: !!fig?.querySelector('.layer-outfit')?.innerHTML.trim(),
      face: !!fig?.querySelector('.layer-face')?.innerHTML.trim(),
    };
  });
});
console.log('  fallback:', JSON.stringify(fallback));

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
