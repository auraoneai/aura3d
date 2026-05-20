export type TextureCompressedFormat = "bc1-rgba-unorm" | "bc3-rgba-unorm" | "etc2-rgba8unorm" | "astc-4x4-rgba-unorm";
export type TextureFormat = "rgba8" | "rgba16f" | "rgba32f" | "depth24" | TextureCompressedFormat;
export type TextureColorSpace = "linear" | "srgb";
export type TexturePixelData = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
export type TextureDimension = "2d" | "cube";
export type TextureCubeFace = "px" | "nx" | "py" | "ny" | "pz" | "nz";

export interface TextureMipLevelDescriptor {
  readonly width: number;
  readonly height: number;
  readonly data: TexturePixelData;
}

export interface TextureMipLevel {
  readonly width: number;
  readonly height: number;
  readonly data: TexturePixelData;
}

export interface TextureCubeFaceDescriptor {
  readonly face: TextureCubeFace;
  readonly mipLevels: readonly TextureMipLevelDescriptor[];
}

export interface TextureCubeFaceLevel {
  readonly face: TextureCubeFace;
  readonly mipLevels: readonly TextureMipLevel[];
}

export interface TextureDescriptor {
  readonly width: number;
  readonly height: number;
  readonly dimension?: TextureDimension;
  readonly format?: TextureFormat;
  readonly colorSpace?: TextureColorSpace;
  readonly label?: string;
  readonly data?: TexturePixelData;
  readonly mipLevels?: readonly TextureMipLevelDescriptor[];
  readonly cubeFaces?: readonly TextureCubeFaceDescriptor[];
  readonly source?: TexImageSource;
  readonly fallbackData?: Uint8Array | Uint8ClampedArray;
  readonly fallbackMipLevels?: readonly TextureMipLevelDescriptor[];
}

export class Texture {
  public readonly width: number;
  public readonly height: number;
  public readonly dimension: TextureDimension;
  public readonly format: TextureFormat;
  public readonly colorSpace: TextureColorSpace;
  public readonly label: string;
  public readonly data: TexturePixelData | null;
  public readonly mipLevels: readonly TextureMipLevel[];
  public readonly cubeFaces: readonly TextureCubeFaceLevel[];
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
    this.dimension = descriptor.dimension ?? (descriptor.cubeFaces ? "cube" : "2d");
    this.format = descriptor.format ?? "rgba8";
    this.colorSpace = descriptor.colorSpace ?? "linear";
    this.label = descriptor.label ?? "texture";
    if (this.dimension === "cube" && descriptor.width !== descriptor.height) {
      throw new Error("Cube textures require square width and height");
    }
    if (descriptor.data && descriptor.source) {
      throw new Error("Texture cannot define both raw pixel data and image source");
    }
    if (descriptor.mipLevels && descriptor.source) {
      throw new Error("Texture cannot define both mipLevels and image source");
    }
    if (descriptor.data && descriptor.mipLevels) {
      throw new Error("Texture cannot define both data and mipLevels");
    }
    this.data = descriptor.data ? clonePixelData(descriptor.data) : null;
    this.mipLevels = descriptor.mipLevels ? cloneMipLevels(descriptor.mipLevels, "mipLevels") : [];
    this.cubeFaces = descriptor.cubeFaces ? cloneCubeFaces(descriptor.cubeFaces) : [];
    this.source = descriptor.source ?? null;
    this.fallbackData = descriptor.fallbackData ? new Uint8Array(descriptor.fallbackData) : null;
    this.fallbackMipLevels = descriptor.fallbackMipLevels ? cloneMipLevels(descriptor.fallbackMipLevels, "fallbackMipLevels") : [];
    if (this.dimension === "cube") {
      if (this.data || this.mipLevels.length > 0 || this.source || this.fallbackData || this.fallbackMipLevels.length > 0) {
        throw new Error("Cube textures must define cubeFaces instead of 2D data, mipLevels, source, or fallbacks");
      }
      if (isCompressedTextureFormat(this.format) || this.format === "depth24") {
        throw new Error("Cube textures currently support rgba8, rgba16f, or rgba32f formats");
      }
      validateCubeFaces(this.cubeFaces, this.width, this.height, this.format);
      return;
    }
    if (this.cubeFaces.length > 0) {
      throw new Error("2D textures cannot define cubeFaces");
    }
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
      if (this.source && this.format !== "rgba8") {
        throw new Error("TexImageSource uploads are only supported for rgba8 textures");
      }
      if (this.format === "depth24" && (this.data || this.mipLevels.length > 0 || this.source)) {
        throw new Error("Depth textures cannot define color data, mipLevels, or image sources");
      }
      if (this.mipLevels.length > 0) {
        validateTextureMipLevels(this.mipLevels, this.width, this.height, this.format, "mipLevels");
      }
      if (this.data) {
        validateTexturePixelData(this.data, this.width, this.height, this.format, "texture data");
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
    if (this.dimension === "cube") {
      return this.cubeFaces.reduce((total, face) => total + face.mipLevels.reduce((faceTotal, level) => faceTotal + level.data.byteLength, 0), 0);
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
    case "rgba16f":
      return 8;
    case "rgba32f":
      return 16;
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
    return { width: level.width, height: level.height, data: clonePixelData(level.data) };
  });
}

