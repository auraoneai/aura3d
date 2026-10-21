/**
 * three.js `MathUtils` parity (docs/workflows/threejs-parity-gaps.md SM-04).
 * Pure scalar helpers — same names and semantics as three 0.185.1.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const _lut: string[] = [];
for (let i = 0; i < 256; i += 1) _lut[i] = i.toString(16).padStart(2, "0");

let _seed = 1234567;

/** RFC4122-ish UUIDv4 string (same construction as three's `generateUUID`). */
export function generateUUID(): string {
  const d0 = (Math.random() * 0xffffffff) | 0;
  const d1 = (Math.random() * 0xffffffff) | 0;
  const d2 = (Math.random() * 0xffffffff) | 0;
  const d3 = (Math.random() * 0xffffffff) | 0;
  return (
    _lut[d0 & 0xff]! + _lut[(d0 >> 8) & 0xff]! + _lut[(d0 >> 16) & 0xff]! + _lut[(d0 >> 24) & 0xff]! + "-" +
    _lut[d1 & 0xff]! + _lut[(d1 >> 8) & 0xff]! + "-" + _lut[((d1 >> 16) & 0x0f) | 0x40]! + _lut[(d1 >> 24) & 0xff]! + "-" +
    _lut[(d2 & 0x3f) | 0x80]! + _lut[(d2 >> 8) & 0xff]! + "-" + _lut[(d2 >> 16) & 0xff]! + _lut[(d2 >> 24) & 0xff]! +
    _lut[d3 & 0xff]! + _lut[(d3 >> 8) & 0xff]! + _lut[(d3 >> 16) & 0xff]! + _lut[(d3 >> 24) & 0xff]!
  ).toLowerCase();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** ((n % m) + m) % m — always non-negative for positive m. */
export function euclideanModulo(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function mapLinear(x: number, a1: number, a2: number, b1: number, b2: number): number {
  return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

/** Returns 0 when x === y (three.js semantics). */
export function inverseLerp(x: number, y: number, value: number): number {
  if (x !== y) return (value - x) / (y - x);
  return 0;
}

/** (1 - t) * x + t * y — note three's argument order. */
export function lerp(x: number, y: number, t: number): number {
  return (1 - t) * x + t * y;
}

/** Frame-rate independent exponential approach (three.js `damp`). */
export function damp(x: number, y: number, lambda: number, dt: number): number {
  return lerp(x, y, 1 - Math.exp(-lambda * dt));
}

/** Triangle wave: 0→length→0 as x grows (three.js `pingpong`). */
export function pingpong(x: number, length = 1): number {
  return length - Math.abs(euclideanModulo(x, length * 2) - length);
}

export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}

export function smootherstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Integer in [low, high] inclusive. */
export function randInt(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

export function randFloat(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

/** Uniform in [-range/2, range/2]. */
export function randFloatSpread(range: number): number {
  return range * (0.5 - Math.random());
}

/**
 * Deterministic Mulberry32 generator — same sequence as three's
 * `seededRandom`: calling with `s` sets the stream seed; each call returns a
 * float in [0, 1).
 */
export function seededRandom(s?: number): number {
  if (s !== undefined) _seed = s;
  let t = (_seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function degToRad(degrees: number): number {
  return degrees * DEG2RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD2DEG;
}

export function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0 && value !== 0;
}

export function ceilPowerOfTwo(value: number): number {
  return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}

export function floorPowerOfTwo(value: number): number {
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}
