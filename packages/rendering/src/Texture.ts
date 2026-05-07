export type TextureCompressedFormat = "bc1-rgba-unorm" | "bc3-rgba-unorm" | "etc2-rgba8unorm" | "astc-4x4-rgba-unorm";
export type TextureFormat = "rgba8" | "depth24" | TextureCompressedFormat;
export type TextureColorSpace = "linear" | "srgb";

export interface TextureMipLevelDescriptor {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface TextureMipLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface TextureDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format?: TextureFormat;
  readonly colorSpace?: TextureColorSpace;
  readonly label?: string;
  readonly data?: Uint8Array | Uint8ClampedArray;
  readonly mipLevels?: readonly TextureMipLevelDescriptor[];
  readonly source?: TexImageSource;
  readonly fallbackData?: Uint8Array | Uint8ClampedArray;
  readonly fallbackMipLevels?: readonly TextureMipLevelDescriptor[];
}

export class Texture {
  public readonly width: number;
  public readonly height: number;
  public readonly format: TextureFormat;
  public readonly colorSpace: TextureColorSpace;
  public readonly label: string;
  public readonly data: Uint8Array | null;
  public readonly mipLevels: readonly TextureMipLevel[];
  public readonly source: TexImageSource | null;
  public readonly fallbackData: Uint8Array | null;
  public readonly fallbackMipLevels: readonly TextureMipLevel[];
  public disposed = false;

  constructor(descriptor: TextureDescriptor) {
    if (!Number.isInteger(descriptor.width) || descriptor.width <= 0) {
      throw new Error("Texture width must be a positive integer");
    }
    if (!Number.isInteger(descriptor.height) || descriptor.height <= 0) {
      throw new Error("Texture height must be a positive integer");
    }
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format ?? "rgba8";
    this.colorSpace = descriptor.colorSpace ?? "linear";
    this.label = descriptor.label ?? "texture";
    if (descriptor.data && descriptor.source) {
      throw new Error("Texture cannot define both raw pixel data and image source");
    }
    if (descriptor.mipLevels && descriptor.source) {
      throw new Error("Texture cannot define both mipLevels and image source");
    }
    if (descriptor.data && descriptor.mipLevels) {
      throw new Error("Texture cannot define both data and mipLevels");
    }
    this.data = descriptor.data ? new Uint8Array(descriptor.data) : null;
    this.mipLevels = descriptor.mipLevels ? cloneMipLevels(descriptor.mipLevels, "mipLevels") : [];
    this.source = descriptor.source ?? null;
    this.fallbackData = descriptor.fallbackData ? new Uint8Array(descriptor.fallbackData) : null;
    this.fallbackMipLevels = descriptor.fallbackMipLevels ? cloneMipLevels(descriptor.fallbackMipLevels, "fallbackMipLevels") : [];
    if (isCompressedTextureFormat(this.format)) {
      if (!this.data && this.mipLevels.length === 0) {
        throw new Error("Compressed textures require compressed data bytes");
      }
      if (this.source) {
        throw new Error("Compressed textures cannot use TexImageSource uploads");
      }
      const levels = this.textureLevels;
      for (const [index, level] of levels.entries()) {
        const expected = compressedTextureByteLength(level.width, level.height, this.format);
        if (level.data.byteLength !== expected) {
          throw new Error(`Compressed texture mip level ${index} for ${this.format} must contain ${expected} bytes`);
        }
      }
      if (levels[0]?.width !== this.width || levels[0]?.height !== this.height) {
        throw new Error("Compressed texture first mip level must match width and height");
      }
      if (this.fallbackData && this.fallbackData.byteLength !== this.width * this.height * 4) {
        throw new Error("Compressed texture fallbackData must contain exactly width * height * 4 RGBA8 bytes");
      }
      for (const [index, level] of this.fallbackTextureLevels.entries()) {
        if (level.data.byteLength !== level.width * level.height * 4) {
          throw new Error(`Compressed texture fallback mip level ${index} must contain exactly width * height * 4 RGBA8 bytes`);
        }
      }
      if (this.fallbackTextureLevels.length > 0 && (this.fallbackTextureLevels[0]?.width !== this.width || this.fallbackTextureLevels[0]?.height !== this.height)) {
        throw new Error("Compressed texture first fallback mip level must match width and height");
      }
    } else {
      if (this.mipLevels.length > 0 && this.format !== "rgba8") {
        throw new Error("Uncompressed mipLevels are only supported for rgba8 textures");
      }
      if (this.mipLevels.length > 0) {
        validateRgbaMipLevels(this.mipLevels, this.width, this.height, "mipLevels");
      }
      if (this.data && this.format === "rgba8" && this.data.byteLength !== this.width * this.height * 4) {
        throw new Error("RGBA8 texture data must contain exactly width * height * 4 bytes");
      }
      if ((this.data || this.source) && this.format !== "rgba8") {
        throw new Error("Texture uploads are only supported for rgba8 textures");
      }
      if (this.fallbackData) {
        throw new Error("fallbackData is only valid for compressed textures");
      }
      if (this.fallbackMipLevels.length > 0) {
        throw new Error("fallbackMipLevels are only valid for compressed textures");
      }
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  get byteLength(): number {
    if (isCompressedTextureFormat(this.format)) {
      const format = this.format;
      return this.textureLevels.reduce((total, level) => total + compressedTextureByteLength(level.width, level.height, format), 0);
    }
    if (this.mipLevels.length > 0) {
      return this.mipLevels.reduce((total, level) => total + level.data.byteLength, 0);
    }
    return this.width * this.height * bytesPerPixel(this.format);
  }

  get fallbackByteLength(): number {
    return this.fallbackTextureLevels.reduce((total, level) => total + level.data.byteLength, 0);
  }

  get textureLevels(): readonly TextureMipLevel[] {
    if (this.mipLevels.length > 0) return this.mipLevels;
    return this.data ? [{ width: this.width, height: this.height, data: this.data }] : [];
  }

  get fallbackTextureLevels(): readonly TextureMipLevel[] {
    if (this.fallbackMipLevels.length > 0) return this.fallbackMipLevels;
    return this.fallbackData ? [{ width: this.width, height: this.height, data: this.fallbackData }] : [];
  }
}

export function bytesPerPixel(format: TextureFormat): number {
  switch (format) {
    case "rgba8":
      return 4;
    case "depth24":
      return 4;
    case "bc1-rgba-unorm":
    case "bc3-rgba-unorm":
    case "etc2-rgba8unorm":
    case "astc-4x4-rgba-unorm":
      return 0;
  }
}

export function isCompressedTextureFormat(format: TextureFormat): format is TextureCompressedFormat {
  return format === "bc1-rgba-unorm" || format === "bc3-rgba-unorm" || format === "etc2-rgba8unorm" || format === "astc-4x4-rgba-unorm";
}

export function compressedTextureByteLength(width: number, height: number, format: TextureCompressedFormat): number {
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));
  return blocksWide * blocksHigh * compressedBlockByteLength(format);
}

