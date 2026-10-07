/**
 * game-sound/rng.ts — seeded jitter stream for deterministic captures (§6.8).
 *
 * One stream per engine instance, seeded from the session seed. Used for
 * cue variant picks (round-robin without immediate repeats), pitch jitter
 * (± semitones) and gain jitter (± dB).
 */

export type Rng = () => number;

export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Uniform value in [±range]. */
export const jitter = (rng: Rng, range: number): number => (rng() * 2 - 1) * range;

/**
 * Pick a variant index in [0, count): round-robin order shuffled per cycle
 * so picks never immediately repeat (when count > 1) and the sequence is
 * deterministic for a seed.
 */
export class VariantPicker {
  private order: number[] = [];
  private index = 0;

  constructor(private readonly count: number, private readonly rng: Rng) {}

  next(): number {
    if (this.count <= 1) return 0;
    if (this.index >= this.order.length) {
      this.shuffle();
      this.index = 0;
    }
    return this.order[this.index++];
  }

  private shuffle(): void {
    const previous = this.order.length > 0 ? this.order[(this.index - 1 + this.order.length) % this.order.length] : -1;
    this.order = Array.from({ length: this.count }, (_, i) => i);
    for (let i = this.count - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    // Never lead a new cycle with the variant that ended the last one.
    if (this.order[0] === previous && this.count > 1) {
      const swap = 1 + Math.floor(this.rng() * (this.count - 1));
      [this.order[0], this.order[swap]] = [this.order[swap], this.order[0]];
    }
  }
}
