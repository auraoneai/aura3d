#!/usr/bin/env node
// Regenerate packages/create-aura3d/template-assets.json and the matching "!templates/..." exclusions in its package.json
// "files" (audit RH-14). Run after adding, removing or changing a template binary of 256 KB or more.
//   node tools/create-aura3d/template-assets.mjs           write
//   node tools/create-aura3d/template-assets.mjs --check   exit 1 if either file is out of date
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkgDir = join(root, "packages", "create-aura3d");
const MIN = 256 * 1024;
const EXT = [".glb", ".gltf", ".bin", ".wav", ".ogg", ".mp3", ".ktx2", ".hdr"];
const MARK = "!templates/**/__on-demand-assets__";

const src = readFileSync(join(pkgDir, "src", "index.ts"), "utf8");
const templates = [...src.match(/CREATE_AURA3D_TEMPLATES = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
const walk = (dir, out = []) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (["node_modules", "dist", "test-results"].includes(e.name)) continue; const p = join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

const manifest = { schema: "create-aura3d/template-assets@1", templates: {} };
for (const t of templates) {
  const dir = join(pkgDir, "templates", t);
  const entries = [];
  for (const file of walk(dir).sort()) {
    const rel = relative(dir, file).split(sep).join("/");
    const size = statSync(file).size;
    if (size < MIN || !EXT.some((x) => rel.toLowerCase().endsWith(x))) continue;
    entries.push({ path: rel, bytes: size, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") });
  }
  if (entries.length) manifest.templates[t] = entries;
}
const manifestText = JSON.stringify(manifest, null, 2) + "\n";

const pkgPath = join(pkgDir, "package.json");
const pkgText = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgText);
// Everything after the MARK entry is generated; entries before it are hand-written and kept as they are.
const markAt = pkg.files.indexOf(MARK);
const kept = (markAt >= 0 ? pkg.files.slice(0, markAt) : pkg.files).filter((f) => f !== "template-assets.json");
const exclusions = Object.entries(manifest.templates).flatMap(([t, entries]) => entries.map((e) => `!templates/${t}/${e.path}`));
const files = [...kept, "template-assets.json", MARK, ...exclusions];
const nextPkg = JSON.stringify({ ...pkg, files }, null, 2) + "\n";

const manifestPath = join(pkgDir, "template-assets.json");
let current = ""; try { current = readFileSync(manifestPath, "utf8"); } catch { /* first run */ }
const bytes = Object.values(manifest.templates).flat().reduce((s, e) => s + e.bytes, 0);
if (process.argv.includes("--check")) {
  const stale = [current !== manifestText && "template-assets.json", pkgText !== nextPkg && "package.json files"].filter(Boolean);
  if (stale.length) { console.error(`STALE ${stale.join(", ")}: run node tools/create-aura3d/template-assets.mjs`); process.exit(1); }
  console.log(`ok ${exclusions.length} on-demand assets, ${(bytes / 1048576).toFixed(1)} MB`);
} else {
  writeFileSync(manifestPath, manifestText);
  writeFileSync(pkgPath, nextPkg);
  console.log(`wrote ${exclusions.length} on-demand assets, ${(bytes / 1048576).toFixed(1)} MB`);
}
