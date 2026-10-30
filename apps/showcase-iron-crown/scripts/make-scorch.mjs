#!/usr/bin/env node
/**
 * IRON CROWN K.O. scorch decal texture (GU47 WP-15 IC47-V3): a 256x256 RGBA burn mark (charred core, ember-brown rim,
 * ragged alpha edge), written without dependencies and deterministic (same bytes every run).
 *
 *   node apps/showcase-iron-crown/scripts/make-scorch.mjs [out.png]
 *
 * Admitted with `aura3d assets add <png> --name ironcrownKoScorch --type texture`. Original work for this game.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SIZE = 256;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

/** Smooth value noise on a fixed lattice (deterministic hash, no Math.random). */
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;

export function scorchPng() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    for (let x = 0; x < SIZE; x++) {
      const nx = (x + 0.5) / SIZE - 0.5;
      const ny = (y + 0.5) / SIZE - 0.5;
      const angle = Math.atan2(ny, nx);
      // Ragged edge: the radius wobbles with angle and noise.
      const edge = 0.36 + 0.06 * Math.sin(angle * 5 + 0.7) + 0.08 * (fbm(Math.cos(angle) * 3 + 5, Math.sin(angle) * 3 + 5) - 0.5);
      const r = Math.hypot(nx, ny) / edge;
      const grain = fbm(x / 18, y / 18);
      const alpha = r >= 1 ? 0 : Math.min(1, (1 - r) * 2.2) * (0.72 + 0.28 * grain);
      // Charred black core, ember-brown towards the rim.
      const rim = Math.min(1, Math.max(0, (r - 0.45) / 0.55));
      const red = 14 + rim * 70 * grain;
      const green = 10 + rim * 34 * grain;
      const blue = 9 + rim * 14 * grain;
      const o = y * (SIZE * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(red);
      raw[o + 1] = Math.round(green);
      raw[o + 2] = Math.round(blue);
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? "ironcrownKoScorch.png");
  writeFileSync(out, scorchPng());
  console.log(out);
}
