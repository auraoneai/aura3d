export interface GlyphBitmap {
  readonly width: number;
  readonly height: number;
  /** One normalized distance/coverage byte per pixel, in row-major order. */
  readonly data: Uint8Array;
}

export interface GlyphAtlasOptions {
  readonly width?: number;
  readonly height?: number;
  readonly maxEntries?: number;
  /** Optional renderer-owned backing; released exactly once on dispose. */
  readonly texture?: GlyphAtlasTexture;
}

export interface GlyphAtlasEntry {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly uv: readonly [number, number, number, number];
}

export interface GlyphAtlasUpdate {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Adapter for a renderer-owned GPU texture, including its pixel-format conversion. */
export interface GlyphAtlasTexture {
  update?(region: GlyphAtlasUpdate): void;
  dispose(): void;
}

interface EntryRecord { readonly entry: GlyphAtlasEntry; refs: number; used: number }

/** Bounded atlas with retained entries, LRU eviction and dirty-region uploads. */
export class GlyphAtlas {
  readonly width: number;
  readonly height: number;
  private pixels: Uint8Array;
  private readonly maxEntries: number;
  private readonly texture?: GlyphAtlasTexture;
  private readonly records = new Map<string, EntryRecord>();
  private occupied: Uint8Array;
  private readonly columns: number;
  private readonly rows: number;
  private dirty?: { x: number; y: number; right: number; bottom: number };
  private clock = 0;
  private closed = false;
  private flushing = false;
  private finalized = false;

  constructor(options: GlyphAtlasOptions = {}) {
    this.width = options.width ?? 1024;
    this.height = options.height ?? 1024;
    this.maxEntries = options.maxEntries ?? 1024;
    if (!Number.isInteger(this.width) || !Number.isInteger(this.height) || this.width < 8 || this.height < 8 ||
        this.width > 4096 || this.height > 4096 || this.width % 8 || this.height % 8 ||
        !Number.isInteger(this.maxEntries) || this.maxEntries < 1 || this.maxEntries > 16384) {
      throw new RangeError("Aura3D glyph atlas dimensions must be multiples of 8 within 8..4096, and maxEntries within 1..16384.");
    }
    this.pixels = new Uint8Array(this.width * this.height);
    this.columns = this.width / 8;
    this.rows = this.height / 8;
    this.occupied = new Uint8Array(this.columns * this.rows);
    this.texture = options.texture;
  }

  get size(): number { return this.records.size; }
  get disposed(): boolean { return this.closed; }
  get data(): Uint8Array { return this.pixels.slice(); }

  has(key: string): boolean {
    this.assertOpen();
    return this.records.has(key);
  }

  acquire(key: string, bitmap: GlyphBitmap): GlyphAtlasEntry {
    this.assertOpen();
    if (typeof key !== "string" || !key) throw new Error("Aura3D glyph atlas requires a non-empty key.");
    validateBitmap(bitmap);
    const existing = this.records.get(key);
    if (existing) {
      const matches = this.matches(existing.entry, bitmap);
      if (!matches && existing.refs > 0) {
        throw new Error("AURA_GLYPH_ATLAS_KEY_CONFLICT: a retained key cannot be reused with different pixels or dimensions.");
      }
      if (matches || (existing.entry.width === bitmap.width && existing.entry.height === bitmap.height)) {
        if (!matches) this.write(existing.entry, bitmap.data);
        existing.refs += 1;
        existing.used = ++this.clock;
        return existing.entry;
      }
    }
    const cellWidth = Math.ceil((bitmap.width + 2) / 8);
    const cellHeight = Math.ceil((bitmap.height + 2) / 8);
    if (cellWidth > this.columns || cellHeight > this.rows) throw new RangeError("Aura3D glyph exceeds atlas dimensions.");
    const plan = this.planAllocation(cellWidth, cellHeight, existing);
    if (!plan) throw new RangeError("Aura3D glyph atlas is full; release retained glyphs before allocating more.");
    for (const record of plan.evictions) this.evict(record);
    const spot = plan.spot;
    const x = spot.x * 8 + 1;
    const y = spot.y * 8 + 1;
    this.mark(spot.x, spot.y, cellWidth, cellHeight, 1);
    const uv: readonly [number, number, number, number] = Object.freeze([
      x / this.width, y / this.height, (x + bitmap.width) / this.width, (y + bitmap.height) / this.height
    ] as [number, number, number, number]);
    const entry: GlyphAtlasEntry = Object.freeze({ key, x, y, width: bitmap.width, height: bitmap.height, uv });
    this.records.set(key, { entry, refs: 1, used: ++this.clock });
    this.write(entry, bitmap.data);
    return entry;
  }

