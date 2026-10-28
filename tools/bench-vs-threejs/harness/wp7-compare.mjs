#!/usr/bin/env node
/* One line per arm (draws, programs, CPU and total frame time, luma) for each wp7.json, plus the luma difference of each aura arm against
   `aura-production` of the SAME file and against `aura-production` of the first file.
   Committed files have no luma planes; for those the stored `vsProduction` (computed in the spec from the planes), `jpegMd5` and `lumaSha256` are printed instead.
   Usage: node wp7-compare.mjs <wp7.json> [more wp7.json ...] */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const luma = (r) => Buffer.from(r.luma, "base64");
const W = 640, H = 360;
/** Mean and max abs diff over all pixels, and over the interior (a pixel whose 3x3 neighbourhood in BOTH frames is flat: max-min <= 8). */
function diff(a, b) {
  let sum = 0, max = 0, n = 0, isum = 0, imax = 0, inn = 0;
  const flat = (buf, x, y) => {
    let lo = 255, hi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = buf[(y + dy) * W + x + dx]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo <= 8;
  };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const d = Math.abs(a[y * W + x] - b[y * W + x]);
    sum += d; n++; if (d > max) max = d;
    if (flat(a, x, y) && flat(b, x, y)) { isum += d; inn++; if (d > imax) imax = d; }
  }
  return { mean: sum / n, max, interiorMean: inn ? isum / inn : 0, interiorMax: imax, interiorShare: inn / n };
}
const first = load(files[0]);
for (const f of files) {
  const data = load(f);
  console.log(`\n## ${f}`);
  for (const [arm, r] of Object.entries(data)) {
    const draws = r.structure.frame.filter((e) => e.k === "draw").length;
    const progs = Object.keys(r.structure.programs).length;
    const t = r.timing;
    console.log(`${arm.padEnd(34)} draws=${String(draws).padStart(3)} programs=${progs} cpu=${t.cpuMsMedian.toFixed(2)}ms total=${t.totalMsMedian.toFixed(1)}ms (runs ${t.runs.map((x) => x.totalMs.toFixed(0)).join("/")}) luma=${r.lumaMean.toFixed(2)} console=${r.console.length}${r.lumaSha256 ? ` lumaSha256=${r.lumaSha256.slice(0, 12)} jpegMd5=${r.jpegMd5.slice(0, 12)}` : ""}`);
  }
  for (const [arm, r] of Object.entries(data)) {
    if (!arm.includes("aura-auto")) continue;
    const scene = arm.split("/")[0];
    if (!r.luma) {
      const d = r.vsProduction;
      if (d) console.log(`  ${arm} vs same-file production (stored): mean=${d.mean.toFixed(3)} max=${d.max} interiorMean=${d.interiorMean.toFixed(3)} interiorMax=${d.interiorMax} (interior ${(d.interiorShare * 100).toFixed(1)}% of px)`);
      continue;
    }
    for (const [label, ref] of [["same-file production", data[`${scene}/aura-production`]], ["first-file production", first[`${scene}/aura-production`]]]) {
      if (!ref) continue;
      const d = diff(luma(r), luma(ref));
      console.log(`  ${arm} vs ${label}: mean=${d.mean.toFixed(3)} max=${d.max} interiorMean=${d.interiorMean.toFixed(3)} interiorMax=${d.interiorMax} (interior ${(d.interiorShare * 100).toFixed(1)}% of px)`);
    }
  }
}
