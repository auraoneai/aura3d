/**
 * Per-frame uniform arena for batched WebGPU draws (5.5.1, P1).
 *
 * Every batched draw's uniform block is staged into a CPU mirror of a few large GPU uniform buffers ("chunks") at an
 * aligned offset handed out in draw order, and is bound as `{ buffer, offset, size }`. Only words that differ from the
 * mirror are marked dirty; dirty runs closer than `mergeGap` bytes are coalesced, and `flush()` (called before each
 * batch submission) uploads them with one `writeBuffer` per run instead of one per draw. Offsets restart at 0 every
 * frame (`rewind`), so an unchanged draw finds its previous frame's bytes at the same offset (same bind group, no
 * upload). Queue writes are ordered after earlier submissions, so rewriting an offset last frame's draws read is safe;
 * within a frame offsets are never reused.
 *
 * Invariant: after `flush()`, every chunk's GPU contents equal its mirror. Between flushes, the pending dirty runs are
 * exactly the mirror bytes the GPU does not have yet, and they persist until the next flush (so a draw whose batch is
 * submitted later still finds its bytes uploaded before that submission).
 */

export interface UniformArenaHost<B extends object> {
  /** A zero-initialised GPU buffer usable as a uniform binding and as a `writeBuffer` destination. */
  createChunk(size: number, index: number): B;
  /** `queue.writeBuffer(buffer, offset, bytes)` (the bytes are copied by the call). */
  write(buffer: B, offset: number, bytes: Uint8Array): void;
}

export interface UniformArenaOptions {
  /** `minUniformBufferOffsetAlignment` (a power of two, at least 4). */
  readonly alignment: number;
  /** Size of the first chunk; later chunks double up to `maxChunkSize`. */
  readonly firstChunkSize?: number;
  readonly maxChunkSize?: number;
  /** Dirty runs separated by at most this many clean bytes are uploaded as one write. */
  readonly mergeGap?: number;
}

/** A bound uniform range; usable directly as a `GPUBufferBinding` (`{ buffer, offset, size }`). Stable per offset and size. */
export class UniformArenaRegion<B extends object> {
  constructor(readonly buffer: B, readonly offset: number, readonly size: number) {}
}

/** Identity of a slot image whose bytes a region last received (see WebGPUDevice slot images). */
export interface UniformArenaImageTag {
  readonly image: Uint8Array;
  readonly version: number;
  /**
   * The image was made by copying `base` at `baseVersion` and rewriting only bytes `[start, end)`: a region that holds
   * `base` at that version compares and copies just that range.
   */
  readonly patch?: { readonly base: Uint8Array; readonly baseVersion: number; readonly start: number; readonly end: number };
}

interface Chunk<B extends object> {
  readonly buffer: B;
  readonly mirror: Uint8Array;
  readonly words: Uint32Array;
  readonly size: number;
  /** Stable region objects by offset (replaced when a different size is staged there). */
  readonly regions: Map<number, UniformArenaRegion<B>>;
  /** The slot image and version each offset last received. */
  readonly images: Map<number, Uint8Array>;
  readonly versions: Map<number, number>;
  /** Per alignment slot, the offset of the block staged over it last (-1: none), so a remembered image is trusted only while no other block overlapped it. */
  readonly owners: Int32Array;
  /** Pending dirty byte runs as flat [start, end, start, end, ...], ascending within a frame. */
  dirty: number[];
}

export class UniformArena<B extends object> {
  readonly #host: UniformArenaHost<B>;
  readonly #alignment: number;
  readonly #firstChunkSize: number;
  readonly #maxChunkSize: number;
  readonly #mergeGap: number;
  readonly #chunks: Chunk<B>[] = [];
  #chunk = 0;
  #cursor = 0;
  #broken = false;
  /** Writes issued and bytes uploaded since construction (diagnostics and tests). */
  writes = 0;
  bytesUploaded = 0;

