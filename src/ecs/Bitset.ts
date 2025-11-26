/**
 * Efficient bit manipulation for component masks and archetype signatures.
 * Uses Uint32Array for storage with 32 bits per word.
 *
 * @example
 * ```typescript
 * const bitset = new Bitset();
 * bitset.set(0).set(5).set(31);
 * console.log(bitset.count()); // 3
 * console.log(bitset.get(5)); // true
 *
 * const other = new Bitset();
 * other.set(5).set(10);
 *
 * const intersection = bitset.and(other);
 * console.log(intersection.toArray()); // [5]
 * ```
 */
class Bitset {
  private words: Uint32Array;
  private bitCount: number;

  /**
   * Creates a new Bitset with the specified initial capacity.
   *
   * @param initialCapacity - Initial capacity in bits (default: 256)
   * @example
   * ```typescript
   * const bitset = new Bitset(512); // 512-bit capacity
   * ```
   */
  constructor(initialCapacity: number = 256) {
    const wordCount = Math.ceil(initialCapacity / 32);
    this.words = new Uint32Array(wordCount);
    this.bitCount = 0;
  }

  /**
   * Sets the specified bit to 1.
   * Auto-resizes if bit index exceeds current capacity.
   *
   * @param bit - Bit index to set
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.set(5).set(10).set(15);
   * ```
   */
  set(bit: number): this {
    const wordIndex = bit >> 5;
    const bitOffset = bit & 31;

    if (wordIndex >= this.words.length) {
      this.resize((wordIndex + 1) * 32);
    }

    const mask = 1 << bitOffset;
    const wasSet = (this.words[wordIndex] & mask) !== 0;
    this.words[wordIndex] |= mask;

    if (!wasSet) {
      this.bitCount++;
    }

    return this;
  }

  /**
   * Sets the specified bit to 0.
   *
   * @param bit - Bit index to unset
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.unset(5);
   * ```
   */
  unset(bit: number): this {
    const wordIndex = bit >> 5;
    const bitOffset = bit & 31;

    if (wordIndex >= this.words.length) {
      return this;
    }

    const mask = 1 << bitOffset;
    const wasSet = (this.words[wordIndex] & mask) !== 0;
    this.words[wordIndex] &= ~mask;

    if (wasSet) {
      this.bitCount--;
    }

    return this;
  }

  /**
   * Toggles the specified bit (0 to 1, or 1 to 0).
   *
   * @param bit - Bit index to toggle
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.toggle(5); // 0 -> 1
   * bitset.toggle(5); // 1 -> 0
   * ```
   */
  toggle(bit: number): this {
    const wordIndex = bit >> 5;
    const bitOffset = bit & 31;

    if (wordIndex >= this.words.length) {
      this.resize((wordIndex + 1) * 32);
    }

    const mask = 1 << bitOffset;
    const wasSet = (this.words[wordIndex] & mask) !== 0;
    this.words[wordIndex] ^= mask;

    if (wasSet) {
      this.bitCount--;
    } else {
      this.bitCount++;
    }

    return this;
  }

