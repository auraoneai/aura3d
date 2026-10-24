/**
 * The seeded, counting random stream the port draws from. Same mulberry32 as the capture hook
 * (`tools/crayon-capture/splat-rush-lib.ts`): the original's "game stream" is the draws made from its own
 * module (gate colours, power-ups, particles, camera shake, clouds, canvas textures), and the simulation in
 * `sim.ts` consumes this stream in exactly the same order.
 */
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
