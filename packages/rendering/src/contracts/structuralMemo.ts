// Internal (deliberately not re-exported from contracts/index.ts).

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Allocation-free structural equality over own enumerable keys. Two values that are equal here have equal own-entry sets, so
 * any serialisation that reads exactly those entries (and ignores key order) gives the same string for both; the converse is
 * not required, so a record that only differs by an `undefined`-valued key is a miss, never a wrong hit.
 */
export function sameStructure(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameStructure(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  let count = 0;
  for (const key in a as Record<string, unknown>) {
    if (!hasOwn.call(a, key)) continue;
    count += 1;
    if (!hasOwn.call(b, key) || !sameStructure((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  let other = 0;
  for (const key in b as Record<string, unknown>) if (hasOwn.call(b, key)) other += 1;
  return count === other;
}

/** Plain-data deep copy (objects, arrays, primitives): a memo must not alias a record the caller may mutate later. */
export function snapshotOf<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(snapshotOf) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const key in value as Record<string, unknown>) {
    if (hasOwn.call(value, key)) out[key] = snapshotOf((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/**
 * A small ring of recent (record snapshot, result) pairs for a pure function of a plain-data record. A frame asks for the
 * same few records in the same order every time, so the search starts after the last hit.
 */
export class StructuralMemo<V> {
  private readonly records: unknown[] = [];
  private readonly values: V[] = [];
  private next = 0;
  private cursor = 0;
  constructor(private readonly capacity: number) {}

  /** Compute `compute(record)` once per structurally distinct record. */
  resolve(record: unknown, compute: () => V): V {
    const size = this.records.length;
    for (let n = 0; n < size; n += 1) {
      const i = (this.cursor + n) % size;
      if (sameStructure(this.records[i], record)) {
        this.cursor = (i + 1) % size;
        return this.values[i]!;
      }
    }
    const value = compute();
    this.records[this.next] = snapshotOf(record);
    this.values[this.next] = value;
    this.cursor = (this.next + 1) % this.capacity;
    this.next = (this.next + 1) % this.capacity;
    return value;
  }
}
