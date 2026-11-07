// Procedural terrain: noise helpers and the height field of the pass.

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Smoothstep that also works when a > b (reversed edges). */
export function ss(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal noise in 0..1. */
export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valley axis x position at depth z (z decreases going up the pass). */
export const valleyC = (z: number): number => 4 * Math.sin(z * 0.02 + 0.5);
/** Trail centre x position at depth z. */
export const trailX = (z: number): number => valleyC(z) + 2.2 * Math.sin(z * 0.055 + 1.0);

const rise = (z: number): number => -z * 0.13;

function base(x: number, z: number): number {
  const dx = x - valleyC(z);
  return rise(z) + 0.55 * Math.sqrt(dx * dx + 9) + 0.0035 * dx * dx - 1.65;
}

function rawHeight(x: number, z: number): number {
  const adx = Math.abs(x - valleyC(z));
  let h = base(x, z);
  h += (fbm(x * 0.035, z * 0.035) - 0.5) * 2 * 7 * ss(4, 35, adx);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.011 + 7, z * 0.011 + 3, 3) - 1);
  h += ridge * ridge * 38 * ss(25, 100, adx) * ss(-20, -130, z);
  const far = 1 - Math.abs(2 * fbm(x * 0.02 + 20, z * 0.02, 3) - 1);
  h += far * far * far * 75 * ss(-90, -220, z) * ss(5, 40, adx);
  h += (fbm(x * 0.2, z * 0.2, 3) - 0.5) * 1.2 * ss(3, 15, adx);
  return h;
}

export const CABIN_Z = -55;
export const CABIN_X = trailX(CABIN_Z) + 6.8;
const PAD_H = rawHeight(CABIN_X, CABIN_Z) - 0.15;

export function groundHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  const tx = trailX(z);
  const wT = 1 - ss(2.0, 5.0, Math.abs(x - tx));
  h = lerp(h, base(tx, z), wT);
  const wP = 1 - ss(4.4, 8.5, Math.hypot(x - CABIN_X, z - CABIN_Z));
  h = lerp(h, PAD_H, wP);
  return h;
}
