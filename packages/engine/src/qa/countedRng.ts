/** Seeded random stream (mulberry32) that counts its draws, so replays can assert the exact draw count. */
export interface QaCountedRng {
  readonly seed: number;
  /** Number of draws taken since the last `reset`. */
  readonly count: number;
  /** Alias of `count`: draws taken since the last `reset`. */
  readonly draws: number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
  /** Restart the stream (optionally with a new seed) and zero the draw counter. */
  reset(seed?: number): void;
}

export function createCountedRng(seed = 1): QaCountedRng {
  let state = seed >>> 0;
  let currentSeed = seed;
  let count = 0;
  const next = (): number => {
    count++;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    get seed() {
      return currentSeed;
    },
    get count() {
      return count;
    },
    get draws() {
      return count;
    },
    next,
    range(min, max) {
      if (min > max) throw new RangeError("min must be <= max");
      return min + (max - min) * next();
    },
    int(min, maxExclusive) {
      if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || min >= maxExclusive) {
        throw new RangeError("int requires integer min < maxExclusive.");
      }
      return min + Math.floor(next() * (maxExclusive - min));
    },
    reset(nextSeed) {
      if (nextSeed !== undefined) currentSeed = nextSeed;
      state = currentSeed >>> 0;
      count = 0;
    }
  };
}
