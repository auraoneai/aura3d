// usage: node compare.mjs <framesDir> <slug,...> -> JSON: per game, mean absolute RGB difference base1-vs-branch1
// against the noise floor (base1-vs-base2 and branch1-vs-branch2), plus the fraction of pixels differing by > 16.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [dir, slugs] = process.argv.slice(2);
const load = async (label, slug) => (await sharp(path.join(dir, `${label}-${slug}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
const diff = (a, b) => {
  let sum = 0; let over = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    sum += d; if (d > 16) over++;
  }
  const px = a.length / 3;
  return { mad: +(sum / px).toFixed(4), over16: +(over / px).toFixed(5) };
};
const luma = (a) => { let s = 0; for (let i = 0; i < a.length; i += 3) s += (a[i] + a[i + 1] + a[i + 2]) / 3; return +(s / (a.length / 3)).toFixed(2); };
const out = [];
for (const slug of slugs.split(",")) {
  const [b1, b2, r1, r2] = await Promise.all(["base1", "base2", "branch1", "branch2"].map((l) => load(l, slug)));
  const noise = { base: diff(b1.data, b2.data), branch: diff(r1.data, r2.data) };
  const delta = diff(b1.data, r1.data);
  const floor = Math.max(noise.base.mad, noise.branch.mad);
  out.push({ slug, meanLuma: { base1: luma(b1.data), branch1: luma(r1.data) }, baseVsBranch: delta, noise,
    verdict: delta.mad <= Math.max(2 * floor, 0.05) ? "within-noise" : "ABOVE-NOISE" });
}
console.log(JSON.stringify(out, null, 2));
