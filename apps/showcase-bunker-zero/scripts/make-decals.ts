// BZ-10: writes public/aura-assets/decals/*.png (128x128 RGBA) from the pattern functions in src/art/decals.ts.
// Run: node_modules/.bin/tsx --tsconfig tsconfig.base.json apps/showcase-bunker-zero/scripts/make-decals.ts (repo root).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { BZ_DECAL_FILES, BZ_DECAL_TEXTURE_SIZE, decalPixel, type DecalKind } from "../src/art/decals";

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(kind: DecalKind, size: number): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const p = decalPixel(kind, (x + 0.5) / size, (y + 0.5) / size);
      raw.set(p, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/aura-assets/decals");
mkdirSync(out, { recursive: true });
for (const [kind, file] of Object.entries(BZ_DECAL_FILES) as [DecalKind, string][]) {
  const buf = png(kind, BZ_DECAL_TEXTURE_SIZE);
  writeFileSync(path.join(out, file), buf);
  console.log(`${file} ${buf.length} bytes sha256-${createHash("sha256").update(buf).digest("hex")}`);
}
