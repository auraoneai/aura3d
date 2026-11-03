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
  /** Wait for final-lease cleanup; a call after rejection retries failed releases. */
  releaseAsync?(): Promise<void>;
}

export class GLTFSharedTextureCache {
  private readonly entries = new Map<string, Promise<Texture>>();
  private readonly retiring = new Set<Promise<Texture>>();
  private refs = 0;
  private disposed = false;
  private cleanup?: Promise<void>;
  private cleanupFailed = false;

  acquire(): GLTFSharedTextureLease & { releaseAsync(): Promise<void> } {
    if (this.disposed) {
      throw new Error("GLTFSharedTextureCache: cannot acquire a disposed cache.");
    }
    this.refs++;
    let released = false;
    let last = false;
    let observed = false;
    let observation: Promise<void> | undefined;
    const cache = this;
    const release = (): void => {
      if (released) return;
      released = true;
      cache.refs--;
      if (cache.refs === 0) {
        last = true;
        cache.disposeEntries();
      }
    };
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
      release,
      releaseAsync: () => {
        release();
        if (!last) return Promise.resolve();
        if (observation) return observation;
        const retry = observed;
        observed = true;
        const pending = cache.drainEntries(retry).finally(() => {
          if (observation === pending) observation = undefined;
        });
        observation = pending;
        return pending;
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
    for (const entry of this.entries.values()) this.retiring.add(entry);
    this.entries.clear();
    void this.drainEntries(false).catch(() => {});
  }

  private drainEntries(retry: boolean): Promise<void> {
    if (this.cleanup && (!this.cleanupFailed || !retry)) return this.cleanup;
    this.cleanupFailed = false;
    const attempt = Promise.allSettled([...this.retiring].map((entry) => entry.then(
      (texture) => {
        try {
          if (!texture.disposed) texture.dispose();
          if (!texture.disposed) throw new Error("glTF shared texture disposal is in progress");
          this.retiring.delete(entry);
        } catch (error) {
          try { if (texture.disposed) this.retiring.delete(entry); } catch { /* Retain an uncertain texture. */ }
          throw error;
        }
      },
      () => { this.retiring.delete(entry); }
    ))).then((results) => {
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
      if (errors.length) throw new AggregateError(errors, "glTF shared texture cleanup failed");
    });
    this.cleanup = attempt.then(
      () => {},
      (error: unknown) => { this.cleanupFailed = true; throw error; }
    );
    void this.cleanup.catch(() => {});
    return this.cleanup;
  }
}
