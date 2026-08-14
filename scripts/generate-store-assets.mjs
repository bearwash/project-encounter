import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'store', 'assets');
const iconSource = path.join(root, 'src-tauri', 'icons', 'app-icon-master.svg');
const featureSource = path.join(assets, 'source', 'feature-graphic.svg');

await Promise.all([
  mkdir(path.join(assets, 'icons'), { recursive: true }),
  mkdir(path.join(assets, 'google-play'), { recursive: true }),
  mkdir(path.join(assets, 'iap-products'), { recursive: true }),
]);

const iconTemp = path.join(assets, 'icons', 'icon-rgba.png');
await run('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', iconTemp, iconSource]);
await magick(iconTemp, '-background', '#62c4bd', '-alpha', 'remove', '-alpha', 'off', '-type', 'TrueColor', path.join(assets, 'icons', 'app-store-icon-1024.png'));
await magick(iconTemp, '-resize', '512x512!', '-background', '#62c4bd', '-alpha', 'remove', '-alpha', 'off', '-type', 'TrueColor', path.join(assets, 'icons', 'google-play-icon-512.png'));
await rm(iconTemp, { force: true });
const featureTemp = path.join(assets, 'google-play', 'feature-graphic-rgba.png');
const featureOutput = path.join(assets, 'google-play', 'feature-graphic-1024x500.png');
await run('rsvg-convert', ['-w', '1024', '-h', '500', '-o', featureTemp, featureSource]);
await magick(featureTemp, '-alpha', 'off', '-type', 'TrueColor', featureOutput);
await rm(featureTemp, { force: true });

const products = [
  ['120', '#dce9d8', '1'],
  ['650', '#fff0a1', '5'],
  ['1400', '#b4d8d2', '9'],
];
for (const [coins, background, marks] of products) {
  const args = [
    '-size', '512x512', `xc:${background}`,
    '-stroke', '#20383b', '-strokewidth', '10', '-fill', '#e7b755',
    '-draw', 'circle 256,188 256,78',
    '-fill', '#ffd34d', '-draw', 'polygon 256,105 339,188 256,271 173,188',
    '-fill', '#20383b', '-stroke', 'none',
    '-draw', `rectangle 116,333 396,419`,
    '-fill', '#fffdf0', '-draw', `path 'M 158,350 L 158,401 M 256,350 L 256,401 M 354,350 L 354,401'`,
    '-fill', '#d35043', '-draw', `rectangle 116,433 ${116 + Number(marks) * 28},453`,
    '-depth', '8', '-alpha', 'on', '-type', 'TrueColorAlpha',
    `PNG32:${path.join(assets, 'iap-products', `google-play-coins-${coins}.png`)}`,
  ];
  await magick(...args);
}

console.log('[store-assets] Generated icons, feature graphic, and IAP product art.');

function magick(...args) {
  return run('magick', args);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
