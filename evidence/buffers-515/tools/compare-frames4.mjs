// usage: node compare-frames4.mjs <frames-dir> <out.json>
// For every <slug>.base.png with base2/branch/branch2 siblings: mean absolute difference (0-255, RGB) for all pairs.
// Noise floor = max(base vs base2, branch vs branch2); regression signal = base-vs-branch pairs.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [dir, out] = process.argv.slice(2);
const raw = async (file) => { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const mad = (a, b) => { if (a.w !== b.w || a.h !== b.h) return null; let s = 0; for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]); return s / a.data.length; };
const labels = ["base", "base2", "branch", "branch2"];
const rows = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".base.png")).sort()) {
  const slug = f.replace(/\.base\.png$/, "");
  const img = {}, real = {};
  for (const l of labels) {
    img[l] = await raw(path.join(dir, `${slug}.${l}.png`));
    real[l] = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.${l}.json`), "utf8")).real;
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  const row = {
    slug, real,
    base_base2: r(mad(img.base, img.base2)), branch_branch2: r(mad(img.branch, img.branch2)),
    base_branch: r(mad(img.base, img.branch)), base_branch2: r(mad(img.base, img.branch2)),
    base2_branch: r(mad(img.base2, img.branch)), base2_branch2: r(mad(img.base2, img.branch2)),
  };
  row.noiseFloor = Math.max(row.base_base2, row.branch_branch2);
  row.maxCross = Math.max(row.base_branch, row.base_branch2, row.base2_branch, row.base2_branch2);
  row.minCross = Math.min(row.base_branch, row.base_branch2, row.base2_branch, row.base2_branch2);
  row.withinNoise = row.minCross <= row.noiseFloor || row.maxCross === 0;
  rows.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
