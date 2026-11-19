#!/usr/bin/env node
// Thin wrapper over `aura3d assets slim` (packages/aura3d-cli/src/commands/asset-post/slim.ts): re-encode PNG normal
// maps in Idol GLBs as JPEG (q92). Rewrites files in place (never when the result would not be smaller).
//   node tools/idol/slim.mjs <file.glb> [more.glb ...]
// Loads the CLI source through tsx when available (in-repo, no build needed), else the built packages/aura3d-cli/dist.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/aura3d-cli");

async function load() {
  const tsx = await import("tsx/esm/api").catch(() => null);
  if (tsx) return tsx.tsImport(pathToFileURL(resolve(cliRoot, "src/commands/asset-post/slim.ts")).href, import.meta.url);
  return import(pathToFileURL(resolve(cliRoot, "dist/commands/asset-post/slim.js")).href);
}

/** Returns { file, before, after, output, reencoded, written }. */
export async function slimGlb(file, opts = {}) {
  const impl = await load();
  return impl.slimGlb(file, opts);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const f of process.argv.slice(2)) {
    const r = await slimGlb(f);
    console.log(`${f}: ${(r.before / 1e6).toFixed(2)} -> ${(r.after / 1e6).toFixed(2)} MB`);
  }
}
