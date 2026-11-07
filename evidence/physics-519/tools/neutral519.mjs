// Copies the lane 519 neutrality frames into evidence/physics-519/neutrality and writes frames.json (sha256 of every captured frame,
// the capture metadata and errors, and the pixel diffs from pixdiff.mjs). Byte-identical frames are stored once.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const D = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1/evidence/physics-519/neutrality";
const F = "/tmp/phys519/games/frames";
const games = process.argv.slice(2);
fs.mkdirSync(D, { recursive: true });
const diffs = JSON.parse(fs.readFileSync("/tmp/phys519/games/pixdiff.json", "utf8"));
const frames = {};
const stored = new Map();
for (const g of games) {
  frames[g] = {};
  for (const v of ["base", "branch"]) for (const s of ["a", "b"]) {
    const name = `${v}-${g}-${s}`;
    const file = path.join(F, `${name}.png`);
    if (!fs.existsSync(file)) { frames[g][`${v}-${s}`] = "not captured"; continue; }
    const png = fs.readFileSync(file);
    const hash = crypto.createHash("sha256").update(png).digest("hex");
    const metaFile = path.join(F, `${name}.json`);
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    if (!stored.has(hash)) { stored.set(hash, `${name}.png`); fs.writeFileSync(path.join(D, `${name}.png`), png); }
    frames[g][`${v}-${s}`] = { sha256: hash, storedAs: stored.get(hash), info: meta.info ?? null, errors: meta.errors ?? [] };
  }
}
fs.writeFileSync(path.join(D, "frames.json"), JSON.stringify({ frames, pixelDiffs: diffs }, null, 1) + "\n");
console.log("stored", stored.size, "unique frames");
