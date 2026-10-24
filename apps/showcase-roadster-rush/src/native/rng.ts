/** Seedable mulberry32 generator. The simulation never touches `Math.random`, so a seed fully determines a run. */
import { createCountedRng } from "@aura3d/engine";
export interface Rng {
  readonly seed: number;
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function createRng(seed = 42): Rng {
  const counted = createCountedRng(seed);
  const next = (): number => counted.next();
  return {
    seed,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (p) => next() < p
  };
}

/** Picks one of `items` using cumulative `weights` (weights should sum to ~1). */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let r = rng.next();
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
