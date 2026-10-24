#!/usr/bin/env node
// Prunes a built app's dist/aura-assets down to the files the app's source references, so a remote spec can serve it.
// Usage: node tools/likeness-audit/stage-dist.mjs <app-dir> <dist-dir>
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const [, , appDir, distDir] = process.argv;
const root = process.cwd();
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const sources = walk(path.join(appDir, "src")).filter((f) => /\.tsx?$/.test(f));
const keys = new Set();
const urls = new Set();
for (const f of sources) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/assets\.([A-Za-z0-9_]+)/g)) keys.add(m[1]);
  for (const m of t.matchAll(/assets\["([^"]+)"\]/g)) keys.add(m[1]);
  for (const m of t.matchAll(/"(\/aura-assets\/[^"]+)"/g)) urls.add(m[1]);
}
const manifests = [...sources.filter((f) => /aura-assets/.test(f)), path.join(root, "src/aura-assets.ts")];
for (const mf of manifests) {
  const t = readFileSync(mf, "utf8");
  for (const k of keys) {
    const m = new RegExp(`^\\s*"?${k}"?: \\{`, "m").exec(t);
    if (!m) continue;
    const u = /url: "([^"]+)"/.exec(t.slice(m.index, m.index + 900));
    if (u) urls.add(u[1]);
  }
}
const out = path.join(distDir, "aura-assets");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0, bytes = 0;
for (const u of urls) {
  const src = path.join(root, "public", u);
  if (!existsSync(src)) continue;
  cpSync(src, path.join(distDir, u));
  n += 1; bytes += statSync(src).size;
}
console.log(`${path.basename(appDir)}: ${keys.size} keys, ${n} files, ${(bytes / 1048576).toFixed(1)} MB staged`);
