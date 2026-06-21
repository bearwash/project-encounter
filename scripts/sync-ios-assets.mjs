import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "out");
const target = path.join(root, "src-tauri", "gen", "apple", "assets");

if (!existsSync(source)) {
  throw new Error("Missing Next export output. Run `pnpm build` before syncing iOS assets.");
}

if (!existsSync(path.join(root, "src-tauri", "gen", "apple"))) {
  console.log("[ios:sync-assets] Apple project not generated; skipping.");
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await rewriteAbsoluteAssetPaths(source, source);
await rewriteAbsoluteAssetPaths(target, target);
await writeFile(path.join(source, "index.html"), iosStandaloneHtml(), "utf8");
await writeFile(path.join(target, "index.html"), iosStandaloneHtml(), "utf8");

console.log(`[ios:sync-assets] Synced ${path.relative(root, source)} -> ${path.relative(root, target)}`);

async function rewriteAbsoluteAssetPaths(dir, baseDir) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await rewriteAbsoluteAssetPaths(fullPath, baseDir);
        return;
      }
      if (!/\.(html|txt|js|css)$/.test(entry.name)) return;

      const rel = path.relative(baseDir, fullPath);
      const depth = path.dirname(rel) === "." ? 0 : path.dirname(rel).split(path.sep).length;
      const prefix = depth === 0 ? "./" : "../".repeat(depth);
      const input = await readFile(fullPath, "utf8");
      const output = input
        .replaceAll("/_next/", `${prefix}_next/`)
        .replaceAll("/favicon.svg", `${prefix}favicon.svg`)
        .replaceAll("/avatars/", `${prefix}avatars/`);

      if (output !== input) {
        await writeFile(fullPath, output);
      }
    }),
  );
}

function iosStandaloneHtml() {
  return String.raw`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Project Encounter BLE Check</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #FFFFFF !important; color: #000000 !important; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
    main { position: relative; z-index: 2147483647; box-sizing: border-box; min-height: 100vh; padding: 54px 16px 24px; background: #FFFFFF !important; color: #000000 !important; border: 12px solid #F03232; }
    section { max-width: 430px; margin: 0 auto; background: #FFFFFF !important; }
    .badge { display: inline-block; border-radius: 0; background: #0057FF; color: #FFFFFF; padding: 8px 10px; font-size: 13px; font-weight: 900; letter-spacing: 0; }
    h1 { margin: 18px 0 8px; font-size: 34px; line-height: 1.05; font-weight: 900; color: #000000 !important; }
    p { margin: 0; font-size: 15px; line-height: 1.6; font-weight: 800; color: #000000 !important; }
    .row { display: flex; gap: 10px; margin-top: 22px; }
    button { min-height: 52px; flex: 1; border: 0; border-radius: 8px; background: #000000; color: #FFFFFF; font-size: 14px; font-weight: 900; }
    button:disabled { opacity: .5; }
    pre { margin-top: 18px; min-height: 300px; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 0; border: 3px solid #000000; background: #FFFFFF; color: #000000; padding: 14px; font-size: 12px; line-height: 1.55; font-weight: 800; user-select: text; }
  </style>
</head>
<body style="margin:0;min-height:100%;background:#FFFFFF;color:#000000;">
  <main style="background:#FFFFFF;color:#000000;">
    <section>
      <div class="badge">iOS BLE CHECK</div>
      <h1>VISIBLE BLE CHECK</h1>
      <p>Next/React を使わない確認画面です。ここで BLE 開始と、すれ違った ID の取得状況を確認します。</p>
      <div class="row">
        <button id="start">BLE開始</button>
        <button id="stop">停止</button>
        <button id="refresh">更新</button>
      </div>
      <pre id="log">画面HTMLは読み込めています。Tauri API を確認中...</pre>
    </section>
  </main>
  <script>
    document.documentElement.style.background = '#FFFFFF';
    document.body.style.background = '#FFFFFF';
    document.body.style.color = '#000000';
    console.log('[Project Encounter] iOS standalone BLE page loaded');
    const log = document.getElementById('log');
    const buttons = [...document.querySelectorAll('button')];
    const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
    const write = (value) => {
      log.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    };
    const busy = (value) => buttons.forEach((button) => button.disabled = value);
    async function ensureProfile() {
      const existing = await invoke('profile_get');
      if (existing) return existing;
      return await invoke('profile_save', {
        displayName: 'iPhone Tester',
        avatarCode: 'AVATAVI-S001',
        message: 'BLE check',
        homePrefecture: null
      });
    }
    async function refresh() {
      try {
        const status = await invoke('ble_status');
        write(status);
      } catch (error) {
        write(String(error && error.message ? error.message : error));
      }
    }
    async function startBle() {
      busy(true);
      try {
        const profile = await ensureProfile();
        await invoke('ble_start');
        const status = await invoke('ble_status');
        write({ profile, status });
      } catch (error) {
        write(String(error && error.message ? error.message : error));
      } finally {
        busy(false);
      }
    }
    async function stopBle() {
      busy(true);
      try {
        await invoke('ble_stop');
        await refresh();
      } catch (error) {
        write(String(error && error.message ? error.message : error));
      } finally {
        busy(false);
      }
    }
    document.getElementById('start').addEventListener('click', startBle);
    document.getElementById('stop').addEventListener('click', stopBle);
    document.getElementById('refresh').addEventListener('click', refresh);
    if (!window.__TAURI__ || !window.__TAURI__.core) {
      write('Tauri API が見つかりません: window.__TAURI__.core がありません');
    } else {
      refresh();
      setInterval(refresh, 3000);
    }
  </script>
</body>
</html>`;
}
