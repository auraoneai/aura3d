import { ValidationError } from "@aura3d/core";

export class Bitset {
  private readonly values = new Set<number>();

  static from(values: Iterable<number>): Bitset {
    const bitset = new Bitset();
    for (const value of values) bitset.add(value);
    return bitset;
  }

  add(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError("BITSET_VALUE", "Bitset values must be non-negative safe integers.");
    this.values.add(value);
    return this;
  }

  delete(value: number): boolean {
    return this.values.delete(value);
  }

  has(value: number): boolean {
    return this.values.has(value);
  }

  containsAll(other: Bitset): boolean {
    for (const value of other.values) {
      if (!this.values.has(value)) return false;
    }
    return true;
  }

  intersects(other: Bitset): boolean {
    for (const value of other.values) {
      if (this.values.has(value)) return true;
    }
    return false;
  }

  toArray(): number[] {
    return [...this.values].sort((a, b) => a - b);
  }

  clone(): Bitset {
    return Bitset.from(this.values);
  }
}
