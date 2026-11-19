/** Seeded, counting random stream for game sims. Extracted from the runner kit (`examples/shared/runner-kit/rng.ts`) in 5.7.0. */
import { createCountedRng, type QaCountedRng } from "@aura3d/engine";

/**
 * A seeded random stream that counts its draws (over `createCountedRng`). Route every gameplay draw through `next()`
 * so replays stay in lock-step; compare `count` between runs to catch an extra draw.
 *
 * @example
 * const rng = new GameRng(20261101);
 * const lane = Math.floor(rng.next() * 3);
 */
export class GameRng {
  private readonly stream: QaCountedRng;

  /** Start a stream at `seed`; the same seed always yields the same sequence. */
  constructor(seed: number) {
    this.stream = createCountedRng(seed);
  }

  /** Number of draws taken so far. */
  get count(): number {
    return this.stream.count;
  }

  /** The next draw in [0, 1). */
  next(): number {
    return this.stream.next();
  }
}
