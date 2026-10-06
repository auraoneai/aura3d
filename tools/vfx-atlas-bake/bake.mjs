#!/usr/bin/env node
// PRD-07 P1-T12 — deterministic VFX flipbook atlas bake.
//
//   node tools/vfx-atlas-bake/bake.mjs --seed 7 --size 2048 [--out packages/engine/assets/vfx]
//
// Emits `aura-vfx-<size>.png` + `aura-vfx-<size/2>.png` pages, `manifest.json`
// (AuraVfxAtlasManifest v1) and LICENSE.md. KTX2 twins are emitted only when
// `toktx` is on PATH (logged skip otherwise). Output is byte-stable for a
// fixed (seed, size): no timestamps, fixed zlib level, seeded PRNG.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const SEED = Number(opt("--seed", "7"));
const SIZE = Number(opt("--size", "2048"));
const OUT = opt("--out", "packages/engine/assets/vfx");

// ---------- rng ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
void mulberry32;

// ---------- value noise (seeded, tile-free) ----------
function hash2(ix, iy, s) {
  let h = (ix * 374761393 + iy * 668265263 + s * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.3, y * 2.3, s + 7) * 0.28 + vnoise(x * 5.1, y * 5.1, s + 13) * 0.12;

// ---------- sprite draw functions ----------
// each: (u, v, frame01, seed) -> [r, g, b, a] in 0..1 premultiplied-linear values
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const dot = (r, w = 0.6) => clamp01(1 - Math.max(0, r) / w) ** 2;

const SPRITES = {
  "soft-dot": (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); const a = dot(r, 0.5); return [a, a, a, a]; },
  "glow": (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); const a = Math.exp(-r * r * 18) * 0.9; return [a, a * 0.9, a * 0.75, a]; },
  "flare": (u, v) => { const x = u - 0.5, y = v - 0.5; const h = Math.exp(-Math.abs(y) * 40) * dot(Math.abs(x), 0.5); const vv = Math.exp(-Math.abs(x) * 40) * dot(Math.abs(y), 0.5); const c = dot(Math.hypot(x, y), 0.16); const a = clamp01(h + vv + c); return [a, a * 0.95, a * 0.85, a]; },
  "spark-streak": (u, v) => { const a = dot(Math.abs(v - 0.5), 0.05) * clamp01(1 - Math.abs(u - 0.5) * 2) ** 0.5; return [a, a * 0.8, a * 0.5, a]; },
  "ring": (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); const a = clamp01(1 - Math.abs(r - 0.34) / 0.09); return [a, a, a, a]; },
  "ring-thin": (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); const a = clamp01(1 - Math.abs(r - 0.42) / 0.03); return [a, a, a, a]; },
  "dust-mote": (u, v, _f, s) => { const r = Math.hypot(u - 0.5, v - 0.5); const a = dot(r, 0.2) * (0.6 + 0.4 * fbm(u * 6, v * 6, s)); return [a, a * 0.92, a * 0.8, a]; },
  "bubble": (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5); const rim = clamp01(1 - Math.abs(r - 0.38) / 0.05); const hl = dot(Math.hypot(u - 0.4, v - 0.38), 0.1); const a = clamp01(rim * 0.8 + hl * 0.9 + 0.04 * (1 - r)); return [a, a, a, a]; },
  "rain-streak": (u, v) => { const a = dot(Math.abs(u - 0.5), 0.025) * clamp01(1 - Math.abs(v - 0.5) * 2); return [a * 0.75, a * 0.85, a, a]; },
  "snowflake": (u, v) => { const x = u - 0.5, y = v - 0.5; const ang = Math.atan2(y, x); const arm = Math.cos(ang * 3) ** 20; const r = Math.hypot(x, y); const a = clamp01(arm * dot(r, 0.42) * 1.6 + dot(r, 0.08)); return [a, a, a, a]; },
  "smoke-a": (u, v, f, s) => { const r = Math.hypot(u - 0.5, v - 0.5); const n = fbm(u * 4 + f * 0.3, v * 4 - f * 0.5, s); const a = dot(r, 0.48) * clamp01(n * 1.3) * 0.55; return [a * 0.32, a * 0.33, a * 0.36, a]; },
  "smoke-b": (u, v, f, s) => { const r = Math.hypot(u - 0.5 + 0.1 * Math.sin(f * 6.28), v - 0.5); const n = fbm(u * 5 - f * 0.4, v * 5, s + 3); const a = dot(r, 0.46) * clamp01(n * 1.5) * 0.5; return [a * 0.4, a * 0.4, a * 0.42, a]; },
  "fireball": (u, v, f, s) => { const r = Math.hypot(u - 0.5, v - 0.5); const grow = 0.15 + f * 0.3; const n = fbm(u * 6 + f, v * 6, s); const core = dot(r, grow); const a = clamp01(core + n * core * 0.6) * (1 - f * 0.4); const heat = 1 - f * 0.7; return [a * heat, a * heat * 0.55, a * heat * 0.25, a]; },
  "flame-loop": (u, v, f, s) => { const x = u - 0.5 + 0.08 * Math.sin(v * 9 + f * 6.28); const r = Math.hypot(x, (v - 0.62) * 1.4); const n = fbm(u * 5, v * 5 - f, s); const a = dot(r, 0.4) * (0.5 + n * 0.6) * clamp01(v + 0.2); return [a, a * 0.55, a * 0.2, a]; },
  "muzzle": (u, v) => { const x = u - 0.5, y = v - 0.5; const rays = Math.max(Math.abs(Math.cos(Math.atan2(y, x) * 2)) ** 8 - 0.2, 0); const a = clamp01(dot(Math.hypot(x, y), 0.2) + rays * dot(Math.hypot(x, y), 0.5)); return [a, a * 0.85, a * 0.5, a]; },
  "splash": (u, v, f, s) => { const x = u - 0.5, y = v - 0.15; const n = hash2(Math.round(u * 24), Math.round(v * 24), s + Math.round(f * 8)); const droplet = n > 0.92 ? dot(Math.hypot((u * 24) % 1 - 0.5, (v * 24) % 1 - 0.5), 0.35) : 0; const sheet = dot(Math.hypot(x * 1.4, y * 0.9 - f * 0.2), 0.4) * 0.5; const a = clamp01(droplet + sheet); return [a * 0.7, a * 0.85, a, a]; },
  "electric": (u, v, f, s) => { const seg = Math.floor(u * 7); const jitter = (hash2(seg, Math.round(f * 3), s) - 0.5) * 0.5; const target = 0.5 + jitter * Math.sin(u * 3.14); const a = dot(Math.abs(v - target), 0.04); return [a * 0.6, a * 0.75, a, a]; },
  "debris-chips": (u, v, f, s) => { const cell = Math.floor(u * 6) + Math.floor(v * 6) * 6; const n = hash2(cell, Math.round(f * 2), s); const cx = ((u * 6) % 1) - 0.5, cy = ((v * 6) % 1) - 0.5; const on = n > 0.6 ? 1 : 0; const a = on * clamp01(0.3 - Math.max(Math.abs(cx), Math.abs(cy)) / 0.3) * 0.9; return [a * 0.5, a * 0.45, a * 0.4, a]; }
};

