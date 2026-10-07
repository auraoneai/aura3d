/**
 * Radiance `.hdr` (RGBE) equirectangular image decode + sampling (PRD-02 §6.2).
 * Day-0 HDRI presets come from `fixtures/environment-corpus/hdri/*.hdr`;
 * the bake command decodes them here, samples into cube faces, and prefilters.
 * No binary assets are committed for the runtime — only this decoder and the
 * baked KTX2 outputs.
 */
import { faceUvToDir } from "./workers/cpuPrefilter.js";

export interface HdrImage {
  readonly width: number;
  readonly height: number;
  /** RGB float pixels, row-major, [y][x][rgb]. */
  readonly data: Float32Array;
}

export class HdrDecodeError extends Error {
  constructor(public readonly reason: string) {
    super(`ENV_HDR_DECODE ${reason}`);
    this.name = "HdrDecodeError";
  }
}

const HDR_MAGIC = Buffer.from("#?");

/** Decode a Radiance RGBE `.hdr` file (flat or per-scanline RLE). */
export function decodeHdrEquirect(buf: Uint8Array | Buffer): HdrImage {
  const b = buf instanceof Buffer ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length < 32 || !b.subarray(0, 2).equals(HDR_MAGIC)) {
    throw new HdrDecodeError("ENV_HDR_MAGIC");
  }
  // Header: text lines until an empty line, then a resolution line " -Y h +X w".
  let p = 0;
  const readLine = (): string => {
    const nl = b.indexOf(0x0a, p);
    if (nl < 0) throw new HdrDecodeError("ENV_HDR_TRUNCATED_HEADER");
    const line = b.subarray(p, nl).toString("latin1");
    p = nl + 1;
    return line;
  };
  readLine(); // magic line
  for (;;) {
    const line = readLine();
    if (line.length === 0) break;
  }
  const res = readLine();
  const m = /-Y\s+(\d+)\s+\+X\s+(\d+)/.exec(res);
  if (!m) throw new HdrDecodeError(`ENV_HDR_RESOLUTION ${res}`);
  const height = Number(m[1]);
  const width = Number(m[2]);
  const data = new Float32Array(width * height * 3);
  const rgbe = Buffer.alloc(4);

  const flatScanline = (y: number): void => {
    const base = p;
    for (let x = 0; x < width; x += 1) writeRgbe(data, width, height, y, x, b, base + x * 4);
    p += width * 4;
  };
  const rleScanline = (y: number): void => {
    if (b[p + 2] !== width >> 8 || b[p + 3] !== (width & 0xff)) {
      throw new HdrDecodeError("ENV_HDR_RLE_WIDTH");
    }
    p += 4;
    const chan = Buffer.alloc(width * 4);
    let w = 0;
    while (w < width * 4) {
      const count = b[p]!; p += 1;
      if (count > 128) { // run
        const c = count - 128;
        const v = b[p]!; p += 1;
        for (let i = 0; i < c; i += 1) chan[w++] = v;
      } else {
        for (let i = 0; i < count; i += 1) chan[w++] = b[p++]!;
      }
    }
    for (let x = 0; x < width; x += 1) {
      rgbe[0] = chan[x]!; rgbe[1] = chan[width + x]!; rgbe[2] = chan[width * 2 + x]!; rgbe[3] = chan[width * 3 + x]!;
      writeRgbe(data, width, height, y, x, rgbe, 0);
    }
  };

  for (let y = 0; y < height; y += 1) {
    if (width >= 8 && width <= 0x7fff && b[p] === 2 && b[p + 1] === 2) rleScanline(y);
    else flatScanline(y);
  }
  return { width, height, data };
}

function writeRgbe(data: Float32Array, width: number, _h: number, y: number, x: number, src: Buffer, off: number): void {
  const r = src[off]!, g = src[off + 1]!, bl = src[off + 2]!, e = src[off + 3]!;
  const i = (y * width + x) * 3;
  if (e === 0) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; return; }
  const scale = Math.pow(2, e - 136) / 256; // ldexp(1, e - (128 + 8))
  data[i] = r * scale;
  data[i + 1] = g * scale;
  data[i + 2] = bl * scale;
}

/** Sample the equirect image along `dir` (bilinear). dir = normalized [x,y,z]. */
export function sampleEquirect(img: HdrImage, dir: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = dir;
  const phi = Math.atan2(z, x);                       // [-π, π]
  const theta = Math.acos(Math.min(1, Math.max(-1, y))); // [0, π]
  const u = (phi / (2 * Math.PI)) + 0.5;
  const v = theta / Math.PI;
  const px = Math.min(img.width - 1, u * img.width - 0.5);
  const py = Math.min(img.height - 1, v * img.height - 0.5);
  const x0 = Math.max(0, Math.floor(px)), x1 = Math.min(img.width - 1, x0 + 1);
  const y0 = Math.max(0, Math.floor(py)), y1 = Math.min(img.height - 1, y0 + 1);
  const fx = px - x0, fy = py - y0;
  const at = (xx: number, yy: number, c: number): number => img.data[(yy * img.width + xx) * 3 + c]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const a = at(x0, y0, c) * (1 - fx) + at(x1, y0, c) * fx;
    const d = at(x0, y1, c) * (1 - fx) + at(x1, y1, c) * fx;
    out[c] = a * (1 - fy) + d * fy;
  }
  return out;
}

/** Render an equirect image into 6 cube faces at `faceSize`. */
export function equirectToCubeFaces(img: HdrImage, faceSize: number): Float32Array[] {
  const faces: Float32Array[] = [];
  for (let f = 0; f < 6; f += 1) {
    const face = new Float32Array(faceSize * faceSize * 4);
    for (let y = 0; y < faceSize; y += 1) {
      for (let x = 0; x < faceSize; x += 1) {
        const dir = faceUvToDir(f, ((x + 0.5) / faceSize) * 2 - 1, ((y + 0.5) / faceSize) * 2 - 1);
        const [r, g, b] = sampleEquirect(img, dir);
        const i = (y * faceSize + x) * 4;
        face[i] = r; face[i + 1] = g; face[i + 2] = b; face[i + 3] = 1;
      }
    }
    faces.push(face);
  }
  return faces;
}
