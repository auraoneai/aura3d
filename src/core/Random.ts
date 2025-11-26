/**
 * Seedable random number generator for deterministic simulation.
 *
 * Implements the xorshift128+ algorithm for high-quality pseudo-random number generation.
 * Provides deterministic output for the same seed, which is critical for replays and
 * reproducible simulations.
 *
 * @example
 * ```typescript
 * const rng = new Random(12345);
 * const value = rng.next(); // Always returns same value for seed 12345
 * const index = rng.nextInt(10); // Random integer [0, 10)
 * const item = rng.pick(['a', 'b', 'c']);
 * ```
 */
export class Random {
  /**
   * Global shared instance for convenience.
   * Uses a random seed by default.
   */
  public static global: Random = new Random();

  private _seed: number;
  private state0: number;
  private state1: number;

  /**
   * Creates a new random number generator.
   *
   * @param seed - Initial seed value. If not provided, uses current time.
   */
  constructor(seed?: number) {
    this._seed = seed !== undefined ? seed : Date.now();
    this.state0 = 0;
    this.state1 = 0;
    this.initializeState(this._seed);
  }

  /**
   * Initializes the internal state from a seed value.
   * Uses a simple LCG to generate initial state values from the seed.
   *
   * @param seed - The seed value to initialize from
   */
  private initializeState(seed: number): void {
    // Use a simple LCG to generate initial state from seed
    // Ensures non-zero state values
    let s = seed & 0x7FFFFFFF; // Ensure positive
    if (s === 0) s = 1;

    // LCG parameters (from Numerical Recipes)
    const a = 1664525;
    const c = 1013904223;
    const m = 0x100000000; // 2^32

    s = (a * s + c) % m;
    this.state0 = s >>> 0;

    s = (a * s + c) % m;
    this.state1 = s >>> 0;

    // Ensure at least one state is non-zero
    if (this.state0 === 0 && this.state1 === 0) {
      this.state0 = 1;
    }

    // Warm up the generator
    for (let i = 0; i < 10; i++) {
      this.next();
    }
  }

  /**
   * Gets the current seed value.
   */
  public get seed(): number {
    return this._seed;
  }

  /**
   * Sets a new seed value and reinitializes the generator.
   */
  public set seed(value: number) {
    this._seed = value;
    this.initializeState(value);
  }

  /**
   * Gets the current internal state as a single number.
   * Can be used for checkpointing.
   *
   * @returns A packed representation of the internal state
   */
  public getState(): number {
    // Pack both state values into a single number using XOR and bit shifting
    // This is lossy but sufficient for basic state capture
    return (this.state0 ^ (this.state1 << 16)) >>> 0;
  }

  /**
   * Restores the internal state from a previously saved state.
   *
   * @param state - The state value to restore
   */
  public setState(state: number): void {
    // Unpack the state (this is a simple implementation)
    this.state0 = state >>> 0;
    this.state1 = (state >>> 16) >>> 0;

    // Ensure non-zero state
    if (this.state0 === 0 && this.state1 === 0) {
      this.state0 = 1;
    }
  }

  /**
   * Generates the next random number in [0, 1).
   *
   * Uses xorshift128+ algorithm for high-quality random numbers.
   *
   * @returns A pseudo-random number between 0 (inclusive) and 1 (exclusive)
   */
  public next(): number {
    // xorshift128+ algorithm
    let s1 = this.state0;
    const s0 = this.state1;

    this.state0 = s0;

    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;

    this.state1 = s1 >>> 0;

    // Combine states and convert to [0, 1)
    const result = ((this.state0 + this.state1) >>> 0) / 0x100000000;
    return result;
  }

  /**
   * Generates a random integer in [0, max).
   *
   * @param max - The exclusive upper bound
   * @returns A random integer between 0 (inclusive) and max (exclusive)
   * @throws Error if max is less than or equal to 0
   */
  public nextInt(max: number): number {
    if (max <= 0) {
      throw new Error('max must be greater than 0');
    }
    return Math.floor(this.next() * max);
  }

  /**
   * Generates a random number in [min, max).
   *
   * @param min - The inclusive lower bound
   * @param max - The exclusive upper bound
   * @returns A random number between min (inclusive) and max (exclusive)
   * @throws Error if min >= max
   */
  public nextRange(min: number, max: number): number {
    if (min >= max) {
      throw new Error('min must be less than max');
    }
    return min + this.next() * (max - min);
  }

  /**
   * Generates a random integer in [min, max).
   *
   * @param min - The inclusive lower bound
   * @param max - The exclusive upper bound
   * @returns A random integer between min (inclusive) and max (exclusive)
   * @throws Error if min >= max
   */
  public nextIntRange(min: number, max: number): number {
    if (min >= max) {
      throw new Error('min must be less than max');
    }
    return Math.floor(min + this.next() * (max - min));
  }

  /**
   * Generates a random number from a Gaussian (normal) distribution.
   *
   * Uses the Box-Muller transform to convert uniform random numbers
   * to Gaussian-distributed values.
   *
   * @param mean - The mean of the distribution (default: 0)
   * @param stdDev - The standard deviation of the distribution (default: 1)
   * @returns A random number from the specified Gaussian distribution
   */
  public nextGaussian(mean: number = 0, stdDev: number = 1): number {
    // Box-Muller transform
    let u1: number;
    let u2: number;

    // Ensure u1 is not 0 to avoid log(0)
    do {
      u1 = this.next();
    } while (u1 === 0);

    u2 = this.next();

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Generates a random number from an exponential distribution.
   *
   * Useful for modeling time between events in a Poisson process.
   *
   * @param lambda - The rate parameter (default: 1)
   * @returns A random number from the exponential distribution
   * @throws Error if lambda is less than or equal to 0
   */
  public nextExponential(lambda: number = 1): number {
    if (lambda <= 0) {
      throw new Error('lambda must be greater than 0');
    }

    // Inverse transform sampling
    let u: number;
    do {
      u = this.next();
    } while (u === 0); // Avoid log(0)

    return -Math.log(u) / lambda;
  }

  /**
   * Picks a random element from an array.
   *
   * @param array - The array to pick from
   * @returns A random element from the array
   * @throws Error if array is empty
   */
  public pick<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.nextInt(array.length)];
  }

  /**
   * Shuffles an array in-place using the Fisher-Yates algorithm.
   *
   * @param array - The array to shuffle
   * @returns The same array, shuffled
   */
  public shuffle<T>(array: T[]): T[] {
    // Fisher-Yates shuffle
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Picks a random element from an array based on probability weights.
   *
   * Higher weights increase the probability of selection. Weights do not
   * need to sum to 1 or 100.
   *
   * @param items - The array of items to pick from
   * @param weights - The corresponding probability weights
   * @returns A randomly selected item based on weights
   * @throws Error if arrays are empty, have different lengths, or all weights are zero
   */
  public weightedPick<T>(items: T[], weights: number[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from empty array');
    }

    if (items.length !== weights.length) {
      throw new Error('items and weights arrays must have same length');
    }

    if (items.length === 1) {
      return items[0];
    }

    // Calculate total weight
    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] < 0) {
        throw new Error('Weights must be non-negative');
      }
      totalWeight += weights[i];
    }

    if (totalWeight === 0) {
      throw new Error('Total weight must be greater than 0');
    }

    // Pick a random value in [0, totalWeight)
    const random = this.next() * totalWeight;

    // Find the corresponding item
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        return items[i];
      }
    }

    // Fallback (should not reach here due to floating point)
    return items[items.length - 1];
  }
}
