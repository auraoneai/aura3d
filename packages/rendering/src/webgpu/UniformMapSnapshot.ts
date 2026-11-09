/**
 * Dependency snapshots of a pure uniform-map reader (internal to the WebGPU device).
 *
 * `recordUniformReads` runs a reader (such as the generated-PBR packer) against a map that records every name it
 * reads with `get` or tests with `has`. The snapshot then holds, per name, what the reader saw: the presence for a
 * `has`-only name; otherwise a copy of the number or of the numeric array / typed array contents (so in-place edits of
 * a reused array are seen), or the value itself by reference for anything else. A reader that only depends on what it
 * read produces the same result for any map that `matchUniformSnapshot` accepts.
 *
 * Equality is exact: -0 differs from 0 (their f32 bytes differ) and NaN never matches, so an invalid value always
 * reaches the validating reader again. A reader that iterates the map, or a value that cannot be copied this way (a
 * DataView, a BigInt array, a non-numeric array element), gives no snapshot.
 */
export interface UniformSnapshot {
  readonly names: readonly string[];
  /** Per name: HAS_ONLY, REFERENCE, NUMBER, or the length of a copied numeric sequence. */
  readonly kinds: Int32Array;
  /** Start of the name's copied values in `numbers`. */
  readonly starts: Int32Array;
  readonly numbers: Float64Array;
  /** Presence for HAS_ONLY names; the value for REFERENCE names. */
  readonly refs: unknown[];
}

const HAS_ONLY = -3;
const REFERENCE = -2;
const NUMBER = -1;

function sameNumber(a: number, b: number): boolean {
  return a === b && (a !== 0 || 1 / a === 1 / b);
}

/** The value as a numeric sequence when it is an array or a non-BigInt typed array; otherwise null. */
export function numericSequence(value: unknown): ArrayLike<number> | null {
  if (Array.isArray(value)) return value as number[];
  if (ArrayBuffer.isView(value) && !(value instanceof DataView) && !(value instanceof BigInt64Array) && !(value instanceof BigUint64Array)) {
    return value as unknown as ArrayLike<number>;
  }
  return null;
}

class RecordingUniformMap<V> implements ReadonlyMap<string, V> {
  readonly reads = new Map<string, boolean>();
  iterated = false;
  constructor(private readonly source: ReadonlyMap<string, V>) {}
  get(name: string): V | undefined { this.reads.set(name, true); return this.source.get(name); }
  has(name: string): boolean { if (!this.reads.has(name)) this.reads.set(name, false); return this.source.has(name); }
  get size(): number { this.iterated = true; return this.source.size; }
  forEach(callback: (value: V, key: string, map: ReadonlyMap<string, V>) => void, thisArg?: unknown): void {
    this.iterated = true; this.source.forEach((value, key) => callback.call(thisArg, value, key, this));
  }
  entries(): MapIterator<[string, V]> { this.iterated = true; return this.source.entries(); }
  keys(): MapIterator<string> { this.iterated = true; return this.source.keys(); }
  values(): MapIterator<V> { this.iterated = true; return this.source.values(); }
  [Symbol.iterator](): MapIterator<[string, V]> { return this.entries(); }
}

