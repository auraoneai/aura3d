#!/usr/bin/env node
// Recolours a fighter GLB's baked base-colour atlas by colour family (HSV rules), keeping the shading detail:
// each remapped family keeps its luminance ramp, only the hue and saturation move. Skeleton, mesh and clips are untouched.
// Usage: node tools/iron-crown-restyle/recolor.mjs <in.glb> <out-dir> <name> <preset: kenji|volt> [--preview <png>]
// Output: <out-dir>/<name>.<sha256-8>.glb (prints the file name, size and sha256).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NodeIO } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const [, , inFile, outDir, name, presetName, ...rest] = process.argv;
if (!inFile || !outDir || !name || !presetName) {
  console.error("usage: recolor.mjs <in.glb> <out-dir> <name> <kenji|volt> [--preview out.png]");
  process.exit(2);
}
const previewPath = rest[0] === "--preview" ? rest[1] : null;

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// maps a source brightness ramp [lo..hi] onto a colour ramp dark -> light, keeping the cloth shading
const ramp = (dark, light, v, lo, hi) => mix3(dark, light, clamp01((v - lo) / (hi - lo)));
const c = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
const hueIn = (h, a, b) => (a <= b ? h >= a && h <= b : h >= a || h <= b);

// Each preset returns the new [r,g,b] (0..1) for a source pixel, or null to keep it.
const PRESETS = {
  // Kenji: white gi -> deep teal training jacket, red headband and trim -> dark hair (the black belt stays black).
  kenji(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (v < 0.04) return null;
    // red headband, red trim: absorb into dark hair so the forehead reads bare
    if (hueIn(h, 340, 15) && s > 0.55 && v > 0.25) return ramp(c("#120d0c"), c("#2a1d18"), v, 0.25, 0.95);
    // skin stays
    if (hueIn(h, 8, 40) && s > 0.2 && s <= 0.7 && v > 0.35) return null;
    // white or blue-white cloth
    if (s < 0.3 && v > 0.42) return ramp(c("#0a2f3b"), c("#3a9aa4"), v, 0.62, 1.0);
    return null;
  },
  // Volt: navy bodysuit -> deep burgundy, blue panels -> amber, cyan glow -> hot orange. Skin stays.
  volt(r, g, b) {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (v < 0.03) return null;
    // salmon skin stays
    if (hueIn(h, 5, 35) && s > 0.2 && s < 0.6 && v > 0.55) return null;
    // cyan or teal glow marks -> orange
    if (hueIn(h, 150, 195) && s > 0.35 && v > 0.35) return ramp(c("#c2410c"), c("#ffb347"), v, 0.35, 1.0);
    // bright blue panels (hair, gloves) -> amber
    if (hueIn(h, 196, 225) && s > 0.45 && v > 0.45) return ramp(c("#b45309"), c("#ffc83d"), v, 0.45, 1.0);
    // dark navy suit -> burgundy
    if (hueIn(h, 170, 260) && v < 0.5) return ramp(c("#1c0810"), c("#8a2440"), v, 0.03, 0.4);
    return null;
  }
};
const rule = PRESETS[presetName];
if (!rule) { console.error(`unknown preset "${presetName}"`); process.exit(2); }

const io = new NodeIO();
const doc = await io.read(inFile);
const tex = doc.getRoot().listTextures()[0];
const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let changed = 0;
for (let i = 0; i < data.length; i += 4) {
  const out = rule(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
  if (!out) continue;
  data[i] = Math.round(clamp01(out[0]) * 255);
  data[i + 1] = Math.round(clamp01(out[1]) * 255);
  data[i + 2] = Math.round(clamp01(out[2]) * 255);
  changed += 1;
}
const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
if (previewPath) await sharp(png).resize(900).jpeg({ quality: 82 }).toFile(previewPath);
tex.setImage(new Uint8Array(png));
mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, `${name}.tmp.glb`);
await io.write(tmp, doc);
const buf = readFileSync(tmp);
const hash = createHash("sha256").update(buf).digest("hex");
const file = `${name}.${hash.slice(0, 8)}.glb`;
renameSync(tmp, path.join(outDir, file));
console.log(JSON.stringify({ file, sizeBytes: buf.length, sha256: hash, pixelsChanged: changed, pixels: info.width * info.height }));
