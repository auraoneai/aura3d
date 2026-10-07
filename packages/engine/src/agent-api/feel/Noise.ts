/**
 * Y-1 seeded 1D gradient noise (PRD-08 §6.5) — `perlin1(x, seed)`.
 *
 * Classic 1D Perlin: a deterministic ±1 gradient per integer lattice point
 * (seeded hash), dot-producted with the local offset and smoothed with the
 * quintic fade `6f⁵−15f⁴+10f³`. The raw result lies in ≈[−0.5, 0.5] and is
 * scaled ×2 then clamped into [−1, 1].
 *
 * No `Math.random()` anywhere (repo rule): every value derives from the
 * integer lattice coordinate and the seed.
 */

/** Deterministic lattice hash → [0, 1). */
function hashLattice(i: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic fade — C2-continuous interpolation weight. */
function fade(f: number): number {
  return f * f * f * (f * (f * 6 - 15) + 10);
}

/**
 * Seeded 1D gradient noise in [−1, 1]. Continuous in x, deterministic per
 * seed. Amplitude reaches the configured maxima: adjacent opposite gradients
 * produce peaks of ±0.5 before the ×2 gain.
 */
export function perlin1(x: number, seed = 0): number {
  const i0 = Math.floor(x);
  const f = x - i0;
  const g0 = hashLattice(i0, seed) < 0.5 ? -1 : 1;
  const g1 = hashLattice(i0 + 1, seed) < 0.5 ? -1 : 1;
  const d0 = g0 * f;
  const d1 = g1 * (f - 1);
  const u = fade(f);
  const raw = d0 + (d1 - d0) * u;
  return Math.max(-1, Math.min(1, raw * 2));
}

/** Convenience bound-noise factory for layers (seed fixed once). */
export function createNoise1D(seed = 0): (x: number) => number {
  return (x) => perlin1(x, seed);
}
