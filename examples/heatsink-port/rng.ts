import { createCountedRng } from "@aura3d/engine";

/** The game's seeded generator (a mulberry32 variant), used for the track's scatter rules and AI. */
export function seededRandom(seed: number): () => number {
  const rng = createCountedRng(seed);
  return () => rng.next();
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
