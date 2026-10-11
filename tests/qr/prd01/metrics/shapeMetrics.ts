/**
 * PRD-01 lane metrics for the S3/S10 browser specs: bright-region masks, cap
 * luma + normal estimate from tilted-light renders, sub-pixel silhouette
 * circle fit (sphere faceting), and connected-component mean colors (tone-map
 * swatches). Pure functions over decoded RGBA frames.
 */

import type { ImageLike } from "./maskIoU";
import { deltaE2000 } from "./deltaE2000";

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear-light Rec.709 luminance per pixel (decodes the sRGB 8-bit frame). */
export function linearLuma(img: ImageLike): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i += 1) {
    const o = i * 4;
    out[i] = 0.2126 * srgbToLinear(img.data[o]!) + 0.7152 * srgbToLinear(img.data[o + 1]!) + 0.0722 * srgbToLinear(img.data[o + 2]!);
  }
  return out;
}

/** Pixels brighter than `fraction` × the frame's max linear luma. */
export function brightMask(img: ImageLike, fraction = 0.5): Uint8Array {
  const luma = linearLuma(img);
  let max = 0;
  for (const v of luma) if (v > max) max = v;
  const mask = new Uint8Array(luma.length);
  if (max <= 0) return mask;
  for (let i = 0; i < luma.length; i += 1) mask[i] = luma[i]! > fraction * max ? 1 : 0;
  return mask;
}

export function iouOfMasks(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] && b[i]) inter += 1;
    if (a[i] || b[i]) union += 1;
  }
  return union === 0 ? 1 : inter / union;
}

export function meanLumaInMask(img: ImageLike, mask: Uint8Array): number {
  const luma = linearLuma(img);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) {
      sum += luma[i]!;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

export interface CapAnalysis {
  readonly capPixels: number;
  readonly capLuma: number;
  /** Estimated angle between the cap normal and +Y, degrees. */
  readonly normalTiltDeg: number;
  readonly tiltXDeg: number;
  readonly tiltZDeg: number;
}

/**
 * Cap analysis from five renders under one directional light: `top` (+Y) and
 * the four 30° tilts. Under a linear output (operator `none`), the cap luma
 * ratio of a symmetric tilt pair gives the normal tilt about that axis
 * independent of light units: L(+)/L(−) = cos(30°−θ)/cos(30°+θ) ⇒
 * tan θ = (r − 1)/(r + 1) · cot 30°.
 */
export function capAnalysis(top: ImageLike, plusX: ImageLike, minusX: ImageLike, plusZ: ImageLike, minusZ: ImageLike, tiltRad = Math.PI / 6): CapAnalysis {
  const mask = brightMask(top, 0.5);
  let capPixels = 0;
  for (const v of mask) capPixels += v;
  const tilt = (a: ImageLike, b: ImageLike): number => {
    const la = meanLumaInMask(a, mask);
    const lb = meanLumaInMask(b, mask);
    if (la + lb <= 0) return Math.PI / 2;
    const r = la / Math.max(1e-9, lb);
    return Math.atan(((r - 1) / (r + 1)) / Math.tan(tiltRad));
  };
  const tx = tilt(plusX, minusX);
  const tz = tilt(plusZ, minusZ);
  const total = Math.atan(Math.hypot(Math.tan(tx), Math.tan(tz)));
  const deg = 180 / Math.PI;
  return { capPixels, capLuma: meanLumaInMask(top, mask), normalTiltDeg: total * deg, tiltXDeg: tx * deg, tiltZDeg: tz * deg };
}

export interface CircleFit {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly maxDeviationPx: number;
  readonly rmsDeviationPx: number;
  readonly points: number;
}

/**
 * Sub-pixel silhouette of a bright disc on black: per row and column, the
 * outermost 50 % crossings of the encoded luma (linear interpolation between
 * pixel centers), keeping only points whose scan direction is within 45° of
 * the radial direction; then an algebraic (Kåsa) circle fit and the max
 * radial deviation from it.
 */
export function silhouetteCircleFit(img: ImageLike): CircleFit {
  const { width, height } = img;
  const v = new Float32Array(width * height);
  let max = 0;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < v.length; i += 1) {
    const o = i * 4;
    v[i] = (img.data[o]! + img.data[o + 1]! + img.data[o + 2]!) / 3;
    if (v[i]! > max) max = v[i]!;
  }
  const half = max / 2;
  for (let i = 0; i < v.length; i += 1) {
    if (v[i]! > half) {
      sx += i % width;
      sy += Math.floor(i / width);
      n += 1;
    }
  }
  if (n === 0) return { cx: 0, cy: 0, radius: 0, maxDeviationPx: Infinity, rmsDeviationPx: Infinity, points: 0 };
  const c0x = sx / n;
  const c0y = sy / n;
  const points: [number, number][] = [];
  const cross = (a: number, b: number): number => (half - a) / (b - a);
  for (let y = 0; y < height; y += 1) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x += 1) if (v[y * width + x]! > half) { if (first < 0) first = x; last = x; }
    if (first <= 0 || last >= width - 1) continue;
    const left = first - 1 + cross(v[y * width + first - 1]!, v[y * width + first]!);
    const right = last + cross(v[y * width + last]!, v[y * width + last + 1]!);
    for (const px of [left, right]) if (Math.abs(px - c0x) >= Math.abs(y - c0y)) points.push([px, y]);
  }
  for (let x = 0; x < width; x += 1) {
    let first = -1;
    let last = -1;
    for (let y = 0; y < height; y += 1) if (v[y * width + x]! > half) { if (first < 0) first = y; last = y; }
    if (first <= 0 || last >= height - 1) continue;
    const top = first - 1 + cross(v[(first - 1) * width + x]!, v[first * width + x]!);
    const bottom = last + cross(v[last * width + x]!, v[(last + 1) * width + x]!);
    for (const py of [top, bottom]) if (Math.abs(py - c0y) >= Math.abs(x - c0x)) points.push([x, py]);
  }
  // Kåsa fit: x² + y² + D x + E y + F = 0 via 3×3 normal equations.
  let sxx = 0, sxy = 0, syy = 0, sx1 = 0, sy1 = 0, sz = 0, szx = 0, szy = 0;
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sxx += x * x; sxy += x * y; syy += y * y; sx1 += x; sy1 += y; sz += z; szx += z * x; szy += z * y;
  }
  const m = points.length;
  const A = [[sxx, sxy, sx1], [sxy, syy, sy1], [sx1, sy1, m]];
  const bvec = [-szx, -szy, -sz];
  const det3 = (q: number[][]): number =>
    q[0]![0]! * (q[1]![1]! * q[2]![2]! - q[1]![2]! * q[2]![1]!) - q[0]![1]! * (q[1]![0]! * q[2]![2]! - q[1]![2]! * q[2]![0]!) + q[0]![2]! * (q[1]![0]! * q[2]![1]! - q[1]![1]! * q[2]![0]!);
  const d = det3(A);
  const solve = (col: number): number => det3(A.map((row, r) => row.map((val, c) => (c === col ? bvec[r]! : val)))) / d;
  const D = solve(0);
  const E = solve(1);
  const F = solve(2);
  const cx = -D / 2;
  const cy = -E / 2;
  const radius = Math.sqrt(Math.max(0, cx * cx + cy * cy - F));
  let maxDev = 0;
  let sq = 0;
  for (const [x, y] of points) {
    const dev = Math.abs(Math.hypot(x - cx, y - cy) - radius);
    if (dev > maxDev) maxDev = dev;
    sq += dev * dev;
  }
  return { cx, cy, radius, maxDeviationPx: maxDev, rmsDeviationPx: Math.sqrt(sq / Math.max(1, m)), points: m };
}

