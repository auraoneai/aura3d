#!/usr/bin/env node
// Swap a repainted athlete into every manifest: new file name, sha256 and sizeBytes wherever the old file is referenced,
// copy the new GLB next to the old one and delete the old one (and any tracked copy of it).
// Usage: node rewire.mjs <old.glb> <new.glb> [<old2.glb> <new2.glb> ...]   (old = the tracked file under public/aura-assets)
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) { console.error("usage: rewire.mjs <old.glb> <new.glb> [...]"); process.exit(2); }
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
const TEXT = tracked.filter((f) => /\.(ts|json|md|mjs)$/.test(f) && !f.startsWith("evidence/") && !f.startsWith("node_modules/"));
for (let i = 0; i < args.length; i += 2) {
  const [oldFile, newFile] = [args[i], args[i + 1]];
  const oldName = path.basename(oldFile), newName = path.basename(newFile);
  const oldSha = sha(oldFile), newSha = sha(newFile);
  const oldSize = statSync(oldFile).size, newSize = statSync(newFile).size;
  let touched = 0;
  for (const f of TEXT) {
    let s;
    try { s = readFileSync(f, "utf8"); } catch { continue; }
    if (!s.includes(oldName) && !s.includes(oldSha)) continue;
    s = s.split(oldName).join(newName).split(oldSha).join(newSha);
    let from = 0;
    for (;;) {
      const at = s.indexOf(newSha, from);
      if (at < 0) break;
      from = at + newSha.length;
      const lo = Math.max(0, at - 700), hi = Math.min(s.length, at + 700);
      const win = s.slice(lo, hi);
      const re = new RegExp(`(sizeBytes"?\\s*:\\s*)${oldSize}\\b`);
      if (re.test(win)) { s = s.slice(0, lo) + win.replace(re, `$1${newSize}`) + s.slice(hi); }
    }
    writeFileSync(f, s);
    touched += 1;
  }
  const dest = path.join(path.dirname(oldFile), newName);
  copyFileSync(newFile, dest);
  for (const copy of tracked.filter((f) => path.basename(f) === oldName)) { if (existsSync(copy)) unlinkSync(copy); }
  if (existsSync(oldFile) && oldFile !== dest) unlinkSync(oldFile);
  console.log(JSON.stringify({ old: oldName, new: newName, filesEdited: touched, oldSize, newSize }));
}
