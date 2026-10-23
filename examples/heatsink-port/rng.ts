/** The game's seeded generator (a mulberry32 variant), used for the track's scatter rules and AI. */
export function seededRandom(seed: number): () => number {
  let e = seed >>> 0;
  return function () {
    e |= 0;
    e = (e + 1831565813) | 0;
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** exponential smoothing factor, 1 - exp(-k*dt) */
export const expSmooth = (k: number, dt: number): number => 1 - Math.exp(-k * dt);
export const smoothstep = (a: number, b: number, v: number): number => {
  const s = clamp((v - a) / (b - a), 0, 1);
  return s * s * (3 - 2 * s);
};