export interface SwatchDeltaE {
  readonly swatches: number;
  readonly perSwatch: readonly number[];
  readonly max: number;
  readonly mean: number;
}

/**
 * Tone-map ramp comparison: connected components of non-background pixels in
 * `reference` (4-connected), eroded by `erode` px to drop anti-aliased edges;
 * ΔE2000 between the two frames' mean sRGB colors over each component.
 */
export function swatchDeltaE(a: ImageLike, reference: ImageLike, background: readonly [number, number, number], minPixels = 200, erode = 3, tolerance = 6): SwatchDeltaE {
  const { width, height } = reference;
  const covered = new Uint8Array(width * height);
  for (let i = 0; i < covered.length; i += 1) {
    const o = i * 4;
    covered[i] = Math.abs(reference.data[o]! - background[0]) > tolerance || Math.abs(reference.data[o + 1]! - background[1]) > tolerance || Math.abs(reference.data[o + 2]! - background[2]) > tolerance ? 1 : 0;
  }
  let core = covered;
  for (let step = 0; step < erode; step += 1) {
    const next = new Uint8Array(core.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        next[i] = core[i] && core[i - 1] && core[i + 1] && core[i - width] && core[i + width] ? 1 : 0;
      }
    }
    core = next;
  }
  const label = new Int32Array(core.length).fill(-1);
  const perSwatch: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < core.length; start += 1) {
    if (!core[start] || label[start] !== -1) continue;
    const id = perSwatch.length;
    const sumA = [0, 0, 0];
    const sumB = [0, 0, 0];
    let count = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const o = i * 4;
      for (let c = 0; c < 3; c += 1) {
        sumA[c] += a.data[o + c]!;
        sumB[c] += reference.data[o + c]!;
      }
      count += 1;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j >= 0 && j < core.length && core[j] && label[j] === -1) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    if (count < minPixels) {
      perSwatch.push(Number.NaN);
      continue;
    }
    perSwatch.push(deltaE2000([sumA[0]! / count, sumA[1]! / count, sumA[2]! / count], [sumB[0]! / count, sumB[1]! / count, sumB[2]! / count]));
  }
  const valid = perSwatch.filter((value) => Number.isFinite(value));
  return {
    swatches: valid.length,
    perSwatch: valid,
    max: valid.length ? Math.max(...valid) : Infinity,
    mean: valid.length ? valid.reduce((s, value) => s + value, 0) / valid.length : Infinity
  };
}
