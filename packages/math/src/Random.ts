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
}
