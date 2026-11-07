// usage: node diff.mjs <before.png> <after.png> <out-diff.png>
// Shadow region = pixels where after is darker than before by > 12 (luma), dilated 6px. Outside = everything else.
import sharp from "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-2/node_modules/sharp/lib/index.js";
const [b, a, o] = process.argv.slice(2);
const rb = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const ra = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = rb.info;
const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const dark = new Uint8Array(w * h);
let darkCount = 0;
for (let p = 0; p < w * h; p++) if (luma(rb.data, p * 3) - luma(ra.data, p * 3) > 12) { dark[p] = 1; darkCount++; }
const R = 6, region = new Uint8Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dark[y * w + x])
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) region[yy * w + xx] = 1; }
let sumOut = 0, nOut = 0, sumIn = 0, nIn = 0, regionPx = 0;
const diff = Buffer.alloc(w * h * 3);
for (let p = 0; p < w * h; p++) {
  let d = 0; for (let c = 0; c < 3; c++) d += Math.abs(rb.data[p * 3 + c] - ra.data[p * 3 + c]);
  d /= 3;
  if (region[p]) { sumIn += d; nIn++; regionPx++; } else { sumOut += d; nOut++; }
  const v = Math.min(255, d * 4);
  diff[p * 3] = region[p] ? 255 : v; diff[p * 3 + 1] = region[p] ? v : v; diff[p * 3 + 2] = v;
}
await sharp(diff, { raw: { width: w, height: h, channels: 3 } }).png().toFile(o);
console.log(JSON.stringify({ size: [w, h], darkerPixels: darkCount, shadowRegionPx: regionPx, shadowRegionPct: +(100 * regionPx / (w * h)).toFixed(2), meanAbsDiffOutside: +(sumOut / Math.max(1, nOut)).toFixed(3), meanAbsDiffInside: +(sumIn / Math.max(1, nIn)).toFixed(3) }));