/** Run `read` on a recording view of `uniforms`; returns its result and a snapshot of what it read (null when none can be taken). */
export function recordUniformReads<V, R>(uniforms: ReadonlyMap<string, V>, read: (uniforms: ReadonlyMap<string, V>) => R): { readonly result: R; readonly snapshot: UniformSnapshot | null } {
  const recorder = new RecordingUniformMap(uniforms);
  const result = read(recorder);
  if (recorder.iterated) return { result, snapshot: null };
  const names = [...recorder.reads.keys()];
  const kinds = new Int32Array(names.length), starts = new Int32Array(names.length);
  const refs: unknown[] = new Array(names.length);
  let total = 0;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    if (!recorder.reads.get(name)) { kinds[index] = HAS_ONLY; refs[index] = uniforms.has(name); continue; }
    const value = uniforms.get(name);
    if (typeof value === "number") { kinds[index] = NUMBER; starts[index] = total; total += 1; continue; }
    const sequence = numericSequence(value);
    if (sequence) {
      for (let i = 0; i < sequence.length; i += 1) if (typeof sequence[i] !== "number") return { result, snapshot: null };
      kinds[index] = sequence.length; starts[index] = total; total += sequence.length;
      continue;
    }
    if (ArrayBuffer.isView(value)) return { result, snapshot: null };
    kinds[index] = REFERENCE; refs[index] = value;
  }
  const numbers = new Float64Array(total);
  for (let index = 0; index < names.length; index += 1) {
    const kind = kinds[index]!, start = starts[index]!;
    if (kind === NUMBER) numbers[start] = uniforms.get(names[index]!) as number;
    else if (kind >= 0) {
      const sequence = numericSequence(uniforms.get(names[index]!))!;
      for (let i = 0; i < kind; i += 1) numbers[start + i] = sequence[i]!;
    }
  }
  return { result, snapshot: { names, kinds, starts, numbers, refs } };
}

/** True when `value` equals what the snapshot holds for entry `index`. */
function entryMatches(snapshot: UniformSnapshot, index: number, uniforms: ReadonlyMap<string, unknown>): boolean {
  const name = snapshot.names[index]!, kind = snapshot.kinds[index]!;
  if (kind === HAS_ONLY) return uniforms.has(name) === snapshot.refs[index];
  const value = uniforms.get(name);
  if (kind === REFERENCE) return value === snapshot.refs[index] && (value !== undefined || !uniforms.has(name));
  if (kind === NUMBER) return typeof value === "number" && sameNumber(value, snapshot.numbers[snapshot.starts[index]!]!);
  const sequence = numericSequence(value);
  if (!sequence || sequence.length !== kind) return false;
  const numbers = snapshot.numbers, start = snapshot.starts[index]!;
  for (let i = 0; i < kind; i += 1) {
    const item = sequence[i];
    if (typeof item !== "number" || !sameNumber(item, numbers[start + i]!)) return false;
  }
  return true;
}

/**
 * Compare `uniforms` with the snapshot. Returns null when every read name matches; otherwise the indices of the
 * differing names, or `false` once more than `limit` names differ.
 */
export function diffUniformSnapshot(snapshot: UniformSnapshot, uniforms: ReadonlyMap<string, unknown>, limit: number): number[] | null | false {
  let differing: number[] | null = null;
  for (let index = 0; index < snapshot.names.length; index += 1) {
    if (entryMatches(snapshot, index, uniforms)) continue;
    (differing ??= []).push(index);
    if (differing.length > limit) return false;
  }
  return differing;
}

/** The snapshot name at `index`, and the copied-sequence length (or -1 for a number, -2 for any other kind). */
export function uniformSnapshotEntry(snapshot: UniformSnapshot, index: number): { readonly name: string; readonly length: number } {
  const kind = snapshot.kinds[index]!;
  return { name: snapshot.names[index]!, length: kind >= 0 ? kind : kind === NUMBER ? -1 : -2 };
}

/**
 * Store the current value of entry `index` (a number, or a numeric sequence of the snapshot's length) in the snapshot.
 * Returns false, leaving the entry unchanged, when the value does not have that shape.
 */
export function updateUniformSnapshotEntry(snapshot: UniformSnapshot, index: number, value: unknown): boolean {
  const kind = snapshot.kinds[index]!, start = snapshot.starts[index]!;
  if (kind === NUMBER) {
    if (typeof value !== "number") return false;
    snapshot.numbers[start] = value;
    return true;
  }
  if (kind < 0) return false;
  const sequence = numericSequence(value);
  if (!sequence || sequence.length !== kind) return false;
  for (let i = 0; i < kind; i += 1) if (typeof sequence[i] !== "number") return false;
  for (let i = 0; i < kind; i += 1) snapshot.numbers[start + i] = sequence[i]!;
  return true;
}
