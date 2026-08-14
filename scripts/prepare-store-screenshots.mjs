import { mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'store', 'assets');

await prepareSet({
  source: path.join(assets, 'captures', 'iphone-source'),
  destination: path.join(assets, 'app-store', 'iphone-6.9'),
  size: '1320x2868!',
});

await prepareSet({
  source: path.join(assets, 'captures', 'google-source'),
  destination: path.join(assets, 'google-play', 'phone'),
  size: '1080x1920!',
});

await prepareSet({
  source: path.join(assets, 'captures', 'iap-review'),
  destination: path.join(assets, 'iap-review'),
  size: '1080x1920!',
});

console.log('[store-screenshots] Prepared App Store, Google Play, and development IAP-review images.');

async function prepareSet({ source, destination, size }) {
  await mkdir(destination, { recursive: true });
  const files = (await readdir(source))
    .filter((name) => /\.(?:jpe?g|png)$/i.test(name))
    .sort();

  if (files.length === 0) throw new Error(`No screenshots found in ${source}`);

  for (const file of files) {
    const outputName = `${path.parse(file).name}.png`;
    await run('magick', [
      path.join(source, file),
      '-filter', 'Lanczos',
      '-resize', size,
      '-colorspace', 'sRGB',
      '-depth', '8',
      '-alpha', 'off',
      '-type', 'TrueColor',
      `PNG24:${path.join(destination, outputName)}`,
    ]);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
