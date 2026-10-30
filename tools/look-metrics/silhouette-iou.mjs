#!/usr/bin/env node
// Silhouette IoU: pairwise intersection-over-union of subject silhouettes (DD47-A2: "4 bug-bot sentries, pairwise
// silhouette IoU <= 0.6"). Pure Node: PNG is decoded with node:zlib, no image library.
//
//   node tools/look-metrics/silhouette-iou.mjs <a.png> <b.png> [more.png ...] [--max 0.6] [--size 128] [--no-normalize]
//        [--mode auto|alpha|key] [--bg #rrggbb] [--tolerance 32] [--masks <dir>] [--json]
//
// Masks: `alpha` keeps pixels with alpha >= 128; `key` keeps pixels farther than --tolerance (RGB distance) from the
// background colour (--bg, else the most common colour on the image border); `auto` uses alpha when the image has any
// transparent pixel, else key. Feed renders of each subject on a flat background or with alpha (a probe or turntable
// render), PNG only: JPEG blocks blur the edge and carry no alpha.
// Normalisation (default): each mask is cropped to its bounding box and scaled, aspect kept, into a size x size square,
// centred, so the IoU compares shapes, not screen position or scale. --no-normalize compares the masks in place (same size).
// Exit 1 when --max is given and a pair exceeds it; 2 on a usage or decode error.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/** Decode a non-interlaced PNG (colour types 0, 2, 3, 4, 6; bit depths 1-16) to { width, height, data: RGBA bytes }. */
export function decodePng(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file (JPEG is not supported: use PNG renders with alpha or a flat background)");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
  }
  if (!width || !height || !(type in CHANNELS)) throw new Error(`unsupported PNG header (colour type ${type})`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported: re-save it without interlacing");
  if (type === 3 && !palette) throw new Error("palette PNG without a PLTE chunk");
  const channels = CHANNELS[type];
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < height * (stride + 1)) throw new Error("truncated PNG image data");
  const lines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? lines[dst + x - bpp] : 0;
      const b = y > 0 ? lines[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? lines[dst - stride + x - bpp] : 0;
      const v = raw[src + x];
      lines[dst + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const maxVal = (1 << Math.min(depth, 8)) - 1;
  const sample = (row, index) => {
    if (depth === 8) return lines[row + index];
    if (depth === 16) return lines[row + index * 2];
    const bit = index * depth;
    return (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & maxVal;
  };
  const scale = depth < 8 ? 255 / maxVal : 1;
  const trnsGray = trns && type === 0 ? trns.readUInt16BE(0) : null;
  const trnsRgb = trns && type === 2 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const idx = sample(row, x);
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(row, x * channels);
        out[o] = out[o + 1] = out[o + 2] = Math.round(g * scale);
        out[o + 3] = type === 4 ? sample(row, x * channels + 1) : trnsGray !== null && g === (depth === 16 ? trnsGray >> 8 : trnsGray) ? 0 : 255;
      } else {
        out[o] = sample(row, x * channels); out[o + 1] = sample(row, x * channels + 1); out[o + 2] = sample(row, x * channels + 2);
        out[o + 3] = type === 6 ? sample(row, x * channels + 3) : trnsRgb && depth === 8 && out[o] === trnsRgb[0] && out[o + 1] === trnsRgb[1] && out[o + 2] === trnsRgb[2] ? 0 : 255;
      }
    }
  }
  return { width, height, data: out };
}

/** Encode RGBA bytes as an 8-bit RGBA PNG (used for --masks and by the unit tests). */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  const chunk = (kind, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(kind, 4, "latin1");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Most common colour on the image border (4-bit buckets), averaged inside the winning bucket. */
export function borderColor({ width, height, data }) {
  const buckets = new Map();
  const add = (x, y) => {
    const o = (y * width + x) * 4;
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[o]; e.g += data[o + 1]; e.b += data[o + 2];
    buckets.set(key, e);
  };
  for (let x = 0; x < width; x++) { add(x, 0); if (height > 1) add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); if (width > 1) add(width - 1, y); }
  let best = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [0, 0, 0];
}