  constructor(host: UniformArenaHost<B>, options: UniformArenaOptions) {
    const alignment = options.alignment;
    if (!Number.isSafeInteger(alignment) || alignment < 4 || (alignment & (alignment - 1)) !== 0) {
      throw new RangeError(`Uniform arena alignment must be a power of two of at least 4, got ${alignment}`);
    }
    this.#host = host;
    this.#alignment = alignment;
    // Chunk sizes are whole multiples of the alignment.
    this.#maxChunkSize = Math.max(alignment, (options.maxChunkSize ?? 4 * 1024 * 1024) & ~(alignment - 1));
    this.#firstChunkSize = Math.min(this.#maxChunkSize, Math.max(alignment, (options.firstChunkSize ?? 256 * 1024) & ~(alignment - 1)));
    this.#mergeGap = Math.max(0, options.mergeGap ?? 1024);
  }

  /** Chunk buffers created so far (in creation order). */
  get buffers(): readonly B[] { return this.#chunks.map((chunk) => chunk.buffer); }

  /** True after a failed upload, until `reset()`: `stage` returns null. */
  get broken(): boolean { return this.#broken; }

  /** True while staged bytes are waiting for `flush()`. */
  get pending(): boolean { return this.#chunks.some((chunk) => chunk.dirty.length > 0); }

  /** Whether `value` is a region handed out by an arena. */
  static isRegion(value: unknown): value is UniformArenaRegion<object> { return value instanceof UniformArenaRegion; }

  /**
   * Stage `bytes` (a whole uniform block, length a multiple of 4) at the next aligned offset and return its region, or
   * null when the block cannot be placed in a chunk (the caller then uses its own buffer). `tag` names a slot image: a
   * region that last received the same image at the same version already holds its bytes and is not compared.
   */
  stage(bytes: Uint8Array, tag?: UniformArenaImageTag): UniformArenaRegion<B> | null {
    const size = bytes.byteLength;
    if (this.#broken || size === 0 || (size & 3) !== 0 || size > this.#maxChunkSize) return null;
    let chunk = this.#chunks[this.#chunk];
    let offset = alignUp(this.#cursor, this.#alignment);
    if (!chunk || offset + size > chunk.size) {
      // The rest of this chunk stays as it is; the block goes to the start of the next one.
      if (chunk) { this.#chunk += 1; offset = 0; }
      chunk = this.#chunks[this.#chunk] ?? this.#createChunk(size);
      if (size > chunk.size) return null;
      offset = 0;
    }
    this.#cursor = offset + size;
    let region = chunk.regions.get(offset);
    if (!region || region.size !== size) {
      region = new UniformArenaRegion(chunk.buffer, offset, size);
      chunk.regions.set(offset, region);
    }
    const align = this.#alignment;
    const owners = chunk.owners;
    let intact = true;
    for (let slot = offset / align, end = Math.ceil((offset + size) / align); slot < end; slot += 1) {
      if (owners[slot] !== offset) { intact = false; owners[slot] = offset; }
    }
    const last = chunk.images.get(offset);
    const lastVersion = chunk.versions.get(offset);
    if (tag && intact && last === tag.image && lastVersion === tag.version && last.byteLength === size) return region;
    if (tag) { chunk.images.set(offset, tag.image); chunk.versions.set(offset, tag.version); }
    else if (last) chunk.images.delete(offset);
    const patch = tag?.patch;
    if (patch && intact && last === patch.base && lastVersion === patch.baseVersion && last.byteLength === size
      && patch.start >= 0 && patch.end <= size && patch.start < patch.end) {
      // The region holds the base image: only the rewritten range can differ.
      const start = patch.start & ~3, end = (patch.end + 3) & ~3;
      this.#copyChanged(chunk, offset + start, bytes.subarray(start, end));
      return region;
    }
    this.#copyChanged(chunk, offset, bytes);
    return region;
  }

  /** Upload every pending dirty run (one write per coalesced run). */
  flush(): void {
    for (const chunk of this.#chunks) {
      const dirty = chunk.dirty;
      if (dirty.length === 0) continue;
      chunk.dirty = [];
      for (let index = 0; index < dirty.length; index += 2) {
        const start = dirty[index]!, end = dirty[index + 1]!;
        try {
          this.#host.write(chunk.buffer, start, chunk.mirror.subarray(start, end));
        } catch (error) {
          // The GPU no longer matches the mirror: stage nothing more until `reset()`.
          this.#broken = true;
          throw error;
        }
        this.writes += 1;
        this.bytesUploaded += end - start;
      }
    }
  }

  /** Start the next frame's allocations at offset 0 (pending runs are uploaded first). */
  rewind(): void {
    this.flush();
    this.#chunk = 0;
    this.#cursor = 0;
  }

  /** Drop every chunk (device loss or disposal) and return their buffers for retirement. */
  reset(): B[] {
    const buffers = this.buffers.slice();
    this.#chunks.length = 0;
    this.#chunk = 0;
    this.#cursor = 0;
    this.#broken = false;
    return buffers;
  }

  #createChunk(minimum: number): Chunk<B> {
    const index = this.#chunks.length;
    let size = this.#firstChunkSize;
    for (let step = 0; step < index && size < this.#maxChunkSize; step += 1) size *= 2;
    size = Math.min(this.#maxChunkSize, Math.max(size, alignUp(minimum, this.#alignment)));
    const buffer = this.#host.createChunk(size, index);
    const mirror = new Uint8Array(size);
    const chunk: Chunk<B> = { buffer, mirror, words: new Uint32Array(mirror.buffer), size, regions: new Map(), images: new Map(), versions: new Map(), owners: new Int32Array(Math.ceil(size / this.#alignment)).fill(-1), dirty: [] };
    this.#chunks.push(chunk);
    return chunk;
  }

  /** Copy `bytes` into the mirror at `offset` and mark the changed word range dirty. */
  #copyChanged(chunk: Chunk<B>, offset: number, bytes: Uint8Array): void {
    const count = bytes.byteLength >> 2;
    const base = offset >> 2;
    const words = chunk.words;
    let first = -1, last = -1;
    if ((bytes.byteOffset & 3) === 0) {
      const source = new Uint32Array(bytes.buffer, bytes.byteOffset, count);
      for (let index = 0; index < count; index += 1) {
        if (words[base + index] !== source[index]) { first = index; break; }
      }
      if (first < 0) return;
      for (let index = count - 1; index > first; index -= 1) {
        if (words[base + index] !== source[index]) { last = index; break; }
      }
      if (last < 0) last = first;
      words.set(source.subarray(first, last + 1), base + first);
    } else {
      const mirror = chunk.mirror;
      for (let index = 0; index < bytes.byteLength; index += 1) {
        if (mirror[offset + index] !== bytes[index]) { first = index >> 2; break; }
      }
      if (first < 0) return;
      for (let index = bytes.byteLength - 1; index >= first << 2; index -= 1) {
        if (mirror[offset + index] !== bytes[index]) { last = index >> 2; break; }
      }
      mirror.set(bytes.subarray(first << 2, (last + 1) << 2), offset + (first << 2));
    }
    this.#markDirty(chunk, offset + (first << 2), offset + ((last + 1) << 2));
  }

  #markDirty(chunk: Chunk<B>, start: number, end: number): void {
    const dirty = chunk.dirty;
    const length = dirty.length;
    if (length > 0) {
      const lastStart = dirty[length - 2]!, lastEnd = dirty[length - 1]!;
      // Ascending within a frame; a run after a rewind may start earlier and is kept as its own write.
      if (start >= lastStart && start <= lastEnd + this.#mergeGap) {
        if (end > lastEnd) dirty[length - 1] = end;
        return;
      }
    }
    dirty.push(start, end);
  }
}

function alignUp(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1);
}
