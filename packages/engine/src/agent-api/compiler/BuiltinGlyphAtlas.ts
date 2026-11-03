import {
  GlyphAtlas,
  SDF_SUPPORTED_GLYPHS,
  Sampler,
  Texture,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
  type GlyphAtlasEntry,
  type GlyphBitmap,
  type SdfFontAtlas,
  type SdfGlyphMetrics,
  type SdfTextRasterImage
} from "@aura3d/rendering";
import type { ProductionRuntimePrimitiveResource } from "../nodes/types.js";

const ATLAS_SIZE = 512;
const TEXELS_PER_WORLD_UNIT = 64;
const DEFAULT_SOURCE_WIDTH = 392;
const DEFAULT_SOURCE_HEIGHT = 432;
// Matching full-label rasters is safe even for platform-shaped text: the
// comparison is on the final pixels, never on individual characters.
const MAX_RETAINED_LABELS = SDF_SUPPORTED_GLYPHS.length - 1;
const MAX_RETAINED_LABEL_BYTES = ATLAS_SIZE * ATLAS_SIZE;

interface RetainedLabelBitmap {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly hash: number;
  readonly data: Uint8Array;
  refs: number;
  used: number;
}

interface BuiltinGlyphResourceOwner {
  resource: ProductionRuntimePrimitiveResource;
  sceneOwned: boolean;
  frameRefs: number;
  finalized: boolean;
  readonly dispose: (resource: ProductionRuntimePrimitiveResource) => void;
}

// LOD creation can copy the resource record but never its unique geometry.
const builtinGlyphResourceOwners = new WeakMap<ProductionRuntimePrimitiveResource["geometry"], BuiltinGlyphResourceOwner>();

/** Install one scene-owned atlas resource after its construction has succeeded. */
export function ownBuiltinGlyphResource(resource: ProductionRuntimePrimitiveResource, dispose: (resource: ProductionRuntimePrimitiveResource) => void): void {
  if (builtinGlyphResourceOwners.has(resource.geometry)) throw new Error("Aura3D built-in text resource already has an owner.");
  builtinGlyphResourceOwners.set(resource.geometry, { resource, sceneOwned: true, frameRefs: 0, finalized: false, dispose });
}

export function isBuiltinGlyphResource(resource: ProductionRuntimePrimitiveResource): boolean {
  return builtinGlyphResourceOwners.has(resource.geometry);
}

/** Retain a selected resource while a built frame or its consumers use it. */
export function retainBuiltinGlyphResource(resource: ProductionRuntimePrimitiveResource): (() => void) | undefined {
  const owner = builtinGlyphResourceOwners.get(resource.geometry);
  if (!owner || !owner.sceneOwned || owner.finalized) return undefined;
  owner.resource = resource;
  owner.frameRefs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owner.frameRefs -= 1;
    finishBuiltinGlyphResource(owner);
  };
}

/** Release the scene reference; true means this resource is atlas-managed. */
export function retireBuiltinGlyphResource(resource: ProductionRuntimePrimitiveResource): boolean {
  const owner = builtinGlyphResourceOwners.get(resource.geometry);
  if (!owner) return false;
  if (!owner.sceneOwned) return true;
  owner.resource = resource;
  owner.sceneOwned = false;
  finishBuiltinGlyphResource(owner);
  return true;
}

function finishBuiltinGlyphResource(owner: BuiltinGlyphResourceOwner): void {
  if (owner.sceneOwned || owner.frameRefs || owner.finalized) return;
  owner.finalized = true;
  owner.dispose(owner.resource);
}

/** A retained built-in glyph. UV and rect coordinates have a top-left origin. */
export interface BuiltinGlyphLease {
  readonly glyph: string;
  readonly rect: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly uv: readonly [number, number, number, number];
  /** Release this reference exactly once; repeated calls are harmless. */
  release(): void;
}

/**
 * Internal CPU-staged atlas scope. Treat texture and sampler as borrowed: only
 * the scope updates or disposes them. This does not allocate a device texture.
 */
export interface BuiltinGlyphAtlasScope {
  readonly texture: Texture;
  readonly sampler: Sampler;
  /** False once the scope is closed, including while leases are draining. */
  isOpen(): boolean;
  acquire(glyph: string): BuiltinGlyphLease;
  /** Try to retain a complete monochrome, already-shaped label snapshot. */
  tryAcquireLabel?(image: SdfTextRasterImage): BuiltinGlyphLease | undefined;
  /** Keep the scope alive for a frame-owned whole-label fallback. */
  hold?(): () => void;
  /** Stage coalesced changes for a future device upload; false means clean. */
  flush(): boolean;
  /** Close to new work and retire the texture when the last lease is released. */
  dispose(): void;
  /** Settle after close and the final lease release; this is not a GPU fence. */
  whenDisposed(): Promise<void>;
}

