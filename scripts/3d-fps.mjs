// 3D ページのフレームレートを Playwright + requestAnimationFrame で簡易計測。
// ヘッドレス Chromium は実機 (中位 Android) より一般に速いので、
// あくまで「明らかに重いか」「30fps を切るか」の初期指標として使う。
//
// 使い方:
//   pnpm dev          # 別ターミナルで 1420 番起動済み
//   node scripts/3d-fps.mjs
//
// 計測対象:
//   - /avatar3d-preview (CROWD = 30 体 1 Canvas + 他 4 Canvas)
//   - /plaza-preview?count=60 相当 (住人 60 人ボタンを押す)
//   - /plaza-preview (住人 8 人, デフォルト)
//
// 出力: 各シナリオの 5 秒間 平均 FPS + 最低 FPS。

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const DURATION_MS = 5000;

const SCENARIOS = [
  { key: 'avatar3d-all', url: `${BASE}/avatar3d-preview`, prepare: null },
  { key: 'plaza-8',      url: `${BASE}/plaza-preview`,    prepare: null },
  {
    key: 'plaza-60',
    url: `${BASE}/plaza-preview`,
    prepare: async (page) => {
      // count=60 ボタンを押す
      await page.click('[data-testid="count-60"]');
      await page.waitForTimeout(500);
    },
  },
];

async function measureFps(page, durationMs) {
  return page.evaluate(
    async (dur) => {
      const frames = [];
      let raf;
      const start = performance.now();
      let last = start;
      await new Promise((resolve) => {
        const tick = (now) => {
          frames.push(now - last);
          last = now;
          if (now - start >= dur) {
            resolve();
          } else {
            raf = requestAnimationFrame(tick);
          }
        };
        raf = requestAnimationFrame(tick);
      });
      cancelAnimationFrame(raf);
      // 1 フレーム目は計測開始のジッタなので捨てる
      const frameTimes = frames.slice(1);
      const avgMs = frameTimes.reduce((s, x) => s + x, 0) / frameTimes.length;
      const maxMs = Math.max(...frameTimes);
      return {
        frames: frameTimes.length,
        avgMs,
        maxMs,
        avgFps: 1000 / avgMs,
        minFps: 1000 / maxMs,
      };
    },
    durationMs,
  );
}

const browser = await chromium.launch({ headless: true });

for (const s of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();

  console.log(`\n=== ${s.key.padEnd(16)} (${s.url}) ===`);
  await page.goto(s.url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000); // Canvas 初期化を待つ
  if (s.prepare) await s.prepare(page);
  await page.waitForTimeout(1500); // シナリオ準備後の安定待ち

  const r = await measureFps(page, DURATION_MS);
  console.log(`  frames     : ${r.frames}`);
  console.log(`  avg ms     : ${r.avgMs.toFixed(2)}`);
  console.log(`  max ms     : ${r.maxMs.toFixed(2)}`);
  console.log(`  avg FPS    : ${r.avgFps.toFixed(1)}`);
  console.log(`  min FPS    : ${r.minFps.toFixed(1)}`);

  await ctx.close();
}

await browser.close();
console.log('\ndone.');
