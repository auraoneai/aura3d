import { AssetHandle } from "./AssetHandle";
import { redactAssetMessage } from "./AssetLoader";

interface CacheEntry<T> {
  readonly handle: AssetHandle<T>;
}

export interface AssetCacheSnapshot {
  readonly cachedEntries: number;
  readonly inFlightEntries: number;
  readonly totalEntries: number;
  readonly keys: readonly string[];
}

export class AssetCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<AssetHandle<unknown>>>();

  has(key: string): boolean {
    return this.entries.has(key) || this.inFlight.has(key);
  }

  get<T>(key: string): AssetHandle<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.handle.disposed) {
      if (entry) this.entries.delete(key);
      return undefined;
    }

    return entry.handle as AssetHandle<T>;
  }

  getInFlight<T>(key: string): Promise<AssetHandle<T>> | undefined {
    return this.inFlight.get(key) as Promise<AssetHandle<T>> | undefined;
  }

  set<T>(key: string, handle: AssetHandle<T>): void {
    this.entries.set(key, { handle: handle as unknown as AssetHandle<unknown> });
  }

  setInFlight<T>(key: string, promise: Promise<AssetHandle<T>>, options: { readonly cacheResolved?: boolean } = {}): void {
    this.inFlight.set(key, promise as Promise<AssetHandle<unknown>>);
    promise
      .then((handle) => {
        // A cleared or replaced generation must never repopulate the cache.
        if (this.inFlight.get(key) !== promise) return;
        if (options.cacheResolved === false) return;
        this.inFlight.delete(key);
        if (!handle.disposed) this.set(key, handle);
      }, () => {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
      });
  }

  deleteInFlight<T>(key: string, expected?: Promise<AssetHandle<T>>): boolean {
    if (expected && this.inFlight.get(key) !== expected) return false;
    return this.inFlight.delete(key);
  }

  deleteHandle<T>(key: string, expected: AssetHandle<T>): boolean {
    if (this.entries.get(key)?.handle !== expected) return false;
    return this.entries.delete(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /** Operational keys are caller-supplied; use the redacted snapshot for diagnostics. */
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
