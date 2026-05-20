export type TextureWrapCompat = "ClampToEdgeWrapping" | "RepeatWrapping" | "MirroredRepeatWrapping";
export type TextureFilterCompat = "NearestFilter" | "LinearFilter" | "LinearMipmapLinearFilter";

export class TextureCompat {
  readonly type = "Texture";
  wrapS: TextureWrapCompat = "ClampToEdgeWrapping";
  wrapT: TextureWrapCompat = "ClampToEdgeWrapping";
  magFilter: TextureFilterCompat = "LinearFilter";
  minFilter: TextureFilterCompat = "LinearMipmapLinearFilter";
  colorSpace: "srgb" | "linear" = "srgb";
  flipY = true;
  needsUpdate = false;

  constructor(public image: unknown = null) {}
}

export class TextureLoaderCompat {
  load(url: string, onLoad?: (texture: TextureCompat) => void): TextureCompat {
    const texture = new TextureCompat({ url });
    texture.needsUpdate = true;
    onLoad?.(texture);
    return texture;
  }
}

export const V5_COMPAT_TEXTURE_SETTINGS = ["wrapS", "wrapT", "magFilter", "minFilter", "colorSpace", "flipY"] as const;
