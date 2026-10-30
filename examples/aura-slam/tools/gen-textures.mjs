#!/usr/bin/env node
/**
 * GU47 WP-11 (G01): authored textures for Aura Slam, generated deterministically (no download, no paid generation; the
 * PRD's "aura3d-game-art" path). Run from the repo root:
 *
 *   node examples/aura-slam/tools/gen-textures.mjs
 *
 * Writes examples/aura-slam/assets/textures/net-alpha.png (TT-M2): a 64 x 64 RGBA tile of 4 x 4 net squares, white strings
 * (the material colour tints them) on a transparent ground, so the net reads as a mesh up close and averages to a
 * translucent band at the broadcast distance (its mip chain). Prints the sha256 the asset table records.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../assets/textures");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA8 pixels (row-major, top row first) to a PNG file. */
export function encodePngRgba(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let i = 0; i < width * 4; i++) raw[y * (width * 4 + 1) + 1 + i] = rgba[y * width * 4 + i];
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Net tile: `cells` squares per side of `cellPx` pixels, strings `stringPx` wide with a half-pixel soft edge. */
export function netAlphaPixels(cells = 4, cellPx = 16, stringPx = 3) {
  const size = cells * cellPx;
  const rgba = new Uint8Array(size * size * 4);
  const coverage = (p) => {
    // Distance from the pixel centre to the nearest string centre line (strings sit on the cell borders).
    const m = (p + 0.5) % cellPx;
    const d = Math.min(m, cellPx - m);
    return Math.max(0, Math.min(1, stringPx / 2 + 0.5 - d));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.max(coverage(x), coverage(y));
      const i = (y * size + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return { size, rgba };
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const net = netAlphaPixels();
  const png = encodePngRgba(net.size, net.size, net.rgba);
  const file = resolve(outDir, "net-alpha.png");
  writeFileSync(file, png);
  let alpha = 0;
  for (let i = 3; i < net.rgba.length; i += 4) alpha += net.rgba[i];
  const meanAlpha = alpha / (net.rgba.length / 4) / 255;
  process.stdout.write(`${JSON.stringify({ file: "examples/aura-slam/assets/textures/net-alpha.png", bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), meanAlpha: Number(meanAlpha.toFixed(4)) })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
