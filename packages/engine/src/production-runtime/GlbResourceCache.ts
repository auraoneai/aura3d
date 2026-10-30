/**
 * GU47 E-H (WP-8) — GLB resource cache across `app.setScene`.
 *
 * `setScene` disposes the renderer and every typed GLB actor before the next scene mounts. The
 * parsed-GLB cache in `@aura3d/assets` (`GLTFAssetParseCache`) and the decoded-texture share
 * (`actor/ModelTextureShare`) are reference counted, so the last actor of an asset dropping its
 * lease evicts the parse and the textures, and a scene that mounts the same assets again fetches,
 * parses and decodes every GLB a second time.
 *
 * This cache keeps, per asset key, the parse lease of the last disposed actor of that asset (its
 * render resources and textures are freed at once, as before). The next actor of the same asset
 * finds the parse still referenced, so it loads with 0 GLB fetches and 0 parses, and then hands
 * the kept lease back (`consume`), so at most one kept lease exists per asset and none while an
 * actor of that asset is live. Memory held is the parsed GLB (about its file size), which is what
 * `bytes` charges.
 *
 * Keys: the asset content hash (typed asset tables carry one), the URL and every decode option by
 * value (see `glbResourceCacheKey`), so different decode settings never alias.
 * Bounds: `maxEntries` and `maxBytes` (least recently kept evicted first); an entry is disposed
 * exactly once, on eviction, `consume`, `release` or `clear`.
 */

export interface GlbResourceCacheEntry {
  /** Bytes the entry is charged against `maxBytes` (file size when known, else an estimate). */
  readonly bytes: number;
  /**
   * True when the GLB uses no draco / meshopt / KTX2 compression, so a re-mount can skip the
   * decoder pre-scan fetch (its only job is to require decoders).
   */
  readonly uncompressed: boolean;
  /** Disposes the kept resources. Called exactly once by the cache. */
  dispose(): void;
}

export interface GlbResourceCacheOptions {
  /** Kept assets at most (0 disables the cache). */
  readonly maxEntries?: number;
  /** Charged bytes at most across kept assets. */
  readonly maxBytes?: number;
}

export interface GlbResourceCacheSnapshot {
  readonly kind: "aura-glb-resource-cache";
  readonly entries: number;
  readonly bytes: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
  /** Actor loads that found their asset kept (no fetch, no decode). */
  readonly hits: number;
  /** Actor loads that found nothing kept. */
  readonly misses: number;
  /** Disposed actors whose resources were kept. */
  readonly kept: number;
  /** Kept entries disposed to stay inside the bounds. */
  readonly evicted: number;
  readonly keys: readonly string[];
}

/** Defaults: generous for a game's own asset set, small next to a phone's memory. */
export const GLB_RESOURCE_CACHE_DEFAULTS: Required<GlbResourceCacheOptions> = Object.freeze({
  maxEntries: 32,
  maxBytes: 160 * 1024 * 1024
});

export class GlbResourceCache {
  /** Insertion order = recency (oldest first). */
  private readonly entries = new Map<string, GlbResourceCacheEntry>();
  private maxEntries: number;
  private maxBytes: number;
  private chargedBytes = 0;
  private hits = 0;
  private misses = 0;
  private keptCount = 0;
  private evictedCount = 0;

  constructor(options: GlbResourceCacheOptions = {}) {
    this.maxEntries = sanitizeLimit(options.maxEntries, GLB_RESOURCE_CACHE_DEFAULTS.maxEntries);
    this.maxBytes = sanitizeLimit(options.maxBytes, GLB_RESOURCE_CACHE_DEFAULTS.maxBytes);
  }

  get enabled(): boolean {
    return this.maxEntries > 0 && this.maxBytes > 0;
  }

  /** Change the bounds; shrinking evicts at once. */
  configure(options: GlbResourceCacheOptions): void {
    if (options.maxEntries !== undefined) this.maxEntries = sanitizeLimit(options.maxEntries, this.maxEntries);
    if (options.maxBytes !== undefined) this.maxBytes = sanitizeLimit(options.maxBytes, this.maxBytes);
    this.evictToBounds();
  }

  /** The kept entry for `key` without changing recency or counters. */
  peek(key: string): GlbResourceCacheEntry | undefined {
    return this.entries.get(key);
  }

  /** Records whether an actor load found its asset kept. */
  noteLoad(key: string): boolean {
    const hit = this.entries.has(key);
    if (hit) this.hits += 1;
    else this.misses += 1;
    return hit;
  }

  /**
   * Keep a disposed actor's resources. Returns false when the caller must dispose them itself:
   * the cache is off, the asset is already kept, or the entry alone exceeds `maxBytes`.
   */
  keep(key: string, entry: GlbResourceCacheEntry): boolean {
    if (!this.enabled || this.entries.has(key)) return false;
    const bytes = Math.max(0, Number.isFinite(entry.bytes) ? entry.bytes : 0);
    if (bytes > this.maxBytes) return false;
    this.entries.set(key, entry);
    this.chargedBytes += bytes;
    this.keptCount += 1;
    this.evictToBounds(key);
    return this.entries.has(key);
  }

