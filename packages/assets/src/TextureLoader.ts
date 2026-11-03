import { AssetLoadError, mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import type { ImageAsset } from "./ImageLoader";
import type { AssetHandle } from "./AssetHandle";

export interface TextureDescriptorAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
  readonly source: ImageAsset["source"];
}

export class TextureLoader implements AssetLoader<TextureDescriptorAsset> {
  readonly type = "texture";
  private readonly detachedImages = new WeakMap<TextureDescriptorAsset, AssetHandle<ImageAsset>>();

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === this.type && (/\.(?:png|jpg|jpeg|webp|gif|avif)(?:[?#].*)?$/i.test(request.url) || request.url.startsWith("data:image/"));
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<TextureDescriptorAsset> {
    const signal = context.signalFor(request.signal);
    const image = await context.loadDependency<ImageAsset>(request.url, "image", {
      ...mergeAssetRequestOptions(context.requestOptionsFor(request.url), request),
      format: request.format,
      signal,
      ...(request.onProgress ? { onProgress: request.onProgress } : {})
    });
    try {
      if (signal?.aborted) throw new AssetLoadError("Asset load aborted", request.url, context.dependencyChain, signal.reason);
      context.throwIfAborted(request.url);
      const texture: TextureDescriptorAsset = {
        url: request.url,
        width: image.value.width,
        height: image.value.height,
        colorSpace: "srgb",
        source: image.value.source
      };
      // When invoked directly, the loader has no enclosing handle to own the
      // image. Keep that acquisition until dispose(texture); a manager-owned
      // context instead transfers it to the manager's dependency graph.
      if (!context.tracksDependencies) this.detachedImages.set(texture, image);
      return texture;
    } catch (error) {
      if (!context.tracksDependencies) await image.release();
      throw error;
    }
  }

  async dispose(texture: TextureDescriptorAsset): Promise<void> {
    const image = this.detachedImages.get(texture);
    if (!image) return;
    this.detachedImages.delete(texture);
    await image.release();
  }
}