// name -> grid spec
const LAYOUT = [
  ["soft-dot", 1, 1], ["glow", 1, 1], ["flare", 1, 1], ["spark-streak", 1, 1],
  ["ring", 1, 1], ["ring-thin", 1, 1], ["dust-mote", 1, 1], ["bubble", 1, 1],
  ["rain-streak", 1, 1], ["snowflake", 1, 1],
  ["smoke-a", 2, 2, 4, 12, true], ["smoke-b", 2, 2, 4, 12, true],
  ["fireball", 4, 2, 8, 24, false], ["flame-loop", 4, 2, 8, 16, true],
  ["muzzle", 1, 1], ["splash", 2, 2, 4, 10, false], ["electric", 2, 1, 2, 30, true],
  ["debris-chips", 2, 1, 2, 6, false]
];

// ---------- png ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, "ascii");
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ---------- bake ----------
function pageIdFor(size) {
  return `aura-vfx-${size >= 1024 ? `${size / 1024}k` : `${size}`}`;
}

function bakePage(size, pageId) {
  const cell = size / 8; // 8×8 grid of cells
  const gutter = 4;
  const pitch = cell + gutter;
  const rgba = Buffer.alloc(size * size * 4);
  const sequences = {};
  let cx = gutter, cy = gutter;
  let cellsUsed = 0;
  for (const [name, cols, rows, frames = cols * rows, fps, loop] of LAYOUT) {
    if (cx + cols * pitch > size) { cx = gutter; cy += pitch; }
    const rect = [cx, cy, cols * cell, rows * cell];
    const seed = [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, SEED);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const frame = gy * cols + gx;
        const f01 = frames > 1 ? frame / (frames - 1) : 0;
        for (let py = 0; py < cell; py++) {
          for (let px = 0; px < cell; px++) {
            const [r, g, b, a] = SPRITES[name](px / cell, py / cell, f01, seed);
            const i = ((cy + gy * cell + py) * size + cx + gx * cell + px) * 4;
            const ab = Math.round(clamp01(a) * 255);
            rgba[i] = Math.min(Math.round(clamp01(r) * 255), ab);
            rgba[i + 1] = Math.min(Math.round(clamp01(g) * 255), ab);
            rgba[i + 2] = Math.min(Math.round(clamp01(b) * 255), ab);
            rgba[i + 3] = ab;
          }
        }
      }
    }
    sequences[name] = { page: pageId, rect, columns: cols, rows, frames, ...(fps ? { fps } : {}), ...(loop ? { loop } : {}) };
    cx += cols * pitch;
    cellsUsed += cols * rows;
    if (cellsUsed > 64) throw new Error("layout overflow");
  }
  return { rgba, sequences };
}