export function compressedBlockByteLength(format: TextureCompressedFormat): number {
  switch (format) {
    case "bc1-rgba-unorm":
      return 8;
    case "bc3-rgba-unorm":
    case "etc2-rgba8unorm":
    case "astc-4x4-rgba-unorm":
      return 16;
  }
}

function cloneMipLevels(levels: readonly TextureMipLevelDescriptor[], label: string): TextureMipLevel[] {
  if (levels.length === 0) {
    throw new Error(`${label} must contain at least one level`);
  }
  return levels.map((level, index) => {
    if (!Number.isInteger(level.width) || level.width <= 0) {
      throw new Error(`${label} level ${index} width must be a positive integer`);
    }
    if (!Number.isInteger(level.height) || level.height <= 0) {
      throw new Error(`${label} level ${index} height must be a positive integer`);
    }
    return { width: level.width, height: level.height, data: new Uint8Array(level.data) };
  });
}

function validateRgbaMipLevels(levels: readonly TextureMipLevel[], width: number, height: number, label: string): void {
  if (levels[0]?.width !== width || levels[0]?.height !== height) {
    throw new Error(`${label} first level must match width and height`);
  }
  for (const [index, level] of levels.entries()) {
    if (level.data.byteLength !== level.width * level.height * 4) {
      throw new Error(`${label} level ${index} must contain exactly width * height * 4 RGBA8 bytes`);
    }
  }
}