  /**
   * Gets the value of the specified bit.
   *
   * @param bit - Bit index to check
   * @returns True if bit is set, false otherwise
   * @example
   * ```typescript
   * bitset.set(5);
   * console.log(bitset.get(5)); // true
   * console.log(bitset.get(6)); // false
   * ```
   */
  get(bit: number): boolean {
    const wordIndex = bit >> 5;
    const bitOffset = bit & 31;

    if (wordIndex >= this.words.length) {
      return false;
    }

    return (this.words[wordIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Sets all bits to 1.
   *
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.setAll();
   * ```
   */
  setAll(): this {
    this.words.fill(0xFFFFFFFF);
    this.bitCount = this.words.length * 32;
    return this;
  }

  /**
   * Clears all bits (sets them to 0).
   *
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.clear();
   * console.log(bitset.count()); // 0
   * ```
   */
  clear(): this {
    this.words.fill(0);
    this.bitCount = 0;
    return this;
  }

  /**
   * Returns a new bitset with the intersection of this and other (this AND other).
   *
   * @param other - Bitset to intersect with
   * @returns New bitset containing the intersection
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3]);
   * const b = Bitset.fromArray([2, 3, 4]);
   * const result = a.and(b);
   * console.log(result.toArray()); // [2, 3]
   * ```
   */
  and(other: Bitset): Bitset {
    const result = this.clone();
    result.andInPlace(other);
    return result;
  }

  /**
   * Returns a new bitset with the union of this and other (this OR other).
   *
   * @param other - Bitset to union with
   * @returns New bitset containing the union
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3]);
   * const b = Bitset.fromArray([2, 3, 4]);
   * const result = a.or(b);
   * console.log(result.toArray()); // [1, 2, 3, 4]
   * ```
   */
  or(other: Bitset): Bitset {
    const result = this.clone();
    result.orInPlace(other);
    return result;
  }

  /**
   * Returns a new bitset with the symmetric difference of this and other (this XOR other).
   *
   * @param other - Bitset to XOR with
   * @returns New bitset containing the symmetric difference
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3]);
   * const b = Bitset.fromArray([2, 3, 4]);
   * const result = a.xor(b);
   * console.log(result.toArray()); // [1, 4]
   * ```
   */
  xor(other: Bitset): Bitset {
    const result = this.clone();
    result.xorInPlace(other);
    return result;
  }

  /**
   * Returns a new bitset with all bits flipped (NOT this).
   *
   * @returns New bitset with complement
   * @example
   * ```typescript
   * const a = new Bitset(8);
   * a.set(0).set(1);
   * const result = a.not();
   * console.log(result.get(0)); // false
   * console.log(result.get(2)); // true
   * ```
   */
  not(): Bitset {
    const result = this.clone();
    result.notInPlace();
    return result;
  }

  /**
   * Returns a new bitset with this AND NOT other.
   * Equivalent to removing all bits in other from this.
   *
   * @param other - Bitset to subtract
   * @returns New bitset with difference
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3, 4]);
   * const b = Bitset.fromArray([3, 4, 5]);
   * const result = a.andNot(b);
   * console.log(result.toArray()); // [1, 2]
   * ```
   */
  andNot(other: Bitset): Bitset {
    const result = this.clone();
    result.andNotInPlace(other);
    return result;
  }

  /**
   * Performs in-place intersection with other bitset (this AND other).
   *
   * @param other - Bitset to intersect with
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.andInPlace(other);
   * ```
   */
  andInPlace(other: Bitset): this {
    const minLength = Math.min(this.words.length, other.words.length);

    for (let i = 0; i < minLength; i++) {
      this.words[i] &= other.words[i];
    }

    for (let i = minLength; i < this.words.length; i++) {
      this.words[i] = 0;
    }

    this.recalculateCount();
    return this;
  }

  /**
   * Performs in-place union with other bitset (this OR other).
   *
   * @param other - Bitset to union with
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.orInPlace(other);
   * ```
   */
  orInPlace(other: Bitset): this {
    if (other.words.length > this.words.length) {
      this.resize(other.words.length * 32);
    }

    for (let i = 0; i < other.words.length; i++) {
      this.words[i] |= other.words[i];
    }

    this.recalculateCount();
    return this;
  }

  /**
   * Performs in-place symmetric difference with other bitset (this XOR other).
   *
   * @param other - Bitset to XOR with
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.xorInPlace(other);
   * ```
   */
  xorInPlace(other: Bitset): this {
    if (other.words.length > this.words.length) {
      this.resize(other.words.length * 32);
    }

    for (let i = 0; i < other.words.length; i++) {
      this.words[i] ^= other.words[i];
    }

    this.recalculateCount();
    return this;
  }

  /**
   * Flips all bits in-place (NOT this).
   *
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.notInPlace();
   * ```
   */
  notInPlace(): this {
    for (let i = 0; i < this.words.length; i++) {
      this.words[i] = ~this.words[i];
    }

    this.recalculateCount();
    return this;
  }

  /**
   * Performs in-place difference (this AND NOT other).
   *
   * @param other - Bitset to subtract
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.andNotInPlace(other);
   * ```
   */
  andNotInPlace(other: Bitset): this {
    const minLength = Math.min(this.words.length, other.words.length);

    for (let i = 0; i < minLength; i++) {
      this.words[i] &= ~other.words[i];
    }

    this.recalculateCount();
    return this;
  }

  /**
   * Checks if the bitset has no bits set.
   *
   * @returns True if no bits are set, false otherwise
   * @example
   * ```typescript
   * const bitset = new Bitset();
   * console.log(bitset.isEmpty()); // true
   * bitset.set(5);
   * console.log(bitset.isEmpty()); // false
   * ```
   */
  isEmpty(): boolean {
    return this.bitCount === 0;
  }

  /**
   * Returns the number of set bits (population count).
   * Uses efficient popcount algorithm.
   *
   * @returns Number of bits set to 1
   * @example
   * ```typescript
   * const bitset = Bitset.fromArray([1, 5, 10]);
   * console.log(bitset.count()); // 3
   * ```
   */
  count(): number {
    return this.bitCount;
  }

  /**
   * Checks if this bitset contains all bits set in other.
   * Equivalent to (this AND other) === other.
   *
   * @param other - Bitset to check
   * @returns True if all bits in other are set in this
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3, 4]);
   * const b = Bitset.fromArray([2, 3]);
   * console.log(a.contains(b)); // true
   * console.log(b.contains(a)); // false
   * ```
   */
  contains(other: Bitset): boolean {
    for (let i = 0; i < other.words.length; i++) {
      const thisWord = i < this.words.length ? this.words[i] : 0;
      if ((thisWord & other.words[i]) !== other.words[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if this bitset has any bits in common with other.
   * Equivalent to (this AND other) !== 0.
   *
   * @param other - Bitset to check
   * @returns True if any bit is set in both bitsets
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3]);
   * const b = Bitset.fromArray([3, 4, 5]);
   * console.log(a.intersects(b)); // true (bit 3 is common)
   * ```
   */
  intersects(other: Bitset): boolean {
    const minLength = Math.min(this.words.length, other.words.length);

    for (let i = 0; i < minLength; i++) {
      if ((this.words[i] & other.words[i]) !== 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if this bitset is equal to other.
   *
   * @param other - Bitset to compare with
   * @returns True if both bitsets have the same bits set
   * @example
   * ```typescript
   * const a = Bitset.fromArray([1, 2, 3]);
   * const b = Bitset.fromArray([1, 2, 3]);
   * console.log(a.equals(b)); // true
   * ```
   */
  equals(other: Bitset): boolean {
    if (this.bitCount !== other.bitCount) {
      return false;
    }

    const maxLength = Math.max(this.words.length, other.words.length);

    for (let i = 0; i < maxLength; i++) {
      const thisWord = i < this.words.length ? this.words[i] : 0;
      const otherWord = i < other.words.length ? other.words[i] : 0;
      if (thisWord !== otherWord) {
        return false;
      }
    }

    return true;
  }

  /**
   * Executes a callback for each set bit.
   *
   * @param callback - Function to call for each set bit index
   * @example
   * ```typescript
   * bitset.forEach((bit) => {
   *   console.log(`Bit ${bit} is set`);
   * });
   * ```
   */
  forEach(callback: (bit: number) => void): void {
    for (let i = 0; i < this.words.length; i++) {
      let word = this.words[i];
      if (word === 0) continue;

      const baseIndex = i * 32;
      while (word !== 0) {
        const trailingZeros = this.countTrailingZeros(word);
        callback(baseIndex + trailingZeros);
        word &= word - 1;
      }
    }
  }

  /**
   * Iterator that yields indices of set bits in ascending order.
   *
   * @returns Iterator over set bit indices
   * @example
   * ```typescript
   * const bitset = Bitset.fromArray([1, 5, 10]);
   * for (const bit of bitset) {
   *   console.log(bit); // 1, 5, 10
   * }
   * ```
   */
  *[Symbol.iterator](): Iterator<number> {
    for (let i = 0; i < this.words.length; i++) {
      let word = this.words[i];
      if (word === 0) continue;

      const baseIndex = i * 32;
      while (word !== 0) {
        const trailingZeros = this.countTrailingZeros(word);
        yield baseIndex + trailingZeros;
        word &= word - 1;
      }
    }
  }

  /**
   * Creates a copy of this bitset.
   *
   * @returns New bitset with same bits set
   * @example
   * ```typescript
   * const copy = bitset.clone();
   * ```
   */
  clone(): Bitset {
    const clone = new Bitset(this.words.length * 32);
    clone.words.set(this.words);
    clone.bitCount = this.bitCount;
    return clone;
  }

  /**
   * Copies all bits from other bitset to this one.
   *
   * @param other - Bitset to copy from
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.copy(other);
   * ```
   */
  copy(other: Bitset): this {
    if (other.words.length > this.words.length) {
      this.words = new Uint32Array(other.words.length);
    }

    this.words.set(other.words);

    if (other.words.length < this.words.length) {
      this.words.fill(0, other.words.length);
    }

    this.bitCount = other.bitCount;
    return this;
  }

  /**
   * Resizes the bitset to the specified capacity.
   * Preserves existing bits.
   *
   * @param newCapacity - New capacity in bits
   * @returns This bitset for chaining
   * @example
   * ```typescript
   * bitset.resize(512);
   * ```
   */
  resize(newCapacity: number): this {
    const newWordCount = Math.ceil(newCapacity / 32);

    if (newWordCount === this.words.length) {
      return this;
    }

    const newWords = new Uint32Array(newWordCount);
    newWords.set(this.words.subarray(0, Math.min(this.words.length, newWordCount)));
    this.words = newWords;

    return this;
  }

  /**
   * Computes a hash code for this bitset.
   * Consistent hash for archetype lookup tables.
   *
   * @returns Hash code
   * @example
   * ```typescript
   * const hash = bitset.hash();
   * ```
   */
  hash(): number {
    let h = 0;

    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i];
      if (word !== 0) {
        h = (h * 31 + word) | 0;
      }
    }

    return h >>> 0;
  }

  /**
   * Returns a binary string representation of the bitset.
   *
   * @returns Binary string (e.g., "10110...")
   * @example
   * ```typescript
   * const bitset = new Bitset(8);
   * bitset.set(0).set(2).set(3);
   * console.log(bitset.toString()); // "11010000"
   * ```
   */
  toString(): string {
    if (this.isEmpty()) {
      return "0";
    }

    let result = "";
    let maxBit = 0;

    for (const bit of this) {
      maxBit = Math.max(maxBit, bit);
    }

    for (let i = 0; i <= maxBit; i++) {
      result += this.get(i) ? "1" : "0";
    }

    return result;
  }

  /**
   * Returns an array of set bit indices.
   *
   * @returns Array of bit indices
   * @example
   * ```typescript
   * const bitset = Bitset.fromArray([1, 5, 10]);
   * console.log(bitset.toArray()); // [1, 5, 10]
   * ```
   */
  toArray(): number[] {
    const result: number[] = [];
    for (const bit of this) {
      result.push(bit);
    }
    return result;
  }

  /**
   * Gets an array of all set bit indices.
   * Alias for toArray() for compatibility.
   *
   * @returns Array of bit indices that are set to 1
   * @example
   * ```typescript
   * const bitset = Bitset.fromArray([1, 5, 10]);
   * console.log(bitset.getSetBits()); // [1, 5, 10]
   * ```
   */
  getSetBits(): number[] {
    return this.toArray();
  }

  /**
   * Creates a bitset from an array of bit indices.
   *
   * @param bits - Array of bit indices to set
   * @returns New bitset with specified bits set
   * @example
   * ```typescript
   * const bitset = Bitset.fromArray([1, 5, 10, 20]);
   * console.log(bitset.get(5)); // true
   * console.log(bitset.count()); // 4
   * ```
   */
  static fromArray(bits: number[]): Bitset {
    if (bits.length === 0) {
      return new Bitset();
    }

    const maxBit = Math.max(...bits);
    const bitset = new Bitset(maxBit + 1);

    for (const bit of bits) {
      bitset.set(bit);
    }

    return bitset;
  }

  /**
   * Recalculates the bit count by counting all set bits.
   * Uses Brian Kernighan's algorithm for efficient popcount.
   *
   * @private
   */
  private recalculateCount(): void {
    let count = 0;

    for (let i = 0; i < this.words.length; i++) {
      count += this.popcount(this.words[i]);
    }

    this.bitCount = count;
  }

  /**
   * Counts the number of set bits in a 32-bit word.
   * Uses Brian Kernighan's algorithm.
   *
   * @param word - 32-bit word
   * @returns Number of set bits
   * @private
   */
  private popcount(word: number): number {
    let count = 0;
    while (word !== 0) {
      word &= word - 1;
      count++;
    }
    return count;
  }

  /**
   * Counts trailing zeros in a 32-bit word.
   *
   * @param word - 32-bit word
   * @returns Number of trailing zeros
   * @private
   */
  private countTrailingZeros(word: number): number {
    if (word === 0) return 32;

    let count = 0;
    while ((word & 1) === 0) {
      word >>>= 1;
      count++;
    }

    return count;
  }
}

export { Bitset };