  /** Replace a retained entry in-place without changing its UV coordinates. */
  update(key: string, bitmap: GlyphBitmap): void {
    this.assertOpen();
    validateBitmap(bitmap);
    const record = this.records.get(key);
    if (!record || record.entry.width !== bitmap.width || record.entry.height !== bitmap.height) {
      throw new Error("Aura3D glyph atlas update requires an existing entry with matching dimensions.");
    }
    record.used = ++this.clock;
    if (!this.matches(record.entry, bitmap)) this.write(record.entry, bitmap.data);
  }

  release(key: string): void {
    this.assertOpen();
    const record = this.records.get(key);
    if (!record || record.refs === 0) throw new Error("Aura3D glyph atlas release has no matching acquire.");
    record.refs -= 1;
    record.used = ++this.clock;
  }

  /** Dirty bytes are copied so a later eviction cannot alter an outstanding upload. */
  takeUpdates(): readonly GlyphAtlasUpdate[] {
    this.assertOpen();
    const dirty = this.dirty;
    if (!dirty) return [];
    this.dirty = undefined;
    const width = dirty.right - dirty.x;
    const height = dirty.bottom - dirty.y;
    const data = new Uint8Array(width * height);
    for (let row = 0; row < height; row += 1) data.set(this.pixels.subarray((dirty.y + row) * this.width + dirty.x, (dirty.y + row) * this.width + dirty.right), row * width);
    return [{ x: dirty.x, y: dirty.y, width, height, data }];
  }

