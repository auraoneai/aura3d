/**
 * tools/quality-gate/src/png.ts — minimal PNG decoder (8-bit, non-interlaced,
 * color types 2 RGB / 6 RGBA / 0 grey / 3 palette, filter types 0–4).
 * Returns { rgba: Uint8Array, width, height }. Throws on anything else.
 * Zero deps — Node zlib only. Used by the scorecard builder's canvasBlankCheck.
 */

import { inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface DecodedPng {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function decodePng(input: Uint8Array | Buffer): DecodedPng {
  const buf: Buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let pos = 8;
  let width = 0, height = 0, colorType = -1, bitDepth = -1, interlace = -1;
  let palette: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bitDepth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG not supported");
  const channels = ({ 0: 1, 2: 3, 3: 1, 6: 4 } as Record<number, number>)[colorType];
  if (!channels) throw new Error(`unsupported colorType ${colorType}`);
  if (colorType === 3 && !palette) throw new Error("palette PNG without PLTE");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(width * height * channels);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) throw new Error(`bad filter ${filter}`);
      row[x] = v;
    }
    src += stride;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r: number, g: number, b: number, a = 255;
    if (colorType === 0) { r = g = b = px[i]; }
    else if (colorType === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else { // palette (3) is rejected above unless PLTE exists; 6 = RGBA
      const pal = palette!;
      if (colorType === 3) { r = pal[px[i] * 3]; g = pal[px[i] * 3 + 1]; b = pal[px[i] * 3 + 2]; }
      else { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { rgba, width, height };
}
