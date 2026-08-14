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
        .replaceAll("/favicon.png", `${prefix}favicon.png`)
        .replaceAll("/avatars/", `${prefix}avatars/`);

      if (output !== input) {
        await writeFile(fullPath, output);
      }
    }),
  );
}