/**
 * Use the default built-in font source, not a loaded or platform-shaped font.
 * Its mutable arrays and glyph metadata are copied before any lazy raster work.
 */
export function createBuiltinGlyphAtlasScope(source: SdfFontAtlas): BuiltinGlyphAtlasScope {
  return new RetainedBuiltinGlyphAtlas(snapshotDefaultBuiltinAtlas(source));
}

class RetainedBuiltinGlyphAtlas implements BuiltinGlyphAtlasScope {
  readonly texture = new Texture({
    width: ATLAS_SIZE,
    height: ATLAS_SIZE,
    format: "rgba8",
    colorSpace: "srgb",
    label: "a3d-builtin-glyph-atlas",
    data: new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4),
    dynamic: true,
    mipLevelCount: 1,
    generateMipmaps: false,
    usage: ["sampled", "copy-dst"]
  });
  readonly sampler = new Sampler({
    minFilter: "linear",
    magFilter: "linear",
    addressU: "clamp-to-edge",
    addressV: "clamp-to-edge",
    maxAnisotropy: 1
  });

  private readonly atlas = new GlyphAtlas({
    width: ATLAS_SIZE,
    height: ATLAS_SIZE,
    maxEntries: MAX_RETAINED_LABELS,
    texture: {
      update: (region) => {
        const rgba = new Uint8Array(region.data.length * 4);
        for (let i = 0; i < region.data.length; i += 1) {
          const alpha = region.data[i]!;
          const offset = i * 4;
          const white = alpha === 0 ? 0 : 255;
          rgba[offset] = white;
          rgba[offset + 1] = white;
          rgba[offset + 2] = white;
          rgba[offset + 3] = alpha;
        }
        this.texture.update(rgba, { x: region.x, y: region.y, width: region.width, height: region.height });
      },
      dispose: () => this.texture.dispose()
    }
  });
  private readonly bitmaps = new Map<string, GlyphBitmap>();
  // The CPU cache is bounded separately from the atlas. An unretained bitmap
  // can remain cached even if the atlas evicts its rectangle; acquire() will
  // allocate and re-upload that same bitmap if it is requested again.
  private readonly labelBitmaps = new Map<string, RetainedLabelBitmap>();
  private labelBitmapBytes = 0;
  private labelClock = 0;
  private source: SdfFontAtlas | undefined;
  private leaseCount = 0;
  private nextLabelId = 0;
  private closed = false;
  private flushing = false;
  private finalized = false;
  private readonly disposal: Promise<void>;
  private resolveDisposal!: () => void;
  private rejectDisposal!: (error: unknown) => void;

  constructor(source: SdfFontAtlas) {
    this.source = source;
    this.disposal = new Promise<void>((resolve, reject) => {
      this.resolveDisposal = resolve;
      this.rejectDisposal = reject;
    });
    // Synchronous dispose callers may not request the completion promise.
    void this.disposal.catch(() => undefined);
  }

  isOpen(): boolean { return !this.closed && !this.texture.disposed; }

  acquire(glyph: string): BuiltinGlyphLease {
    this.assertOpen();
    // Layout handles whitespace and case; this helper receives drawable catalog
    // glyphs only. In particular, a space must not consume an atlas entry.
    if (typeof glyph !== "string" || glyph.length !== 1 || glyph === " " || !SDF_SUPPORTED_GLYPHS.includes(glyph)) {
      throw new Error("Aura3D built-in glyph atlas requires one drawable catalog glyph.");
    }
    let bitmap = this.bitmaps.get(glyph);
    if (!bitmap) {
      const source = this.source!;
      const image = rasterizeSdfTextLabelImage(layoutSdfText(glyph, source), source, {
        texelsPerWorldUnit: TEXELS_PER_WORLD_UNIT
      });
      const data = new Uint8Array(image.width * image.height);
      for (let i = 0; i < data.length; i += 1) data[i] = image.data[i * 4 + 3]!;
      bitmap = { width: image.width, height: image.height, data };
    }
    const entry = this.atlas.acquire(glyph, bitmap);
    this.bitmaps.set(glyph, bitmap);
    return this.retain(glyph, entry);
  }

  tryAcquireLabel(image: SdfTextRasterImage): BuiltinGlyphLease | undefined {
    this.assertOpen();
    const { width, height, data } = image;
    // A replicated edge preserves clamp-to-edge sampling of the original label;
    // the atlas also reserves a transparent gutter around that padded bitmap.
    // Reject if the bytes cannot be represented by alpha-only storage.
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > ATLAS_SIZE - 4 || height > ATLAS_SIZE - 4 || !(data instanceof Uint8Array) ||
        data.length !== width * height * 4 ||
        (typeof SharedArrayBuffer !== "undefined" && data.buffer instanceof SharedArrayBuffer)) return undefined;
    const paddedWidth = width + 2;
    const alpha = new Uint8Array(paddedWidth * (height + 2));
    for (let y = 0; y < height; y += 1) {
      const row = (y + 1) * paddedWidth;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const value = data[offset + 3]!;
        const white = value === 0 ? 0 : 255;
        if (data[offset] !== white || data[offset + 1] !== white || data[offset + 2] !== white) return undefined;
        alpha[row + x + 1] = value;
      }
      alpha[row] = alpha[row + 1]!;
      alpha[row + paddedWidth - 1] = alpha[row + paddedWidth - 2]!;
    }
    alpha.set(alpha.subarray(paddedWidth, paddedWidth * 2), 0);
    alpha.set(alpha.subarray(height * paddedWidth, (height + 1) * paddedWidth), (height + 1) * paddedWidth);
    const paddedHeight = height + 2;
    const hash = labelBitmapHash(alpha);
    let label: RetainedLabelBitmap | undefined;
    for (const candidate of this.labelBitmaps.values()) {
      if (candidate.width === paddedWidth && candidate.height === paddedHeight && candidate.hash === hash &&
          equalLabelPixels(candidate.data, alpha)) {
        label = candidate;
        break;
      }
    }
    if (!label) {
      const match = this.findLabelRegion(alpha, paddedWidth, paddedHeight);
      if (match) {
        const retained = match.label;
        const entry = this.atlas.acquire(retained.key, { width: retained.width, height: retained.height, data: retained.data });
        retained.refs += 1;
        retained.used = ++this.labelClock;
        return this.retain(retained.key, entry, 0, () => {
          retained.refs -= 1;
          retained.used = ++this.labelClock;
        }, { x: match.x + 1, y: match.y + 1, width, height });
      }
    }
    let evictions: RetainedLabelBitmap[] = [];
    if (!label) {
      const candidates = this.planLabelEvictions(alpha.length);
      if (this.nextLabelId >= Number.MAX_SAFE_INTEGER || !candidates) return undefined;
      evictions = candidates;
      label = { key: `label:${this.nextLabelId + 1}`, width: paddedWidth, height: paddedHeight, hash, data: alpha, refs: 0, used: 0 };
    }
    try {
      const atlasEntry = this.atlas.acquire(label.key, { width: paddedWidth, height: paddedHeight, data: label.data });
      if (!this.labelBitmaps.has(label.key)) {
        for (const candidate of evictions) {
          this.labelBitmaps.delete(candidate.key);
          this.labelBitmapBytes -= candidate.data.length;
        }
        this.nextLabelId += 1;
        this.labelBitmaps.set(label.key, label);
        this.labelBitmapBytes += label.data.length;
      }
      label.refs += 1;
      label.used = ++this.labelClock;
      const retained = label;
      return this.retain(label.key, atlasEntry, 1, () => {
        retained.refs -= 1;
        retained.used = ++this.labelClock;
      });
    } catch (error) {
      // A full retained atlas is an ordinary whole-label fallback condition.
      // Other failures must reach the caller so construction can roll back.
      if (error instanceof RangeError && error.message === "Aura3D glyph atlas is full; release retained glyphs before allocating more.") return undefined;
      throw error;
    }
  }

  hold(): () => void {
    this.assertOpen();
    this.leaseCount += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leaseCount -= 1;
      this.finishIfPossible();
    };
  }

  private findLabelRegion(data: Uint8Array, width: number, height: number): { label: RetainedLabelBitmap; x: number; y: number } | undefined {
    let anchor = 0;
    for (let index = 1; index < data.length; index += 1) if (data[index]! > data[anchor]!) anchor = index;
    const anchorX = anchor % width;
    const anchorY = Math.floor(anchor / width);
    let work = 0;
    const limit = ATLAS_SIZE * ATLAS_SIZE * 4;
    for (const label of this.labelBitmaps.values()) {
      if (label.width < width || label.height < height || (label.width === width && label.height === height) || !this.atlas.has(label.key)) continue;
      for (let y = 0; y <= label.height - height; y += 1) for (let x = 0; x <= label.width - width; x += 1) {
        if (++work > limit) return undefined;
        if (label.data[(y + anchorY) * label.width + x + anchorX] !== data[anchor]) continue;
        let equal = true;
        for (let row = 0; equal && row < height; row += 1) for (let column = 0; column < width; column += 1) {
          if (++work > limit) return undefined;
          if (label.data[(y + row) * label.width + x + column] !== data[row * width + column]) {
            equal = false;
            break;
          }
        }
        if (equal) return { label, x, y };
      }
    }
    return undefined;
  }

  private planLabelEvictions(bytes: number): RetainedLabelBitmap[] | undefined {
    const candidates = [...this.labelBitmaps.values()].filter((candidate) => candidate.refs === 0)
      .sort((left, right) => left.used - right.used);
    const evictions: RetainedLabelBitmap[] = [];
    let count = this.labelBitmaps.size;
    let total = this.labelBitmapBytes;
    while (count >= MAX_RETAINED_LABELS || total + bytes > MAX_RETAINED_LABEL_BYTES) {
      const candidate = candidates[evictions.length];
      if (!candidate) return undefined;
      evictions.push(candidate);
      count -= 1;
      total -= candidate.data.length;
    }
    return evictions;
  }

  private retain(
    glyph: string,
    entry: GlyphAtlasEntry,
    inset = 0,
    onRelease?: () => void,
    region?: Readonly<{ x: number; y: number; width: number; height: number }>
  ): BuiltinGlyphLease {
    this.leaseCount += 1;
    let released = false;
    const rect = Object.freeze(region
      ? { x: entry.x + region.x, y: entry.y + region.y, width: region.width, height: region.height }
      : { x: entry.x + inset, y: entry.y + inset, width: entry.width - inset * 2, height: entry.height - inset * 2 });
    const uv: readonly [number, number, number, number] = Object.freeze([
      rect.x / ATLAS_SIZE, rect.y / ATLAS_SIZE, (rect.x + rect.width) / ATLAS_SIZE, (rect.y + rect.height) / ATLAS_SIZE
    ] as [number, number, number, number]);
    return Object.freeze({
      glyph,
      rect,
      uv,
      release: () => {
        if (released) return;
        this.atlas.release(glyph);
        released = true;
        this.leaseCount -= 1;
        onRelease?.();
        this.finishIfPossible();
      }
    });
  }

  flush(): boolean {
    this.assertOpen();
    if (this.flushing) throw new Error("Aura3D built-in glyph atlas cannot flush recursively.");
    this.flushing = true;
    try {
      // GlyphAtlas restores the dirty rectangle if the synchronous update fails,
      // including any new dirt introduced during that update.
      return this.atlas.flush();
    } finally {
      this.flushing = false;
      this.finishIfPossible();
    }
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.finishIfPossible();
  }

  whenDisposed(): Promise<void> { return this.disposal; }

  private assertOpen(): void {
    if (!this.isOpen()) throw new Error("Aura3D built-in glyph atlas is closed.");
  }

  private finishIfPossible(): void {
    if (!this.closed || this.leaseCount !== 0 || this.flushing || this.finalized) return;
    this.finalized = true;
    this.source = undefined;
    this.bitmaps.clear();
    this.labelBitmaps.clear();
    this.labelBitmapBytes = 0;
    try {
      this.atlas.dispose();
      this.resolveDisposal();
    } catch (error) {
      this.rejectDisposal(error);
      throw error;
    }
  }
}

