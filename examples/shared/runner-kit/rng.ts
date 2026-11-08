/** Seeded, counting random stream for runner sims: every gameplay draw goes through `next()` so replays stay in lock-step. */
import { createCountedRng, type QaCountedRng } from "@aura3d/engine";

export class GameRng {
  private readonly stream: QaCountedRng;

  constructor(seed: number) {
    this.stream = createCountedRng(seed);
  }

  /** number of draws taken so far. */
  get count(): number {
    return this.stream.count;
  }

  next(): number {
    return this.stream.next();
  }
}