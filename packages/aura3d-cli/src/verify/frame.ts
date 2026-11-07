// Frame analysis for `aura3d verify`: a dependency-free PNG decoder, the black/flat/dim frame check and a two-frame motion check.
// The frame check is a TypeScript port of analyzeFrame in tools/release/render-gate/analysis.mjs (same thresholds, same maths); the CLI is
// published on its own and cannot import repo tools, so tests/unit/aura3d-cli/verify-frame.test.ts asserts the two agree on the same images.
import { inflateSync } from "node:zlib";

export interface RgbImage { readonly width: number; readonly height: number; readonly rgb: Uint8Array }

export const FRAME_THRESHOLDS = Object.freeze({
  minTexturedBlockFraction: 0.1,
  minP99Luma: 6,
  minDistinctColors: 8,
  blockStddev: 6,
  maxGain: 8,
  blockSize: 16,
  /** Below this p99 luma (but above black) the frame counts as dim. */
  dimP99Luma: 40
});

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Minimal PNG decoder (8-bit gray, gray+alpha, RGB, RGBA, palette; non-interlaced). Alpha is composited on black. */
export function decodePng(buf: Buffer): RgbImage {
  if (buf.length < 33 || !SIGNATURE.every((b, i) => buf[i] === b)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]!; colorType = data[9]!; interlace = data[12]!; }
    else if (type === "PLTE") palette = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error("PNG without IHDR");
  if (depth !== 8 || interlace !== 0 || !(colorType in CHANNELS)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  if (colorType === 3 && !palette) throw new Error("palette PNG without PLTE");
  const ch = CHANNELS[colorType]!;
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("truncated PNG data");
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch]! : 0;
      const b = y > 0 ? out[dst - stride + x]! : 0;
      const c = x >= ch && y > 0 ? out[dst - stride + x - ch]! : 0;
      let v = raw[src + x]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`bad PNG filter ${f}`);
      out[dst + x] = v & 255;
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, n = width * height; i < n; i++) {
    let r: number, g: number, b: number, al = 255;
    if (colorType === 2) { r = out[i * 3]!; g = out[i * 3 + 1]!; b = out[i * 3 + 2]!; }
    else if (colorType === 6) { r = out[i * 4]!; g = out[i * 4 + 1]!; b = out[i * 4 + 2]!; al = out[i * 4 + 3]!; }
    else if (colorType === 0) { r = g = b = out[i]!; }
    else if (colorType === 4) { r = g = b = out[i * 2]!; al = out[i * 2 + 1]!; }
    else { const p = out[i]! * 3; r = palette![p]!; g = palette![p + 1]!; b = palette![p + 2]!; }
    rgb[i * 3] = (r * al) / 255; rgb[i * 3 + 1] = (g * al) / 255; rgb[i * 3 + 2] = (b * al) / 255;
  }
  return { width, height, rgb };
}

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

export interface FrameAnalysis {
  readonly width: number; readonly height: number;
  readonly meanLuma: number; readonly lumaStddev: number; readonly p1Luma: number; readonly p99Luma: number; readonly gain: number;
  readonly distinctColors: number; readonly texturedBlockFraction: number;
  readonly drawn: boolean;
  readonly reasons: readonly string[];
  /** Machine-readable verdict flags derived from the same thresholds. */
  readonly black: boolean; readonly flat: boolean; readonly empty: boolean; readonly dim: boolean;
}

export function analyzeFrame(image: RgbImage, thresholds: typeof FRAME_THRESHOLDS = FRAME_THRESHOLDS): FrameAnalysis {
  const { width, height, rgb } = image;
  const n = width * height;
  const hist = new Uint32Array(256);
  const colors = new Set<number>();
  const lum = new Float32Array(n);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const l = luma(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);
    lum[i] = l; sum += l; sumSq += l * l; hist[Math.min(255, Math.round(l))]!++;
  }
  const pct = (p: number): number => { let acc = 0; const target = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= target) return v; } return 255; };
  const mean = sum / n;
  const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const p1 = pct(0.01), p99 = pct(0.99);
  const gain = p99 >= 96 ? 1 : Math.min(thresholds.maxGain, 160 / Math.max(p99, 1));
  for (let i = 0; i < n; i++) {
    const r = Math.min(255, rgb[i * 3]! * gain), g = Math.min(255, rgb[i * 3 + 1]! * gain), b = Math.min(255, rgb[i * 3 + 2]! * gain);
    colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const bs = thresholds.blockSize;
  let blocks = 0, textured = 0;
  for (let by = 0; by + bs <= height; by += bs) {
    for (let bx = 0; bx + bs <= width; bx += bs) {
      let s = 0, sq = 0;
      for (let y = by; y < by + bs; y++) for (let x = bx; x < bx + bs; x++) { const v = Math.min(255, lum[y * width + x]! * gain); s += v; sq += v * v; }
      const m = s / (bs * bs), sd = Math.sqrt(Math.max(0, sq / (bs * bs) - m * m));
      blocks++; if (sd >= thresholds.blockStddev) textured++;
    }
  }
  const texturedBlockFraction = blocks ? textured / blocks : 0;
  const reasons: string[] = [];
  const black = p99 < thresholds.minP99Luma;
  const flat = colors.size < thresholds.minDistinctColors;
  const empty = texturedBlockFraction < thresholds.minTexturedBlockFraction;
  if (black) reasons.push(`black frame (p99 luma ${p99})`);
  if (flat) reasons.push(`flat frame (${colors.size} distinct colours)`);
  if (empty) reasons.push(`no scene texture (${(texturedBlockFraction * 100).toFixed(1)}% textured blocks)`);
  return {
    width, height, meanLuma: round(mean), lumaStddev: round(stddev), p1Luma: p1, p99Luma: p99, gain: round(gain),
    distinctColors: colors.size, texturedBlockFraction: round(texturedBlockFraction, 4),
    drawn: reasons.length === 0, reasons, black, flat, empty, dim: !black && p99 < thresholds.dimP99Luma
  };
}

export interface MotionAnalysis {
  /** Mean absolute per-channel difference, 0..255. */
  readonly meanAbsDiff: number;
  /** Share of pixels whose channels differ by more than 8. */
  readonly changedPixelFraction: number;
  readonly moved: boolean;
}

/** Two frames of the same size. `moved` needs at least 0.05% of pixels to change noticeably, which a static scene's encoder noise never reaches. */
export function compareFrames(a: RgbImage, b: RgbImage, minChangedFraction = 0.0005): MotionAnalysis {
  if (a.width !== b.width || a.height !== b.height) return { meanAbsDiff: 255, changedPixelFraction: 1, moved: true };
  const n = a.width * a.height;
  let total = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a.rgb[i * 3]! - b.rgb[i * 3]!) + Math.abs(a.rgb[i * 3 + 1]! - b.rgb[i * 3 + 1]!) + Math.abs(a.rgb[i * 3 + 2]! - b.rgb[i * 3 + 2]!);
    total += d / 3;
    if (d > 24) changed++;
  }
  const changedPixelFraction = n ? changed / n : 0;
  return { meanAbsDiff: round(n ? total / n : 0, 3), changedPixelFraction: round(changedPixelFraction, 5), moved: changedPixelFraction >= minChangedFraction };
}
