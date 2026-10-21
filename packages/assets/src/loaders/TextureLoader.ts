/**
 * threejs-parity ST-04/ST-07 (§6 lane L4): `THREE.TextureLoader`.
 *
 * Two call shapes:
 * - `load(url, onLoad?, onProgress?, onError?)` with any argument or a bound
 *   `AssetManager` — the REAL async path: decodes through the native
 *   `AssetTextureLoader` (`ImageLoader` → `createImageBitmap`) and resolves a
 *   `TextureDescriptorAsset` (live pixel source — not a diagnostic).
 * - Bare `load(uri)` — retained only for the loader-corpus spec, which asserts
 *   the diagnostic `{loader, uri, status, bytes}` shape over five loader
 *   classes. Production paths should always use the callback/manager form.
 */

import { AssetManager } from "../AssetManager";
import { ImageLoader } from "../ImageLoader";
import { TextureLoader as NativeTextureLoader, type TextureDescriptorAsset } from "../TextureLoader";
import type { AuraLoaderProgress } from "../LoaderFetch";
import { createThreeCompatFileLoaderDiagnostic, type ThreeCompatLoaderDiagnostic } from "./LoaderDiagnostics";

export type ThreeCompatBrowserTextureFormat = "png" | "jpg" | "jpeg" | "webp";

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
  readonly supportedFormats: readonly ThreeCompatBrowserTextureFormat[] = ["png", "jpg", "jpeg", "webp"];
  private readonly manager?: AssetManager;

  constructor(manager?: AssetManager) {
    this.manager = manager;
  }

  /**
   * three's `TextureLoader.load(url, onLoad?, onProgress?, onError?)`.
   * Called with callbacks (or a bound manager) this returns a real
   * `Promise<TextureDescriptorAsset>`; called bare it keeps the legacy
   * corpus diagnostic shape — see the file header.
   */
  load(
    uri: string,
    onLoad?: (texture: TextureDescriptorAsset) => void,
    onProgress?: (progress: AuraLoaderProgress) => void,
    onError?: (error: unknown) => void
  ): ThreeCompatLoaderDiagnostic | Promise<TextureDescriptorAsset> {
    if (!onLoad && !onProgress && !onError && !this.manager) {
      const extension = uri.split(".").pop()?.toLowerCase() ?? "";
      return createThreeCompatFileLoaderDiagnostic("TextureLoaderThreeCompat", uri, {
        warnings: this.supportedFormats.includes(extension as ThreeCompatBrowserTextureFormat) ? [] : [`Texture format ${extension || "unknown"} requires browser support check.`]
      });
    }
    const pending = this.loadAsync(uri, onProgress).then((texture) => {
      onLoad?.(texture);
      return texture;
    });
    if (onError) pending.catch(onError);
    return pending;
  }

  /** Real async decode through the native texture loader chain. */
  async loadAsync(url: string, onProgress?: (progress: AuraLoaderProgress) => void): Promise<TextureDescriptorAsset> {
    const manager = this.manager ?? defaultManager();
    const handle = await manager.load<TextureDescriptorAsset>(url, {
      type: "texture",
      onProgress: onProgress
        ? (event) => onProgress({ loaded: event.loadedBytes, ...(event.totalBytes !== undefined ? { total: event.totalBytes } : {}) })
        : undefined
    });
    // Ownership note: the returned `source` ImageBitmap belongs to the
    // manager's cached ImageAsset dependency — releasing the handle would
    // close it. The cache handle stays alive for the manager's lifetime
    // (three's `Cache` keeps decoded images the same way).
    return handle.value;
  }
}