/** Fast rejection only: equal hashes must still compare every byte. */
function labelBitmapHash(data: Uint8Array): number {
  let hash = 2166136261;
  for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

function equalLabelPixels(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

/** Copy only the fixed default catalog; no arbitrary font, size or style keys. */
function snapshotDefaultBuiltinAtlas(source: SdfFontAtlas): SdfFontAtlas {
  if (!source || source.kind !== "aura-sdf-font-atlas" || source.cellResolution !== 8 || source.padding !== 8 ||
      source.width !== DEFAULT_SOURCE_WIDTH || source.height !== DEFAULT_SOURCE_HEIGHT ||
      source.glyphCount !== SDF_SUPPORTED_GLYPHS.length || source.spreadPixels !== Math.hypot(40, 56) / 2 ||
      !(source.distances instanceof Float32Array) || source.distances.length !== source.width * source.height ||
      !source.glyphs || Object.keys(source.glyphs).length !== SDF_SUPPORTED_GLYPHS.length) {
    throw new Error("Aura3D built-in glyph atlas requires the default built-in font atlas.");
  }
  const glyphs: Record<string, SdfGlyphMetrics> = Object.create(null);
  [...SDF_SUPPORTED_GLYPHS].forEach((glyph, index) => {
    const metrics = source.glyphs[glyph];
    const x = (index % 7) * 56 + 8;
    const y = Math.floor(index / 7) * 72 + 8;
    const uv: [number, number, number, number] = [x / source.width, y / source.height, (x + 40) / source.width, (y + 56) / source.height];
    if (!metrics || metrics.glyph !== glyph || metrics.advanceEm !== 5 / 7 || !metrics.uv || metrics.uv.length !== 4 ||
        uv.some((value, coordinate) => metrics.uv[coordinate] !== value)) {
      throw new Error("Aura3D built-in glyph atlas requires default catalog metrics.");
    }
    glyphs[glyph] = { glyph, uv, advanceEm: metrics.advanceEm };
  });
  const distances = source.distances.slice();
  if (distances.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("Aura3D built-in glyph atlas requires normalized distance data.");
  }
  return { ...source, glyphs, distances };
}
