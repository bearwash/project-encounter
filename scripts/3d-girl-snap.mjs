// avatar3d-preview の REFERENCE GIRL Canvas だけを高解像でスクショ。
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

await page.goto('http://localhost:1420/avatar3d-preview', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const section = page.locator('section', { hasText: 'REFERENCE GIRL' }).first();
await section.scrollIntoViewIfNeeded();
const box = await section.boundingBox();
if (!box) throw new Error('section not found');

await page.screenshot({ path: '/tmp/3d-girl.png', clip: box });
console.log('saved /tmp/3d-girl.png');
await browser.close();