  /**
   * Dispose the kept entry for `key` once a new actor of that asset holds its own parse and
   * texture leases (the kept copy is no longer needed to bridge the remount).
   */
  consume(key: string): boolean {
    return this.release(key);
  }

  /** Dispose and forget one kept entry. */
  release(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    this.entries.delete(key);
    this.chargedBytes -= Math.max(0, Number.isFinite(entry.bytes) ? entry.bytes : 0);
    disposeQuietly(entry);
    return true;
  }

  /** Dispose every kept entry (app teardown, memory pressure, tests). */
  clear(): void {
    for (const key of [...this.entries.keys()]) this.release(key);
    this.chargedBytes = 0;
  }

  /** Zero the counters (tests). */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.keptCount = 0;
    this.evictedCount = 0;
  }

  snapshot(): GlbResourceCacheSnapshot {
    return {
      kind: "aura-glb-resource-cache",
      entries: this.entries.size,
      bytes: this.chargedBytes,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
      kept: this.keptCount,
      evicted: this.evictedCount,
      keys: [...this.entries.keys()]
    };
  }

  private withinBounds(): boolean {
    return this.entries.size <= this.maxEntries && this.chargedBytes <= this.maxBytes;
  }

  /** Evict least recently kept entries first; `protect` (the entry just kept) goes last. */
  private evictToBounds(protect?: string): void {
    for (const key of [...this.entries.keys()]) {
      if (this.withinBounds()) return;
      if (key === protect) continue;
      this.release(key);
      this.evictedCount += 1;
    }
    if (!this.withinBounds() && protect !== undefined && this.release(protect)) this.evictedCount += 1;
  }
}

function sanitizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function disposeQuietly(entry: GlbResourceCacheEntry): void {
  try {
    entry.dispose();
  } catch (error) {
    if (typeof console !== "undefined") console.warn(`[aura3d] GLB resource cache: disposing a kept asset failed: ${String(error)}`);
  }
}

/**
 * The process-wide cache every typed GLB actor uses, on by default (GU47 E-H: a second `setScene`
 * with the same assets makes 0 GLB fetches). `configureGlbResourceCache({ maxEntries: 0 })` turns
 * it off.
 */
export const glbResourceCache = new GlbResourceCache(GLB_RESOURCE_CACHE_DEFAULTS);

/** Tune the cache bounds (`{ maxEntries: 0 }` turns it off and disposes what it kept). */
export function configureGlbResourceCache(options: GlbResourceCacheOptions): void {
  glbResourceCache.configure(options);
}

/** Dispose everything the cache kept (call after the last scene of an app is gone). */
export function clearGlbResourceCache(): void {
  glbResourceCache.clear();
}

/** Diagnostics: entries, bytes, hits / misses and evictions. */
export function glbResourceCacheSnapshot(): GlbResourceCacheSnapshot {
  return glbResourceCache.snapshot();
}

/**
 * Cache key for an actor's asset: the content hash, the URL and every decode input, by value.
 * Plain-object options (`decoders`, texture capabilities) are serialised rather than keyed by
 * identity because the renderer builds a fresh `decoders` object per mount, so identity keys
 * would never match across `setScene`. Functions and class instances (an image decoder) keep an
 * identity token.
 */
export function glbResourceCacheKey(options: {
  readonly asset: { readonly url: string; readonly hash?: string };
  readonly maxTextureSize?: number;
  readonly textureBudget?: number;
  readonly imageDecoder?: unknown;
  readonly decoders?: unknown;
  readonly compressedTextureCapabilities?: unknown;
}): string {
  return [
    options.asset.hash ?? "-",
    options.asset.url,
    valueToken(options.maxTextureSize),
    valueToken(options.textureBudget),
    valueToken(options.imageDecoder),
    valueToken(options.decoders),
    valueToken(options.compressedTextureCapabilities)
  ].join("|");
}

const identityTokens = new WeakMap<object, number>();
let nextIdentityToken = 1;

function valueToken(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value !== "object" && typeof value !== "function") return String(value);
  if (typeof value === "object" && isPlainData(value)) return JSON.stringify(sortKeys(value));
  let token = identityTokens.get(value as object);
  if (token === undefined) {
    token = nextIdentityToken++;
    identityTokens.set(value as object, token);
  }
  return `#${token}`;
}

function isPlainData(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null && !Array.isArray(value)) return false;
  return Object.values(value).every((entry) =>
    entry === null || ["string", "number", "boolean", "undefined"].includes(typeof entry) || (typeof entry === "object" && isPlainData(entry as object))
  );
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

/**
 * Charged size of a kept GLB: the manifest file size when the asset table has one, else an
 * estimate from the loader's counts (vertex attributes, indices, and 4 MiB per decoded image).
 */
export function estimateGlbResourceBytes(
  sizeBytes: number | undefined,
  diagnostics: { readonly vertexCount: number; readonly indexCount: number; readonly imageCount: number } | undefined
): number {
  if (sizeBytes !== undefined && Number.isFinite(sizeBytes) && sizeBytes > 0) return sizeBytes;
  if (diagnostics === undefined) return 0;
  return diagnostics.vertexCount * 48 + diagnostics.indexCount * 4 + diagnostics.imageCount * 4 * 1024 * 1024;
}
