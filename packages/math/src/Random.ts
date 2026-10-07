export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new RangeError("Seed must be an integer.");
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  range(min: number, max: number): number {
    if (min > max) throw new RangeError("min must be <= max");
    return min + (max - min) * this.nextFloat();
  }

  clone(): SeededRandom {
    const random = new SeededRandom(0);
    random.state = this.state;
    return random;
  }

  /** Integer in [min, maxExclusive). PRD-09 §7.6. */
  int(min: number, maxExclusive: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || min >= maxExclusive) {
      throw new RangeError("int requires integer min < maxExclusive.");
    }
    return min + Math.floor(this.nextFloat() * (maxExclusive - min));
  }

  /** Uniform pick from a non-empty array. PRD-09 §7.6. */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) throw new RangeError("pick requires a non-empty array.");
    return array[this.int(0, array.length)];
  }

  /** Fisher–Yates in-place shuffle; returns the same array. PRD-09 §7.6. */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Deterministically derived stream for a labelled subsystem — the same
   * seed + label always produces the same child sequence, and different
   * labels diverge. Consumes one draw from this stream so sibling forks do
   * not share a seed. PRD-09 §7.6.
   */
  fork(label: string): SeededRandom {
    return new SeededRandom((this.nextUint32() ^ fnv1a(label)) >>> 0);
  }
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
