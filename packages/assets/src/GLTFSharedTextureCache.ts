import type { Texture } from "@aura3d/rendering";

/**
 * SA-04 (lane L8) — shared GPU-texture ownership for skinned clones.
 *
 * `GLTFAssetParseCache` already shares parsed `GLTFAsset` data across clones,
 * but `createGLTFRenderResources` deliberately rebuilt every `Texture` per
 * pipeline: N clones of the same GLB decoded and uploaded the same image N
 * times. `cloneSkinned`/`characters.clone` hands each clone's resource build a
 * lease on one `GLTFSharedTextureCache` instead, keyed by
 * `imageIndex:colorSpace`, so the first clone decodes+uploads each texture and
 * the rest reuse the identical `Texture` object (renderer caches GPU uploads
 * by texture identity, so bytes stay flat as clone count grows).
 *
 * Ownership is reference-counted: `acquire()` pins the cache, `release()` drops
 * one pin; the underlying textures are disposed only when the last lease goes
 * away, so disposing a single clone never kills textures still in use by its
 * siblings.
 */

export interface GLTFSharedTextureLease {
  /**
   * Returns the shared texture for `key`, running `create` exactly once across
   * all leases (in-flight creations are coalesced on the same promise).
   */
  getOrCreate(key: string, create: () => Promise<Texture>): Promise<Texture>;
  /** Number of shared entries currently held (diagnostics/tests). */
  readonly size: number;
  release(): void;
}

export class GLTFSharedTextureCache {
  private readonly entries = new Map<string, Promise<Texture>>();
  private refs = 0;
  private disposed = false;

  acquire(): GLTFSharedTextureLease {
    if (this.disposed) {
      throw new Error("GLTFSharedTextureCache: cannot acquire a disposed cache.");
    }
    this.refs++;
    let released = false;
    const cache = this;
    return {
      get size() {
        return cache.entries.size;
      },
      getOrCreate: (key, create) => {
        if (released) {
          throw new Error("GLTFSharedTextureCache: lease has been released.");
        }
        const existing = cache.entries.get(key);
        if (existing) {
          return existing;
        }
        const created = create();
        cache.entries.set(key, created);
        created.catch(() => {
          // Do not pin a rejected decode: a later lease retries the factory.
          if (cache.entries.get(key) === created) {
            cache.entries.delete(key);
          }
        });
        return created;
      },
      release: () => {
        if (released) {
          return;
        }
        released = true;
        cache.refs--;
        if (cache.refs <= 0) {
          cache.disposeEntries();
        }
      }
    };
  }

  /** Current pin count (diagnostics/tests). */
  get refCount(): number {
    return this.refs;
  }

  /** Shared entry count across all leases. */
  get size(): number {
    return this.entries.size;
  }

  private disposeEntries(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) {
      entry.then((texture) => texture.dispose()).catch(() => {
        // Rejected entries were already evicted by getOrCreate; nothing to free.
      });
    }
  }
}
