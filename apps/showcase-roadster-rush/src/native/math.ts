/** Small numeric helpers shared by the native Apex Overdrive simulation. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(+v || 0, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep01 = (t: number): number => t * t * (3 - 2 * t);
/** Frame-rate independent exponential approach of `a` towards `b` (rate in 1/s). */
export const damp = (a: number, b: number, rate: number, dt: number): number => a + (b - a) * (1 - Math.exp(-rate * dt));
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const TAU = Math.PI * 2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class Vector3 implements Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v: Vec3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  setY(y: number): this {
    this.y = y;
    return this;
  }
  multiplyScalar(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
}

/** 32-bit string hash (FNV-1a) used to derive deterministic preset seeds. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Stateless 2-key hash to [0,1) used for scenery ring placement. */
export function hash2(a: number, b: number): number {
  let n = Math.imul((a | 0) ^ 2654435769, 2246822507) ^ Math.imul((b | 0) + 1663821227, 3266489909);
  n ^= n >>> 16;
  n = Math.imul(n, 2146121005);
  n ^= n >>> 15;
  n = Math.imul(n, 2221713035);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
