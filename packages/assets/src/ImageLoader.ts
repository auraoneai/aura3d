import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";

export interface ImageAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly source: ImageBitmap | HTMLImageElement;
}

export class ImageLoader implements AssetLoader<ImageAsset> {
  readonly type = "image";

  canLoad(request: AssetLoadRequest): boolean {
    return /\.(?:png|jpg|jpeg|webp|gif|avif)(?:\?.*)?$/i.test(request.url) || request.url.startsWith("data:image/");
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<ImageAsset> {
    context.throwIfAborted(request.url);

    if (typeof createImageBitmap === "function" && typeof fetch === "function") {
      const response = await fetch(request.url, { signal: request.signal });
      if (!response.ok) {
        throw new Error(`Image request failed with ${response.status}`);
      }

      const bitmap = await createImageBitmap(await response.blob());
      return { url: request.url, width: bitmap.width, height: bitmap.height, source: bitmap };
    }

    const ImageCtor = globalThis.Image;
    if (!ImageCtor) {
      throw new Error("Image loading requires createImageBitmap or HTMLImageElement");
    }

    return new Promise<ImageAsset>((resolve, reject) => {
      const image = new ImageCtor();
      image.onload = () => resolve({ url: request.url, width: image.width, height: image.height, source: image });
      image.onerror = () => reject(new Error(`Image decode failed for ${request.url}`));
      request.signal?.addEventListener("abort", () => reject(new Error(`Image load aborted for ${request.url}`)), {
        once: true
      });
      image.src = request.url;
    });
  }

  dispose(asset: ImageAsset): void {
    if ("close" in asset.source && typeof asset.source.close === "function") {
      asset.source.close();
    }
  }
}
