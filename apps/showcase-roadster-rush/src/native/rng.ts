/** Seedable mulberry32 generator. The simulation never touches `Math.random`, so a seed fully determines a run. */
export interface Rng {
  readonly seed: number;
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function createRng(seed = 42): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 1831565813) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