  /** Upload pending changes through the supplied GPU adapter; failed uploads remain dirty. */
  flush(): boolean {
    this.assertOpen();
    if (this.flushing) throw new Error("Aura3D glyph atlas cannot flush recursively.");
    if (!this.dirty) return false;
    if (!this.texture?.update) throw new Error("Aura3D glyph atlas has no GPU update adapter.");
    const update = this.takeUpdates()[0]!;
    let failed = false;
    let failure: unknown;
    this.flushing = true;
    try { this.texture.update(update); }
    catch (error) {
      failed = true;
      failure = error;
      if (!this.closed) {
        const pending = this.dirty as { x: number; y: number; right: number; bottom: number } | undefined;
        this.dirty = { x: Math.min(pending?.x ?? update.x, update.x), y: Math.min(pending?.y ?? update.y, update.y),
          right: Math.max(pending?.right ?? 0, update.x + update.width), bottom: Math.max(pending?.bottom ?? 0, update.y + update.height) };
      }
    } finally {
      this.flushing = false;
      if (this.closed) {
        try { this.finishDispose(); }
        catch (error) {
          failure = failed ? new AggregateError([failure, error], "Glyph atlas upload and disposal failed") : error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
    return true;
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.flushing) this.finishDispose();
  }

  private finishDispose(): void {
    if (this.finalized) return;
    this.finalized = true;
    this.records.clear();
    this.dirty = undefined;
    this.occupied = new Uint8Array(0);
    this.pixels = new Uint8Array(0);
    this.texture?.dispose();
  }

  private assertOpen(): void { if (this.closed) throw new Error("Aura3D glyph atlas is disposed."); }
  private mark(x: number, y: number, width: number, height: number, value: number, occupied = this.occupied): void {
    for (let row = y; row < y + height; row += 1) occupied.fill(value, row * this.columns + x, row * this.columns + x + width);
  }
  private markEntry(entry: GlyphAtlasEntry, value: number, occupied = this.occupied): void {
    this.mark((entry.x - 1) / 8, (entry.y - 1) / 8, Math.ceil((entry.width + 2) / 8), Math.ceil((entry.height + 2) / 8), value, occupied);
  }
  private findFree(width: number, height: number, occupied = this.occupied): { x: number; y: number } | undefined {
    if (width === 1 && height === 1) {
      const index = occupied.indexOf(0);
      return index < 0 ? undefined : { x: index % this.columns, y: Math.floor(index / this.columns) };
    }
    const stride = this.columns + 1;
    const sums = new Uint32Array(stride * (this.rows + 1));
    for (let y = 0; y < this.rows; y += 1) {
      let rowSum = 0;
      for (let x = 0; x < this.columns; x += 1) {
        rowSum += occupied[y * this.columns + x]!;
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + rowSum;
      }
    }
    for (let y = 0; y <= this.rows - height; y += 1) for (let x = 0; x <= this.columns - width; x += 1) {
      const count = sums[(y + height) * stride + x + width]! - sums[y * stride + x + width]! -
        sums[(y + height) * stride + x]! + sums[y * stride + x]!;
      if (count === 0) return { x, y };
    }
    return undefined;
  }
  private planAllocation(width: number, height: number, previous?: EntryRecord): {
    spot: { x: number; y: number };
    evictions: EntryRecord[];
  } | undefined {
    if (!previous && this.records.size < this.maxEntries) {
      const spot = this.findFree(width, height);
      if (spot) return { spot, evictions: [] };
    }
    const candidates = [...this.records.values()].filter((record) => record.refs === 0 && record !== previous)
      .sort((left, right) => left.used - right.used);
    const minimum = Math.max(0, this.records.size - (previous ? 1 : 0) - this.maxEntries + 1);
    if (minimum > candidates.length) return undefined;
    const spotAfter = (count: number): { x: number; y: number } | undefined => {
      const occupied = this.occupied.slice();
      if (previous) this.markEntry(previous.entry, 0, occupied);
      for (let index = 0; index < count; index += 1) this.markEntry(candidates[index]!.entry, 0, occupied);
      return this.findFree(width, height, occupied);
    };
    if (!spotAfter(candidates.length)) return undefined;
    let low = minimum;
    let high = candidates.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (spotAfter(middle)) high = middle;
      else low = middle + 1;
    }
    const spot = spotAfter(low)!;
    return { spot, evictions: [...(previous ? [previous] : []), ...candidates.slice(0, low)] };
  }
  private evict(record: EntryRecord): void {
    const { entry } = record;
    this.records.delete(entry.key);
    this.markEntry(entry, 0);
    this.write(entry, new Uint8Array(entry.width * entry.height));
  }
  private matches(entry: GlyphAtlasEntry, bitmap: GlyphBitmap): boolean {
    if (entry.width !== bitmap.width || entry.height !== bitmap.height) return false;
    for (let y = 0; y < entry.height; y += 1) for (let x = 0; x < entry.width; x += 1) {
      if (this.pixels[(entry.y + y) * this.width + entry.x + x] !== bitmap.data[y * entry.width + x]) return false;
    }
    return true;
  }
  private write(entry: GlyphAtlasEntry, data: Uint8Array): void {
    for (let y = 0; y < entry.height; y += 1) this.pixels.set(data.subarray(y * entry.width, (y + 1) * entry.width), (entry.y + y) * this.width + entry.x);
    const prior = this.dirty;
    this.dirty = { x: Math.min(prior?.x ?? entry.x, entry.x), y: Math.min(prior?.y ?? entry.y, entry.y),
      right: Math.max(prior?.right ?? 0, entry.x + entry.width), bottom: Math.max(prior?.bottom ?? 0, entry.y + entry.height) };
  }
}

function validateBitmap(bitmap: GlyphBitmap): void {
  if (!bitmap || !Number.isInteger(bitmap.width) || !Number.isInteger(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0 ||
      !(bitmap.data instanceof Uint8Array) || bitmap.data.length !== bitmap.width * bitmap.height) {
    throw new Error("Aura3D glyph bitmap dimensions and byte length must agree.");
  }
  if (typeof SharedArrayBuffer !== "undefined" && bitmap.data.buffer instanceof SharedArrayBuffer) {
    throw new Error("Aura3D glyph bitmaps cannot use mutable shared memory.");
  }
}