export function parseHexColor(text) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(text ?? "").trim());
  if (!m) throw new Error(`--bg must be #rrggbb, got ${text}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Binary silhouette of an RGBA image.
 * @returns {{ width, height, data: Uint8Array, count, bbox: { x0, y0, x1, y1 } | null, mode: "alpha" | "key", bg?: number[] }}
 */
export function maskFromImage(img, { mode = "auto", bg, tolerance = 32, alphaThreshold = 128 } = {}) {
  const { width, height, data } = img;
  const n = width * height;
  let use = mode;
  if (use === "auto") { use = "key"; for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) { use = "alpha"; break; } }
  const key = use === "key" ? (bg ?? borderColor(img)) : null;
  const out = new Uint8Array(n);
  let count = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
  const tol2 = tolerance * tolerance;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const on = use === "alpha" ? data[o + 3] >= alphaThreshold
      : data[o + 3] >= alphaThreshold && (data[o] - key[0]) ** 2 + (data[o + 1] - key[1]) ** 2 + (data[o + 2] - key[2]) ** 2 > tol2;
    if (!on) continue;
    out[i] = 1; count++;
    const x = i % width, y = (i / width) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { width, height, data: out, count, bbox: count ? { x0, y0, x1, y1 } : null, mode: use, ...(key ? { bg: key.map((v) => Math.round(v)) } : {}) };
}

/** Crop to the bounding box and scale (nearest, aspect kept) into a centred size x size mask. */
export function normalizeMask(mask, size = 128) {
  const out = new Uint8Array(size * size);
  if (!mask.bbox) return { width: size, height: size, data: out, count: 0, bbox: null };
  const { x0, y0, x1, y1 } = mask.bbox;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const s = size / Math.max(bw, bh);
  const tw = Math.max(1, Math.min(size, Math.round(bw * s))), th = Math.max(1, Math.min(size, Math.round(bh * s)));
  const ox = (size - tw) >> 1, oy = (size - th) >> 1;
  let count = 0;
  for (let ty = 0; ty < th; ty++) {
    const sy = y0 + Math.min(bh - 1, Math.floor((ty + 0.5) / s));
    for (let tx = 0; tx < tw; tx++) {
      const sx = x0 + Math.min(bw - 1, Math.floor((tx + 0.5) / s));
      if (mask.data[sy * mask.width + sx]) { out[(oy + ty) * size + ox + tx] = 1; count++; }
    }
  }
  return { width: size, height: size, data: out, count, bbox: { x0: ox, y0: oy, x1: ox + tw - 1, y1: oy + th - 1 } };
}

/** Intersection over union of two same-size masks; null when both are empty. */
export function iou(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`mask sizes differ (${a.width}x${a.height} vs ${b.width}x${b.height}); normalise them or pass same-size images`);
  let inter = 0, union = 0;
  for (let i = 0; i < a.data.length; i++) { const x = a.data[i], y = b.data[i]; if (x && y) inter++; if (x || y) union++; }
  return union ? inter / union : null;
}

/** Pairwise IoU of named masks: matrix, pair list (highest first) and the worst pair. */
export function pairwiseIou(entries) {
  const names = entries.map((e) => e.name);
  const matrix = names.map(() => names.map(() => null));
  const pairs = [];
  for (let i = 0; i < entries.length; i++) {
    matrix[i][i] = entries[i].mask.count ? 1 : null;
    for (let j = i + 1; j < entries.length; j++) {
      const v = iou(entries[i].mask, entries[j].mask);
      matrix[i][j] = matrix[j][i] = v;
      pairs.push({ a: names[i], b: names[j], iou: v });
    }
  }
  pairs.sort((p, q) => (q.iou ?? -1) - (p.iou ?? -1));
  return { names, matrix, pairs, max: pairs[0] ?? null };
}

/** Mask PNG (white subject on black) for inspection. */
export function maskToPng(mask) {
  const data = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.data.length; i++) { const v = mask.data[i] ? 255 : 0; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return encodePng({ width: mask.width, height: mask.height, data });
}

function main(argv) {
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const VALUED = new Set(["--max", "--size", "--mode", "--bg", "--tolerance", "--masks"]);
  const files = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
  if (files.length < 2) {
    console.error("usage: node tools/look-metrics/silhouette-iou.mjs <a.png> <b.png> [more.png ...] [--max 0.6] [--size 128] [--no-normalize] [--mode auto|alpha|key] [--bg #rrggbb] [--tolerance 32] [--masks <dir>] [--json]");
    process.exit(2);
  }
  const size = Number(value("--size") ?? 128);
  const tolerance = Number(value("--tolerance") ?? 32);
  const max = value("--max") !== undefined ? Number(value("--max")) : null;
  const mode = value("--mode") ?? "auto";
  const normalize = !argv.includes("--no-normalize");
  if (!Number.isInteger(size) || size < 8 || !Number.isFinite(tolerance) || (max !== null && !Number.isFinite(max)) || !["auto", "alpha", "key"].includes(mode)) {
    console.error("--size must be an integer >= 8, --tolerance and --max numbers, --mode auto|alpha|key");
    process.exit(2);
  }
  let entries;
  try {
    const bg = value("--bg") !== undefined ? parseHexColor(value("--bg")) : undefined;
    entries = files.map((file) => {
      const raw = maskFromImage(decodePng(readFileSync(file)), { mode, bg, tolerance });
      return { name: basename(file, extname(file)), file, raw, mask: normalize ? normalizeMask(raw, size) : raw };
    });
    const masksDir = value("--masks");
    if (masksDir) { mkdirSync(masksDir, { recursive: true }); for (const e of entries) writeFileSync(join(masksDir, `${e.name}.mask.png`), maskToPng(e.mask)); }
  } catch (error) {
    console.error(`silhouette-iou: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  let result;
  try { result = pairwiseIou(entries); } catch (error) { console.error(`silhouette-iou: ${error instanceof Error ? error.message : String(error)}`); process.exit(2); }
  const over = max === null ? [] : result.pairs.filter((p) => p.iou !== null && p.iou > max);
  const report = {
    schema: "aura3d.silhouette-iou/1", normalize, size: normalize ? size : null, max,
    subjects: entries.map((e) => ({ name: e.name, file: e.file, mode: e.raw.mode, ...(e.raw.bg ? { bg: e.raw.bg } : {}), pixels: e.raw.count, bbox: e.raw.bbox })),
    pairs: result.pairs.map((p) => ({ ...p, iou: p.iou === null ? null : Number(p.iou.toFixed(4)) })),
    worst: result.max ? { ...result.max, iou: result.max.iou === null ? null : Number(result.max.iou.toFixed(4)) } : null,
    pass: over.length === 0
  };
  if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const s of report.subjects) console.log(`${s.name}: ${s.pixels} px (${s.mode}${s.bg ? ` bg ${s.bg.join(",")}` : ""})`);
    for (const p of report.pairs) console.log(`${p.a} x ${p.b}: IoU ${p.iou ?? "n/a (empty masks)"}${max !== null && p.iou !== null && p.iou > max ? ` > ${max}` : ""}`);
    if (max !== null) console.log(over.length ? `FAIL: ${over.length} pair(s) above ${max}` : `pass: every pair <= ${max}`);
  }
  if (entries.some((e) => !e.raw.count)) console.error("warning: an empty silhouette (check --mode, --bg and --tolerance)");
  if (over.length) process.exit(1);
}

const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) main(process.argv.slice(2));
