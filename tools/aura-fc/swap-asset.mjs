// Replaces a shipped athlete GLB with a repaired copy: content-hash rename in public/aura-assets and manifest rewrite.
//   node tools/aura-fc/swap-asset.mjs <old public/aura-assets/<stem>.<hash8>.glb> <new.glb>
import { copyFileSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

const [oldPath, newSource] = process.argv.slice(2);
const m = /^(.*)\.([0-9a-f]{8})\.glb$/.exec(basename(oldPath));
if (!m || !newSource) throw new Error("usage: swap-asset.mjs <old public/aura-assets/stem.hash8.glb> <new.glb>");
const [, stem, old8] = m;
const oldBytes = readFileSync(oldPath);
const oldSha = createHash("sha256").update(oldBytes).digest("hex");
const newBytes = readFileSync(newSource);
const newSha = createHash("sha256").update(newBytes).digest("hex");
const new8 = newSha.slice(0, 8);
const newPath = join(dirname(oldPath), `${stem}.${new8}.glb`);
copyFileSync(newSource, newPath);
let touched = 0;
for (const file of ["src/aura-assets.ts", "aura.assets.json", ...process.argv.slice(4)]) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = before
    .replaceAll(`${stem}.${old8}.glb`, `${stem}.${new8}.glb`)
    .replaceAll(oldSha, newSha)
    .replaceAll(new RegExp(`(sizeBytes"?: )${oldBytes.length}\\b`, "g"), `$1${newBytes.length}`);
  if (after !== before) { writeFileSync(file, after); touched++; console.log("updated", file); }
}
if (newPath !== oldPath) unlinkSync(oldPath);
console.log(JSON.stringify({ stem, old: old8, next: new8, bytes: statSync(newPath).size, filesTouched: touched }));