function cloneCubeFaces(faces: readonly TextureCubeFaceDescriptor[]): TextureCubeFaceLevel[] {
  if (faces.length !== 6) {
    throw new Error("Cube textures require exactly six faces");
  }
  return faces.map((face) => ({
    face: face.face,
    mipLevels: cloneMipLevels(face.mipLevels, `cubeFaces.${face.face}.mipLevels`)
  }));
}

function clonePixelData(data: TexturePixelData): TexturePixelData {
  if (data instanceof Uint8ClampedArray) return new Uint8ClampedArray(data);
  if (data instanceof Uint16Array) return new Uint16Array(data);
  if (data instanceof Float32Array) return new Float32Array(data);
  return new Uint8Array(data);
}

function validateCubeFaces(faces: readonly TextureCubeFaceLevel[], width: number, height: number, format: TextureFormat): void {
  const expectedFaces: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
  const seen = new Set<TextureCubeFace>();
  for (const face of faces) {
    if (!expectedFaces.includes(face.face)) {
      throw new Error(`Unsupported cube texture face: ${face.face}`);
    }
    if (seen.has(face.face)) {
      throw new Error(`Duplicate cube texture face: ${face.face}`);
    }
    seen.add(face.face);
    validateTextureMipLevels(face.mipLevels, width, height, format, `cubeFaces.${face.face}.mipLevels`);
  }
  for (const face of expectedFaces) {
    if (!seen.has(face)) {
      throw new Error(`Missing cube texture face: ${face}`);
    }
  }
}

function validateTextureMipLevels(levels: readonly TextureMipLevel[], width: number, height: number, format: TextureFormat, label: string): void {
  if (levels[0]?.width !== width || levels[0]?.height !== height) {
    throw new Error(`${label} first level must match width and height`);
  }
  for (const [index, level] of levels.entries()) {
    validateTexturePixelData(level.data, level.width, level.height, format, `${label} level ${index}`);
  }
}

function validateTexturePixelData(data: TexturePixelData, width: number, height: number, format: TextureFormat, label: string): void {
  if (format === "rgba8") {
    if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
      throw new Error(`${label} for rgba8 textures must be Uint8Array or Uint8ClampedArray`);
    }
  } else if (format === "rgba16f") {
    if (!(data instanceof Uint16Array)) {
      throw new Error(`${label} for rgba16f textures must be Uint16Array half-float data`);
    }
  } else if (format === "rgba32f") {
    if (!(data instanceof Float32Array)) {
      throw new Error(`${label} for rgba32f textures must be Float32Array data`);
    }
  } else if (format === "depth24") {
    throw new Error(`${label} is not valid for depth24 textures`);
  }
  const expected = width * height * bytesPerPixel(format);
  if (data.byteLength !== expected) {
    throw new Error(`${label} for ${format} textures must contain exactly ${expected} bytes`);
  }
}
