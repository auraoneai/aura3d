import { seededRandom } from "./random.js";

export type Noise2D = (x: number, y: number) => number;
export type Noise3D = (x: number, y: number, z: number) => number;

export interface FbmOptions {
  /** Number of summed layers. Default 5. */
  readonly octaves?: number;
  /** Frequency multiplier per octave. Default 2. */
  readonly lacunarity?: number;
  /** Amplitude multiplier per octave. Default 0.5. */
  readonly gain?: number;
  /** Base frequency. Default 1. */
  readonly frequency?: number;
  /** Ridged multifractal: (1 - |n|)^2 remapped to [-1, 1]; sharp crests. Default false. */
  readonly ridged?: boolean;
}

function permutation(seed: number): Uint8Array {
  const random = seededRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) p[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const t = p[i]!; p[i] = p[j]!; p[j] = t;
  }
  const table = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) table[i] = p[i & 255]!;
  return table;
}

const G2: ReadonlyArray<readonly [number, number]> = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const G3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

/** Seeded 2D simplex noise in [-1, 1]. Deterministic per seed, no Math.random. */
export function createSimplexNoise2D(seed = 0): Noise2D {
  const perm = permutation(seed);
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const Gc = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * Gc;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + Gc, y1 = y0 - j1 + Gc;
    const x2 = x0 - 1 + 2 * Gc, y2 = y0 - 1 + 2 * Gc;
    const ii = i & 255, jj = j & 255;
    const contribution = (x: number, y: number, gi: number): number => {
      const tt = 0.5 - x * x - y * y;
      if (tt < 0) return 0;
      const g = G2[gi % 8]!;
      const t2 = tt * tt;
      return t2 * t2 * (g[0] * x + g[1] * y);
    };
    const n0 = contribution(x0, y0, perm[ii + perm[jj]!]!);
    const n1 = contribution(x1, y1, perm[ii + i1 + perm[jj + j1]!]!);
    const n2 = contribution(x2, y2, perm[ii + 1 + perm[jj + 1]!]!);
    return Math.max(-1, Math.min(1, 70 * (n0 + n1 + n2)));
  };
}

/** Seeded 3D simplex noise in [-1, 1]. */
export function createSimplexNoise3D(seed = 0): Noise3D {
  const perm = permutation(seed);
  const F3 = 1 / 3, Gc = 1 / 6;
  return (xin, yin, zin) => {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * Gc;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const corner = (x: number, y: number, z: number, di: number, dj: number, dk: number): number => {
      const tt = 0.6 - x * x - y * y - z * z;
      if (tt < 0) return 0;
      const g = G3[perm[ii + di + perm[jj + dj + perm[kk + dk]!]!]! % 12]!;
      const t2 = tt * tt;
      return t2 * t2 * (g[0] * x + g[1] * y + g[2] * z);
    };
    const n =
      corner(x0, y0, z0, 0, 0, 0) +
      corner(x0 - i1 + Gc, y0 - j1 + Gc, z0 - k1 + Gc, i1, j1, k1) +
      corner(x0 - i2 + 2 * Gc, y0 - j2 + 2 * Gc, z0 - k2 + 2 * Gc, i2, j2, k2) +
      corner(x0 - 1 + 3 * Gc, y0 - 1 + 3 * Gc, z0 - 1 + 3 * Gc, 1, 1, 1);
    return Math.max(-1, Math.min(1, 32 * n));
  };
}

function resolveFbm(options: FbmOptions): Required<FbmOptions> {
  const resolved = { octaves: options.octaves ?? 5, lacunarity: options.lacunarity ?? 2, gain: options.gain ?? 0.5, frequency: options.frequency ?? 1, ridged: options.ridged ?? false };
  if (!Number.isInteger(resolved.octaves) || resolved.octaves < 1 || resolved.octaves > 16) throw new RangeError("procedural: fbm octaves must be an integer in [1, 16]");
  return resolved;
}

function fbmNorm(octaves: number, gain: number): number {
  let norm = 0;
  for (let i = 0, a = 1; i < octaves; i += 1, a *= gain) norm += a;
  return norm;
}

/** Fractal Brownian motion over seeded simplex noise, normalised so the result stays in [-1, 1]. */
export function createFbm2D(seed = 0, options: FbmOptions = {}): Noise2D {
  const o = resolveFbm(options);
  const noises = Array.from({ length: o.octaves }, (_, i) => createSimplexNoise2D(seed + i * 101));
  const norm = fbmNorm(o.octaves, o.gain);
  return (x, y) => {
    let sum = 0, amp = 1, freq = o.frequency;
    for (let i = 0; i < o.octaves; i += 1) {
      const n = noises[i]!(x * freq, y * freq);
      sum += amp * (o.ridged ? (1 - Math.abs(n)) ** 2 * 2 - 1 : n);
      amp *= o.gain; freq *= o.lacunarity;
    }
    return Math.max(-1, Math.min(1, sum / norm));
  };
}

/** 3D variant of {@link createFbm2D}. */
export function createFbm3D(seed = 0, options: FbmOptions = {}): Noise3D {
  const o = resolveFbm(options);
  const noises = Array.from({ length: o.octaves }, (_, i) => createSimplexNoise3D(seed + i * 101));
  const norm = fbmNorm(o.octaves, o.gain);
  return (x, y, z) => {
    let sum = 0, amp = 1, freq = o.frequency;
    for (let i = 0; i < o.octaves; i += 1) {
      const n = noises[i]!(x * freq, y * freq, z * freq);
      sum += amp * (o.ridged ? (1 - Math.abs(n)) ** 2 * 2 - 1 : n);
      amp *= o.gain; freq *= o.lacunarity;
    }
    return Math.max(-1, Math.min(1, sum / norm));
  };
}
