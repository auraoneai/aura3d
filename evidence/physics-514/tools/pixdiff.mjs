// usage: node pixdiff.mjs <framesDir> <out.json> <game>...
// For each game compares base-a vs base-b (noise) and base-a vs branch-a (change): mean abs RGB diff (0-255), share of pixels with
// any channel differing, share differing by > 8, and the bounding box of differing pixels.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_37e6949c-ca0-1/package.json");
const sharp = require("sharp");
const [dir, out, ...games] = process.argv.slice(2);
const load = async (f) => { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const cmp = async (fa, fb) => {
  const [a, b] = await Promise.all([load(fa), load(fb)]);
  if (a.w !== b.w || a.h !== b.h) return { sizeMismatch: true };
  let sum = 0, any = 0, big = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < a.data.length; i += 3, p++) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    sum += d;
    if (d > 0) { any++; const x = p % a.w, y = (p / a.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 8) big++;
  }
  const n = a.w * a.h;
  return { meanAbsDiff: +(sum / (n * 3)).toFixed(4), pixelsDiffering: +(any / n).toFixed(5), pixelsDifferingOver8: +(big / n).toFixed(5), diffBox: x1 < 0 ? null : [x0, y0, x1, y1] };
};
const result = {};
for (const g of games) {
  const f = (v, s) => path.join(dir, `${v}-${g}-${s}.png`);
  result[g] = { noise_baseA_vs_baseB: await cmp(f("base", "a"), f("base", "b")), change_baseA_vs_branchA: await cmp(f("base", "a"), f("branch", "a")), change_baseB_vs_branchA: await cmp(f("base", "b"), f("branch", "a")) };
  console.log(g, JSON.stringify(result[g]));
}
fs.writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