function emitPng(path, width, height, rgba) {
  writeFileSync(path, encodePng(width, height, rgba));
  return path;
}

function maybeKtx2(pngPath) {
  try {
    execFileSync("which", ["toktx"], { stdio: "ignore" });
  } catch {
    console.log(`[vfx-atlas-bake] toktx not on PATH — PNG only for ${pngPath}`);
    return null;
  }
  const out = pngPath.replace(/\.png$/, ".ktx2");
  execFileSync("toktx", ["--genmipmap", "--encode", "etc1s", out, pngPath], { stdio: "inherit" });
  return out;
}

function bake(outDir, size) {
  mkdirSync(outDir, { recursive: true });
  const pages = [];
  // Sequences are recorded once, in pixel rects of the LARGE page; the loader
  // scales rects when a lower tier pages the half-size twin.
  const largeId = pageIdFor(size);
  const large = bakePage(size, largeId);
  const sequences = large.sequences;
  for (const [s, baked] of [[size, large], [size / 2, bakePage(size / 2, pageIdFor(size / 2))]]) {
    const pageId = pageIdFor(s);
    const pngPath = join(outDir, `${pageId}.png`);
    emitPng(pngPath, s, s, baked.rgba);
    const ktx2 = maybeKtx2(pngPath);
    pages.push({ id: pageId, uri: `${pageId}.${ktx2 ? "ktx2" : "png"}`, size: s, premultiplied: true, colorSpace: "srgb" });
  }
  const manifest = { version: 1, pages, sequences };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(outDir, "LICENSE.md"), "CC0 — generated in-repo by tools/vfx-atlas-bake/bake.mjs (seed " + SEED + ").\n");
}

bake(OUT, SIZE);
console.log(`[vfx-atlas-bake] wrote ${OUT} (seed=${SEED}, size=${SIZE})`);
