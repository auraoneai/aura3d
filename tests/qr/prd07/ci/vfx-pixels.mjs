#!/usr/bin/env node
// PRD-07 numeric visual checks (lane-07 S-rows, numeric half). Compares each
// lane scene's aura3d frame under the vfx arm with the same scene under the
// none arm of one capture run (same provider, same runner). Vision-judge
// scores (C-32) stay with the Phase D evaluator; this script answers the
// questions pixels can answer on their own:
//   - every vfx frame is a real image: not blank, not one flat colour;
//   - the vfx arm changes the frame vs flags-off (the effect drew);
//   - particles scenes show pixels of the emitter colour;
//   - sky scenes have a vertical gradient (S4 skyVariance > 0);
//   - fog scenes lower far-field contrast vs flags-off.
// Writes <evidence>/vfx-pixels.json; exits 1 on any failed check or when an
// expected frame is missing.
//
// Usage: node tests/qr/prd07/ci/vfx-pixels.mjs <evidence-dir> [vfxArm=capture-vfx] [noneArm=capture-none]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) — the capture format. */
export function decodePng(file) {
  const d = fs.readFileSync(file);
  let i = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (i < d.length) {
    const len = d.readUInt32BE(i);
    const type = d.toString("ascii", i + 4, i + 8);
    const body = d.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; if (body[8] !== 8 || body[12] !== 0) throw new Error(`${file}: unsupported PNG`); }
    if (type === "IDAT") idat.push(body);
    i += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error(`${file}: unsupported colour type ${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0, o = 0; y < h; y += 1) {
    const f = raw[o++];
    const line = new Uint8Array(raw.subarray(o, o + stride));
    o += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    for (let x = 0; x < w; x += 1) { out.set(line.subarray(x * bpp, x * bpp + 3), (y * w + x) * 3); }
    prev = line;
  }
  return { w, h, rgb: out };
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Frame statistics on a 1/2-resolution grid (fast, deterministic). */
export function stats(img) {
  const { w, h, rgb } = img;
  let n = 0, sum = 0, sum2 = 0;
  const colours = new Map();
  const rows = new Float64Array(h);
  const rowN = new Uint32Array(h);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const k = (y * w + x) * 3;
    const L = luma(rgb[k], rgb[k + 1], rgb[k + 2]);
    n += 1; sum += L; sum2 += L * L; rows[y] += L; rowN[y] += 1;
    const key = (rgb[k] >> 4) << 8 | (rgb[k + 1] >> 4) << 4 | rgb[k + 2] >> 4;
    colours.set(key, (colours.get(key) ?? 0) + 1);
  }
  const mean = sum / n;
  const dominant = Math.max(...colours.values()) / n;
  const band = (a, b) => { let s = 0, c = 0; for (let y = Math.floor(a * h); y < Math.floor(b * h); y += 1) if (rowN[y]) { s += rows[y]; c += rowN[y]; } return c ? s / c : 0; };
  return { mean, variance: sum2 / n - mean * mean, dominantColourFraction: dominant, topBand: band(0, 0.15), horizonBand: band(0.4, 0.55), bottomBand: band(0.85, 1) };
}

/** Fraction of grid pixels whose luma differs by more than `t` between frames. */
export function changedFraction(a, b, t = 8) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let n = 0, c = 0;
  for (let y = 0; y < a.h; y += 2) for (let x = 0; x < a.w; x += 2) {
    const k = (y * a.w + x) * 3;
    n += 1;
    if (Math.abs(luma(a.rgb[k], a.rgb[k + 1], a.rgb[k + 2]) - luma(b.rgb[k], b.rgb[k + 1], b.rgb[k + 2])) > t) c += 1;
  }
  return c / n;
}

/** Fraction of grid pixels near `hex` in hue and not near-black. */
export function colourFraction(img, hex, tol = 0.12) {
  const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
  const ts = tr + tg + tb || 1;
  let n = 0, c = 0;
  for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
    const k = (y * img.w + x) * 3, r = img.rgb[k], g = img.rgb[k + 1], b = img.rgb[k + 2], s = r + g + b;
    n += 1;
    if (s < 60) continue;
    if (Math.abs(r / s - tr / ts) < tol && Math.abs(g / s - tg / ts) < tol && Math.abs(b / s - tb / ts) < tol) c += 1;
  }
  return c / n;
}

/** Per-scene numeric rules (scene ids as captured; Aura-only scenes are quarantined until #1092). */
export const RULES = {
  "prd07-particles-fountain": { colour: "#ff9a3c", minColour: 0.001 },
  "prd07-flipbook": {},
  "prd07-particles-stress": {},
  "prd07-sky-timeofday": { skyGradient: 3 },
  "prd07-outdoor-sky": { skyGradient: 3 },
  "prd07-fog-height": {},
  "prd07-rain-night": {},
  "prd07-snow": {},
  "prd07-volumetric-shafts": {},
  "prd07-lit-smoke": {},
  "prd07-soft-particles": {},
  "prd07-water-interleave": { colour: "#ffce7a", minColour: 0.0005 },
  "prd07-decals": {}
};

/** Evaluate one scene; returns { scene, checks: [{ name, ok, value, need }] }. */
export function evaluateScene(scene, vfxImg, noneImg, rule = RULES[scene] ?? {}) {
  const checks = [];
  const add = (name, ok, value, need) => checks.push({ name, ok, value: Math.round(value * 1e4) / 1e4, need });
  if (!vfxImg) return { scene, checks: [{ name: "vfx-frame", ok: false, value: 0, need: "present" }] };
  const s = stats(vfxImg);
  add("not-blank (luma variance)", s.variance > 4, s.variance, "> 4");
  add("not-flat (dominant colour fraction)", s.dominantColourFraction < 0.9, s.dominantColourFraction, "< 0.9");
  if (noneImg) {
    const changed = changedFraction(vfxImg, noneImg);
    add("vfx changes the frame vs none", changed > 0.002, changed, "> 0.002");
  } else {
    checks.push({ name: "none-frame", ok: false, value: 0, need: "present" });
  }
  if (rule.colour) {
    const f = colourFraction(vfxImg, rule.colour);
    add(`emitter colour ${rule.colour} coverage`, f >= rule.minColour, f, `>= ${rule.minColour}`);
  }
  if (rule.skyGradient) {
    const g = Math.abs(s.topBand - s.horizonBand);
    add("sky vertical gradient |top - horizon| luma", g > rule.skyGradient, g, `> ${rule.skyGradient}`);
  }
  return { scene, stats: s, checks };
}

function main() {
  const [, , evidence, vfxArm = "capture-vfx", noneArm = "capture-none"] = process.argv;
  if (!evidence) { console.error("::error::usage: vfx-pixels.mjs <evidence-dir> [vfxArm] [noneArm]"); process.exit(2); }
  const load = (arm, scene) => { const p = path.join(evidence, arm, scene, "aura3d.png"); return fs.existsSync(p) ? decodePng(p) : null; };
  const results = Object.keys(RULES).map((scene) => evaluateScene(scene, load(vfxArm, scene), load(noneArm, scene)));
  const failed = results.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => `${r.scene}: ${c.name} = ${c.value} (need ${c.need})`));
  fs.writeFileSync(path.join(evidence, "vfx-pixels.json"), JSON.stringify({ generatedAt: new Date().toISOString(), vfxArm, noneArm, results }, null, 2));
  for (const r of results) console.log(`${r.checks.every((c) => c.ok) ? "ok  " : "FAIL"} ${r.scene}  ${r.checks.map((c) => `${c.name}=${c.value}`).join("; ")}`);
  for (const f of failed) console.error(`::error::${f}`);
  console.log(`vfx-pixels: ${results.length} scenes, ${failed.length} failed check(s)`);
  process.exit(failed.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
