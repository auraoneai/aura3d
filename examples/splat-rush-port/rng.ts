/**
 * The seeded, counting random stream the port draws from. Same mulberry32 as the capture hook
 * (`tools/crayon-capture/splat-rush-lib.ts`): the original's "game stream" is the draws made from its own
 * module (gate colours, power-ups, particles, camera shake, clouds, canvas textures), and the simulation in
 * `sim.ts` consumes this stream in exactly the same order.
 */
export class GameRng {
  private a: number;
  /** number of draws taken so far. */
  count = 0;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  next(): number {
    this.count++;
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
