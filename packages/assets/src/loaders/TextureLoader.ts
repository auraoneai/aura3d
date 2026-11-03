/**
 * threejs-parity ST-04/ST-07 (§6 lane L4): `THREE.TextureLoader`.
 *
 * `load(url, onLoad?, onProgress?, onError?)` and `loadAsync(...)` both decode
 * through the native texture/image loaders and return an owned acquisition.
 * Every successful acquisition must be released or disposed with its loader.
 */

import { AssetManager } from "../AssetManager";
import type { AssetRequestOptions } from "../AssetLoader";
import { ImageLoader } from "../ImageLoader";
import { TextureLoader as NativeTextureLoader, type TextureDescriptorAsset } from "../TextureLoader";
import type { AuraLoaderProgress } from "../LoaderFetch";

export type ThreeCompatBrowserTextureFormat = "png" | "jpg" | "jpeg" | "webp" | "gif" | "avif";

/** One acquisition of a decoded texture. Release it when it is no longer used. */
export interface OwnedTextureDescriptorAsset extends TextureDescriptorAsset {
  readonly released: boolean;
  release(): Promise<void>;
}

export interface TextureLoadOptions extends AssetRequestOptions {
  readonly signal?: AbortSignal;
}

let sharedManager: AssetManager | undefined;

function defaultManager(): AssetManager {
  if (!sharedManager) {
    sharedManager = new AssetManager();
    sharedManager.register(new ImageLoader());
    sharedManager.register(new NativeTextureLoader());
  }
  return sharedManager;
}

export class TextureLoaderThreeCompat {
  /** Recognized image containers; individual codec availability is browser-dependent. */
  readonly supportedFormats: readonly ThreeCompatBrowserTextureFormat[] = ["png", "jpg", "jpeg", "webp", "gif", "avif"];
  private readonly manager?: AssetManager;
  private readonly controllers = new Set<AbortController>();
  private readonly pending = new Set<Promise<OwnedTextureDescriptorAsset>>();
  private readonly releases = new Set<() => Promise<void>>();
  private closed = false;
  private disposal?: Promise<void>;

  constructor(manager?: AssetManager) {
    this.manager = manager;
  }

  /**
   * Load an image-backed texture; the optional callbacks observe the same
   * operation returned by the promise. A bare call also performs a real load.
   */
  load(
    uri: string,
    onLoad?: (texture: OwnedTextureDescriptorAsset) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void,
    options: TextureLoadOptions = {}
  ): Promise<OwnedTextureDescriptorAsset> {
    const pending = this.loadAsync(uri, onProgress, options).then(async (texture) => {
      try {
        onLoad?.(texture);
        return texture;
      } catch (error) {
        await texture.release();
        throw error;
      }
    });
    if (onError) void pending.catch((error) => { try { onError(error); } catch { /* Error observers do not own the load. */ } });
    return pending;
  }

  /** Real async decode through the native texture loader chain. */
  loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void, options: TextureLoadOptions = {}): Promise<OwnedTextureDescriptorAsset> {
    if (this.closed) return Promise.reject(new Error("Texture loader has been disposed"));
    const pending = this.acquire(url, onProgress, options);
    this.pending.add(pending);
    void pending.then(() => this.pending.delete(pending), () => this.pending.delete(pending));
    return pending;
  }

  /** Abort outstanding loads and release every acquisition owned by this loader. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    this.disposal = (async () => {
      await Promise.allSettled([...this.pending]);
      const results = await Promise.allSettled([...this.releases].map((release) => release()));
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
      if (errors.length) throw new AggregateError(errors, "Texture loader disposal failed");
    })();
    return this.disposal;
  }

  private async acquire(url: string, onProgress: ((progress: AuraLoaderProgress) => void) | undefined, options: TextureLoadOptions): Promise<OwnedTextureDescriptorAsset> {
    const manager = this.manager ?? defaultManager();
    const controller = new AbortController();
    this.controllers.add(controller);
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const handle = await manager.load<TextureDescriptorAsset>(url, {
        ...options,
        type: "texture",
        signal: controller.signal,
        onProgress: onProgress
          ? (event) => onProgress({ loaded: event.loadedBytes, ...(event.totalBytes !== undefined ? { total: event.totalBytes } : {}) })
          : undefined
      });
      if (this.closed) {
        await handle.release();
        throw new Error("Texture loader has been disposed");
      }
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        this.releases.delete(release);
        await handle.release();
      };
      this.releases.add(release);
      return { ...handle.value, get released() { return released; }, release };
    } finally {
      options.signal?.removeEventListener("abort", abort);
      this.controllers.delete(controller);
    }
  }
}
