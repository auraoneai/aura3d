#!/usr/bin/env node
/* Where do two arms of a wp7.json differ? Histogram of abs luma diffs and a coarse 16x9 block map of the mean diff.
   Usage: node wp7-diffmap.mjs <wp7.json> <scene> [armA=aura-auto] [armB=aura-production] */
import { readFileSync } from "node:fs";

const [file, scene, a = "aura-auto", b = "aura-production"] = process.argv.slice(2);
const d = JSON.parse(readFileSync(file, "utf8"));
const A = Buffer.from(d[`${scene}/${a}`].luma, "base64");
const B = Buffer.from(d[`${scene}/${b}`].luma, "base64");
const W = 640, H = 360;
const hist = new Map();
let signed = 0;
for (let i = 0; i < W * H; i++) { const v = A[i] - B[i]; signed += v; const k = Math.min(Math.abs(v), 10); hist.set(k, (hist.get(k) ?? 0) + 1); }
console.log(`${scene}: ${a} - ${b} mean signed diff ${(signed / (W * H)).toFixed(3)}`);
console.log("abs diff histogram:", [...hist.entries()].sort((x, y) => x[0] - y[0]).map(([k, n]) => `${k === 10 ? "10+" : k}:${n}`).join(" "));
const BW = 40, BH = 40;
for (let by = 0; by < H / BH; by++) {
  let row = "";
  for (let bx = 0; bx < W / BW; bx++) {
    let s = 0;
    for (let y = by * BH; y < (by + 1) * BH; y++) for (let x = bx * BW; x < (bx + 1) * BW; x++) s += A[y * W + x] - B[y * W + x];
    row += (s / (BW * BH)).toFixed(1).padStart(6);
  }
  console.log(row);
}
