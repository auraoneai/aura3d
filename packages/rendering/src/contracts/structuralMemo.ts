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

function hashString(value: string): number {
  let h = 2166136261;
  const len = value.length;
  const step = len > 32 ? (len >> 4) : 1;
  for (let i = 0; i < len; i += step) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return (h ^ len) | 0;
}

/**
 * Order-independent (commutative over own object keys) shallow structural hash.
 * Two values with `sameStructure(a, b) === true` are guaranteed to produce the exact same 32-bit hash.
 */
function structuralHash(value: unknown, depth = 0): number {
  if (value === null) return 1;
  const t = typeof value;
  if (t === "boolean") return value ? 3 : 2;
  if (t === "number") {
    if (Object.is(value, -0)) return 4;
    if (Number.isNaN(value)) return 5;
    return Math.imul((value as number) | 0, 2654435761) ^ Math.imul(Math.round(((value as number) % 1) * 1e6), 2246822519);
  }
  if (t === "string") return hashString(value as string);
  if (t !== "object") return 7;
  if (Array.isArray(value)) {
    let h = (2166136261 ^ value.length) | 0;
    if (depth < 2) {
      for (let i = 0; i < value.length; i += 1) {
        h = Math.imul(h ^ structuralHash(value[i], depth + 1), 16777619);
      }
    }
    return h | 0;
  }
  const obj = value as Record<string, unknown>;
  let sum = 0;
  let xor = 0;
  let count = 0;
  for (const key in obj) {
    if (!hasOwn.call(obj, key)) continue;
    count += 1;
    const kh = hashString(key);
    const vh = depth < 2 ? structuralHash(obj[key], depth + 1) : 11;
    const entry = Math.imul(kh ^ Math.imul(vh, 3266489917), 668265263) | 0;
    sum = (sum + entry) | 0;
    xor ^= entry;
  }
  return (Math.imul(sum, 374761393) ^ xor ^ count) | 0;
}

/**
 * A small ring of recent (record snapshot, result) pairs for a pure function of a plain-data record.
 * Indexed by an order-independent structural hash so steady-state lookups check only matching hash bucket entries.
 */
export class StructuralMemo<V> {
  private readonly records: unknown[] = [];
  private readonly values: V[] = [];
  private readonly hashes: number[] = [];
  private readonly buckets = new Map<number, number[]>();
  private next = 0;
  constructor(private readonly capacity: number) {}

  /** Compute `compute(record)` once per structurally distinct record. */
  resolve(record: unknown, compute: () => V): V {
    const hash = structuralHash(record);
    const bucket = this.buckets.get(hash);
    if (bucket) {
      for (let b = bucket.length - 1; b >= 0; b -= 1) {
        const i = bucket[b]!;
        if (sameStructure(this.records[i], record)) {
          return this.values[i]!;
        }
      }
    }
    const value = compute();
    if (this.capacity <= 0) return value;
    const slot = this.next;
    if (slot < this.records.length) {
      const oldHash = this.hashes[slot]!;
      const oldBucket = this.buckets.get(oldHash);
      if (oldBucket) {
        const idx = oldBucket.indexOf(slot);
        if (idx >= 0) oldBucket.splice(idx, 1);
        if (oldBucket.length === 0) this.buckets.delete(oldHash);
      }
    }
    this.records[slot] = snapshotOf(record);
    this.values[slot] = value;
    this.hashes[slot] = hash;
    let targetBucket = this.buckets.get(hash);
    if (!targetBucket) {
      targetBucket = [];
      this.buckets.set(hash, targetBucket);
    }
    targetBucket.push(slot);
    this.next = (slot + 1) % this.capacity;
    return value;
  }
}
