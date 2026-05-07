import { AssetHandle } from "./AssetHandle";

interface CacheEntry<T> {
  readonly handle: AssetHandle<T>;
  readonly promise?: Promise<AssetHandle<T>>;
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
    if (!entry) {
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

  setInFlight<T>(key: string, promise: Promise<AssetHandle<T>>): void {
    this.inFlight.set(key, promise as Promise<AssetHandle<unknown>>);
    promise
      .then((handle) => {
        this.entries.set(key, { handle: handle as unknown as AssetHandle<unknown> });
      })
      .catch(() => {
        // Failed loads are intentionally not cached; callers receive the original rejection.
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  keys(): readonly string[] {
    return [...new Set([...this.entries.keys(), ...this.inFlight.keys()])];
  }

  snapshot(): AssetCacheSnapshot {
    const keys = this.keys();
    return {
      cachedEntries: this.entries.size,
      inFlightEntries: this.inFlight.size,
      totalEntries: keys.length,
      keys
    };
  }
}
