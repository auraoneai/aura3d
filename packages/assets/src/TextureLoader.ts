import type { AssetLoadRequest, AssetLoader } from "./AssetLoader";
import type { LoadContext } from "./LoadContext";
import type { ImageAsset } from "./ImageLoader";

export interface TextureDescriptorAsset {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
  readonly source: ImageAsset["source"];
}

export class TextureLoader implements AssetLoader<TextureDescriptorAsset> {
  readonly type = "texture";

  canLoad(request: AssetLoadRequest): boolean {
    return request.type === this.type && (/\.(?:png|jpg|jpeg|webp|avif)(?:\?.*)?$/i.test(request.url) || request.url.startsWith("data:image/"));
  }

  async load(request: AssetLoadRequest, context: LoadContext): Promise<TextureDescriptorAsset> {
    const image = await context.loadDependency<ImageAsset>(request.url, "image");
    return {
      url: request.url,
      width: image.value.width,
      height: image.value.height,
      colorSpace: "srgb",
      source: image.value.source
    };
  }
}
