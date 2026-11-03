import { AssetHandle } from "./AssetHandle";
import { redactAssetMessage, requestIdentityDetails, type AssetRequestOptions } from "./AssetLoader";

/**
 * Module-private issuer used by AssetManager, whose keys are already derived
 * from the effective request identity. Not exported from the package entry.
 * @internal
 */
export const issueAssetCacheKey: unique symbol = Symbol("AssetCache.issueKey");
/** @internal Retire an owner-issued key once the owner has no entry or flight for it. */
export const retireAssetCacheKey: unique symbol = Symbol("AssetCache.retireKey");

/** Thrown when a raw cache operation uses a key the cache did not issue. */
export class AssetCacheKeyError extends TypeError {
  readonly code = "ASSET_CACHE_KEY_UNISSUED" as const;
  constructor() {
    // Never echo the caller key: raw keys are frequently URLs with credentials.
    super("ASSET_CACHE_KEY_UNISSUED: AssetCache keys must come from AssetCache.keyFor(url, requestOptions)");
    this.name = "AssetCacheKeyError";
  }
}

interface CacheEntry<T> {
  readonly handle: AssetHandle<T>;
}

export interface AssetCacheSnapshot {
  readonly cachedEntries: number;
  readonly inFlightEntries: number;
  readonly totalEntries: number;
  readonly keys: readonly string[];
}

/**
 * Handle cache partitioned by effective request context. Keys are opaque and
 * must be issued by {@link AssetCache.keyFor}, which hashes the resolved URL
 * together with credentials, headers, security context, integrity and limits;
 * arbitrary caller strings (for example a bare URL shared by two
 * authentication contexts) are rejected so two contexts cannot alias.
 */
export class AssetCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<AssetHandle<unknown>>>();
  private readonly issued = new Set<string>();
  /** Keys that never permit sharing; forgotten once their entry is gone. */
  private readonly unshared = new Set<string>();

  /**
   * Issue the cache key for an effective request context. Requests whose
   * context cannot be shared safely (ambient credentials without an explicit
   * `securityContext`, or no secure hashing) receive a unique key, so they never
   * reuse another caller's entry.
   */
  async keyFor(url: string, options: AssetRequestOptions = {}): Promise<string> {
    if (typeof url !== "string" || !url) throw new TypeError("AssetCache.keyFor requires a resolved asset URL");
    const identity = await requestIdentityDetails(options, url);
    this.issued.add(identity.key);
    if (!identity.reusable) this.unshared.add(identity.key);
    return identity.key;
  }

  /** @internal Admit a key already derived from an effective request identity. */
  [issueAssetCacheKey](key: string): string {
    this.issued.add(key);
    return key;
  }

  /** @internal */
  [retireAssetCacheKey](key: string): void {
    if (this.entries.has(key) || this.inFlight.has(key)) return;
    this.issued.delete(key);
    this.unshared.delete(key);
  }

  private checked(key: string): string {
    if (typeof key !== "string" || !this.issued.has(key)) throw new AssetCacheKeyError();
    return key;
  }

  private forgetIfUnused(key: string): void {
    if (this.entries.has(key) || this.inFlight.has(key)) return;
    if (this.unshared.delete(key)) this.issued.delete(key);
  }

  has(key: string): boolean {
    if (!this.issued.has(key)) return false;
    return this.entries.has(key) || this.inFlight.has(key);
  }

  get<T>(key: string): AssetHandle<T> | undefined {
    this.checked(key);
    const entry = this.entries.get(key);
    if (!entry || entry.handle.disposed) {
      if (entry) {
        this.entries.delete(key);
        this.forgetIfUnused(key);
      }
      return undefined;
    }

    return entry.handle as AssetHandle<T>;
  }

  getInFlight<T>(key: string): Promise<AssetHandle<T>> | undefined {
    this.checked(key);
    return this.inFlight.get(key) as Promise<AssetHandle<T>> | undefined;
  }

  set<T>(key: string, handle: AssetHandle<T>): void {
    this.checked(key);
    this.entries.set(key, { handle: handle as unknown as AssetHandle<unknown> });
  }

  setInFlight<T>(key: string, promise: Promise<AssetHandle<T>>, options: { readonly cacheResolved?: boolean } = {}): void {
    this.checked(key);
    this.inFlight.set(key, promise as Promise<AssetHandle<unknown>>);
    promise
      .then((handle) => {
        // A cleared or replaced generation must never repopulate the cache.
        if (this.inFlight.get(key) !== promise) return;
        if (options.cacheResolved === false) return;
        this.inFlight.delete(key);
        if (!handle.disposed && this.issued.has(key)) this.set(key, handle);
        this.forgetIfUnused(key);
      }, () => {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
        this.forgetIfUnused(key);
      });
  }

  deleteInFlight<T>(key: string, expected?: Promise<AssetHandle<T>>): boolean {
    if (!this.issued.has(key)) return false;
    if (expected && this.inFlight.get(key) !== expected) return false;
    const deleted = this.inFlight.delete(key);
    this.forgetIfUnused(key);
    return deleted;
  }

  deleteHandle<T>(key: string, expected: AssetHandle<T>): boolean {
    if (this.entries.get(key)?.handle !== expected) return false;
    const deleted = this.entries.delete(key);
    this.forgetIfUnused(key);
    return deleted;
  }

  delete(key: string): boolean {
    const deleted = this.entries.delete(key);
    this.forgetIfUnused(key);
    return deleted;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    for (const key of this.unshared) this.issued.delete(key);
    this.unshared.clear();
  }

  /** Operational keys are opaque issued identities; use the redacted snapshot for diagnostics. */
  keys(): readonly string[] {
    return [...new Set([...this.entries.keys(), ...this.inFlight.keys()])];
  }

  snapshot(): AssetCacheSnapshot {
    const keys = this.keys();
    return {
      cachedEntries: this.entries.size,
      inFlightEntries: this.inFlight.size,
      totalEntries: keys.length,
      keys: keys.map((key) => redactAssetMessage(key, key))
    };
  }
}
