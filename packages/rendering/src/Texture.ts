/** BC1 RGB and RGBA have identical blocks but different alpha semantics. */
export type TextureCompressedFormat = "bc1-rgb-unorm" | "bc1-rgba-unorm" | "bc3-rgba-unorm" | "etc2-rgba8unorm" | "astc-4x4-rgba-unorm" | "bc7-rgba-unorm" | "etc2-rgb8unorm";
export type TextureFormat = "rgba8" | "rgba16f" | "rgba32f" | "r32f" | "depth24" | TextureCompressedFormat;
export type TextureColorSpace = "linear" | "srgb";
export type TexturePixelData = Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array;
export type TextureDimension = "2d" | "cube" | "2d-array" | "3d";
export type TextureCubeFace = "px" | "nx" | "py" | "ny" | "pz" | "nz";
export type TextureUsage = "sampled" | "storage" | "render-attachment" | "copy-src" | "copy-dst";

export interface TextureMipLevelDescriptor {
  readonly width: number;
  readonly height: number;
  /** Volume depth for this mip; omitted for 2D images and array layers. */
  readonly depth?: number;
  readonly data: TexturePixelData;
}

export interface TextureMipLevel {
  readonly width: number;
  readonly height: number;
  readonly depth?: number;
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
  /** C-18 (PR 0a): layer count when `dimension` is "2d-array" (morph textures). */
  readonly layers?: number;
  /** Volume depth. Required for 3D textures; it shrinks at each mip level. */
  readonly depth?: number;
  /** Allocated levels. Defaults to the supplied mip count, or one. */
  readonly mipLevelCount?: number;
  /** Intended GPU usages. Defaults to sampled + copy-dst, plus render-attachment for targets. */
  readonly usage?: readonly TextureUsage[];
  /**
   * C-18 (PRD-06 T0.10a): mark a flat 2D data texture for repeated
   * `update()`-driven re-uploads. Devices allocate immutable storage once
   * (`texStorage2D`) and refresh it via `texSubImage2D`; non-dynamic textures
   * keep the legacy `texImage2D` path.
   *
   * threejs-parity ST-03 (L4): `dynamic` may be combined with `source` for
   * canvas/video textures — the source image is re-uploaded in place whenever
   * `markNeedsUpdate()`/`needsUpdate` bumps `revision`.
   */
  readonly dynamic?: boolean;
  /**
   * threejs-parity ST-02 (L4): vertical flip applied to `source` uploads
   * (three's `Texture.flipY`). WebGL2 applies it through
   * `UNPACK_FLIP_Y_WEBGL`; WebGPU through `copyExternalImageToTexture`'s
   * `flipY` option or the canvas readback path. Ignored for raw data,
   * compressed, cube and depth textures (three applies flipY only to image
   * uploads as well).
   */
  readonly flipY?: boolean;
  /**
   * threejs-parity ST-02 (L4): whether the device generates a full mip chain
   * after uploading (three's `Texture.generateMipmaps`, default true).
   * Source-backed textures honour it on every revision upload; flat data
   * textures honour it on the initial upload.
   */
  readonly generateMipmaps?: boolean;
  /**
   * Render-target attachment created by a device's `createRenderTarget`. The
   * GPU storage is allocated by the device (texStorage2D for cube faces), so
   * cube attachments carry no `cubeFaces` and may use `depth24`.
   */
  readonly renderAttachment?: boolean;
}

/**
 * Bumped by every `Texture.dispose()`. Texture registries compare it with the
 * epoch of their last sweep so the disposed-handle scan runs only after a
 * disposal, not on every texture bind (it was O(textures) per bind, i.e.
 * O(draws x textures) per frame: 20-26% of frame CPU on the 1.3-1.6k-draw games).
 */
const TEXTURE_DISPOSE_EPOCH = Symbol.for("@aura3d/rendering/textureDisposeEpoch");
export function currentTextureDisposeEpoch(): number {
  const value = (globalThis as unknown as Record<symbol, unknown>)[TEXTURE_DISPOSE_EPOCH];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// A render-target alias represents device-owned storage, not portable CPU
// content. Share the ownership table across bundled copies of the renderer,
// just as TextureBinding shares its brand across the engine and packages.
const RENDER_TARGET_TEXTURE_OWNERS = Symbol.for("@aura3d/rendering/renderTargetTextureOwners/v1");
const textureOwnerState = globalThis as unknown as Record<symbol, unknown>;
const existingTextureOwners = textureOwnerState[RENDER_TARGET_TEXTURE_OWNERS];
if (existingTextureOwners !== undefined && !(existingTextureOwners instanceof WeakMap)) {
  throw new Error("Render-target texture ownership registry is invalid");
}
const renderTargetTextureOwners = (existingTextureOwners ?? new WeakMap<Texture, object>()) as WeakMap<Texture, object>;
textureOwnerState[RENDER_TARGET_TEXTURE_OWNERS] = renderTargetTextureOwners;

/** @internal Claim a device-created attachment once; ownership survives disposal and loss. */
export function claimRenderTargetTextureOwner(texture: Texture, device: object): void {
  const owner = renderTargetTextureOwners.get(texture);
  if (owner !== undefined && owner !== device) {
    throw new Error("Render-target texture is already owned by another device");
  }
  if (owner === undefined) renderTargetTextureOwners.set(texture, device);
}

/** @internal Unclaimed CPU-authored textures can be uploaded by multiple devices. */
export function getRenderTargetTextureOwner(texture: Texture): object | undefined {
  return renderTargetTextureOwners.get(texture);
}

export class Texture {
  public readonly width: number;
  public readonly height: number;
  public readonly dimension: TextureDimension;
  public readonly format: TextureFormat;
  /**
   * threejs-parity ST-02 (L4): mutable — a handle may re-point the colour
   * interpretation; writers must also mark `needsUpdate` so the next upload
   * re-uploads with the new transfer function.
   */
  private _colorSpace: TextureColorSpace = "linear";
  public get colorSpace(): TextureColorSpace { return this._colorSpace; }
  public set colorSpace(value: TextureColorSpace) {
    if (value !== "linear" && value !== "srgb") throw new Error(`Unsupported texture color space: ${value}`);
    if (value !== "linear" && (this.format === "r32f" || this.usage?.includes("storage"))) throw new Error("r32f and storage textures require linear color space");
    this._colorSpace = value;
  }
  public readonly label: string;
  /** CPU content is released after disposal listeners have run. */
  public readonly data: TexturePixelData | null;
  public readonly mipLevels: readonly TextureMipLevel[];
  public readonly cubeFaces: readonly TextureCubeFaceLevel[];
  /** Borrowed image source; the reference is released after disposal listeners run. */
  public readonly source: TexImageSource | null;
  /** threejs-parity ST-02 (L4): see {@link TextureDescriptor.flipY}. */
  public flipY: boolean;
  /** threejs-parity ST-02 (L4): see {@link TextureDescriptor.generateMipmaps}. */
  public generateMipmaps: boolean;
  public readonly fallbackData: Uint8Array | null;
  public readonly fallbackMipLevels: readonly TextureMipLevel[];
  /** C-18: layer count for `2d-array` textures; 1 for 2d/cube. */
  public readonly layers: number;
  public readonly depth: number;
  public readonly mipLevelCount: number;
  public readonly usage: readonly TextureUsage[];
  /** C-18 (T0.10a): true when constructed for `update()`-driven re-uploads. */
  public readonly dynamic: boolean;
  public disposed = false;
  private readonly disposeListeners = new Set<() => void>();

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
    if (!["2d", "cube", "2d-array", "3d"].includes(this.dimension)) throw new Error(`Unsupported texture dimension: ${this.dimension}`);
    if (!["rgba8", "rgba16f", "rgba32f", "r32f", "depth24"].includes(this.format) && !isCompressedTextureFormat(this.format)) throw new Error(`Unsupported texture format: ${this.format}`);
    if (this.colorSpace !== "linear" && this.colorSpace !== "srgb") throw new Error(`Unsupported texture color space: ${this.colorSpace}`);
    if (this.format === "r32f" && this.colorSpace !== "linear") throw new Error("r32f textures require linear color space");
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
    if (this.source && this.dimension !== "2d") throw new Error("Image source uploads require a 2d texture");
    this.flipY = descriptor.flipY === true;
    this.generateMipmaps = descriptor.generateMipmaps ?? true;
    this.fallbackData = descriptor.fallbackData ? new Uint8Array(descriptor.fallbackData) : null;
    this.fallbackMipLevels = descriptor.fallbackMipLevels ? cloneMipLevels(descriptor.fallbackMipLevels, "fallbackMipLevels") : [];
    this.dynamic = descriptor.dynamic === true;
    this.layers = descriptor.layers ?? 1;
    this.depth = descriptor.depth ?? 1;
    if (this.dimension === "2d-array" && (!Number.isInteger(this.layers) || this.layers < 1)) {
      throw new Error("2d-array textures require layers to be a positive integer");
    }
    if (this.dimension === "3d" && (!Number.isInteger(descriptor.depth) || this.depth < 1)) {
      throw new Error("3d textures require depth to be a positive integer");
    }
    if (this.dimension === "3d" && this.format === "depth24") throw new Error("3d depth textures are not supported by the active texture model");
    if (this.dimension !== "3d" && descriptor.depth !== undefined) {
      throw new Error("Texture depth only applies to 3d textures");
    }
    // Existing cube target creators pass layers: 6; preserve that contract.
    if (descriptor.layers !== undefined && this.dimension !== "2d-array" && !(this.dimension === "cube" && descriptor.layers === 6)) {
      throw new Error("Texture layers only applies to 2d-array textures");
    }
    const suppliedMipCount = this.dimension === "cube" ? this.cubeFaces[0]?.mipLevels.length : this.mipLevels.length;
    this.mipLevelCount = descriptor.mipLevelCount ?? (suppliedMipCount || 1);
    const maxMipCount = Math.floor(Math.log2(Math.max(this.width, this.height, this.depth))) + 1;
    if (!Number.isInteger(this.mipLevelCount) || this.mipLevelCount < 1 || this.mipLevelCount > maxMipCount || this.mipLevelCount < (suppliedMipCount ?? 0)) {
      throw new Error(`Texture mipLevelCount must contain the supplied levels and be between 1 and ${maxMipCount}`);
    }
    const usage = descriptor.usage ?? ["sampled", "copy-dst", ...(descriptor.renderAttachment ? ["render-attachment" as const, "copy-src" as const] : [])];
    const allowedUsages: readonly TextureUsage[] = ["sampled", "storage", "render-attachment", "copy-src", "copy-dst"];
    if (usage.length === 0 || usage.some((entry) => !allowedUsages.includes(entry)) || new Set(usage).size !== usage.length) {
      throw new Error("Texture usage must contain unique, supported usages");
    }
    this.usage = Object.freeze([...usage]);
    if ((this.data || this.mipLevels.length || this.cubeFaces.length || this.source) && !this.usage.includes("copy-dst")) {
      throw new Error("Texture CPU uploads require copy-dst usage");
    }
    if (descriptor.renderAttachment && !this.usage.includes("render-attachment")) {
      throw new Error("Render attachment textures require render-attachment usage");
    }
    if (this.usage.includes("storage") && (isCompressedTextureFormat(this.format) || this.format === "depth24" || this.colorSpace !== "linear" || this.dimension === "cube")) {
      throw new Error("Storage textures require a linear, uncompressed color format and a 2d, 2d-array or 3d dimension");
    }
    if (this.usage.includes("render-attachment") && isCompressedTextureFormat(this.format)) {
      throw new Error("Compressed textures cannot be render attachments");
    }
    // threejs-parity ST-03 (L4): `dynamic` + `source` is the canvas/video
    // combination — re-uploaded in place from the live source on each revision.
    if (this.dynamic && (this.dimension !== "2d" || this.mipLevels.length > 0 || this.mipLevelCount !== 1 || isCompressedTextureFormat(this.format) || this.format === "depth24")) {
      throw new Error("dynamic textures must be flat, non-compressed 2D textures (an image source is allowed for canvas/video re-uploads)");
    }
    if (this.dimension === "cube") {
      if (this.data || this.mipLevels.length > 0 || this.source || this.fallbackData || this.fallbackMipLevels.length > 0) {
        throw new Error("Cube textures must define cubeFaces instead of 2D data, mipLevels, source, or fallbacks");
      }
      if (descriptor.renderAttachment === true) {
        if (this.cubeFaces.length > 0 || isCompressedTextureFormat(this.format)) {
          throw new Error("Cube render attachments are device-allocated and cannot define cubeFaces or compressed formats");
        }
        return;
      }
      if (this.format === "depth24") {
        throw new Error("Depth cube textures require renderAttachment allocation");
      }
      validateCubeFaces(this.cubeFaces, this.width, this.height, this.format);
      return;
    }
    if (this.cubeFaces.length > 0) {
      throw new Error("2D textures cannot define cubeFaces");
    }
    if (isCompressedTextureFormat(this.format)) {
      if (this.dimension === "3d") throw new Error("Compressed 3d textures are not supported");
      if (!this.data && this.mipLevels.length === 0) {
        throw new Error("Compressed textures require compressed data bytes");
      }
      if (this.source) {
        throw new Error("Compressed textures cannot use TexImageSource uploads");
      }
      const levels = this.textureLevels;
      for (const [index, level] of levels.entries()) {
        const expected = compressedTextureByteLength(level.width, level.height, this.format) * this.layers;
        if (!(level.data instanceof Uint8Array) || level.data.byteLength !== expected) {
          throw new Error(`Compressed texture mip level ${index} for ${this.format} must contain ${expected} bytes`);
        }
      }
      if (levels[0]?.width !== this.width || levels[0]?.height !== this.height) {
        throw new Error("Compressed texture first mip level must match width and height");
      }
      validateMipDimensions(levels, this.width, this.height, this.depth, this.dimension, "mipLevels");
      if (this.fallbackData && this.fallbackData.byteLength !== this.width * this.height * this.layers * 4) {
        throw new Error("Compressed texture fallbackData must contain exactly width * height * layers * 4 RGBA8 bytes");
      }
      for (const [index, level] of this.fallbackTextureLevels.entries()) {
        if (!(level.data instanceof Uint8Array) || level.data.byteLength !== level.width * level.height * this.layers * 4) {
          throw new Error(`Compressed texture fallback mip level ${index} must contain exactly width * height * layers * 4 RGBA8 bytes`);
        }
      }
      if (this.fallbackTextureLevels.length > 0 && (this.fallbackTextureLevels[0]?.width !== this.width || this.fallbackTextureLevels[0]?.height !== this.height)) {
        throw new Error("Compressed texture first fallback mip level must match width and height");
      }
      if (this.fallbackTextureLevels.length > 0) validateMipDimensions(this.fallbackTextureLevels, this.width, this.height, 1, this.dimension, "fallbackMipLevels");
      if (this.format === "bc1-rgb-unorm" && this.fallbackTextureLevels.length > 0) {
        if (this.fallbackTextureLevels.length !== this.mipLevelCount) {
          throw new Error("BC1 RGB fallback must contain every allocated mip level");
        }
        for (const level of this.fallbackTextureLevels) {
          for (let alpha = 3; alpha < level.data.length; alpha += 4) {
            if (level.data[alpha] !== 255) throw new Error("BC1 RGB fallback alpha must be opaque");
          }
        }
      }
    } else {
      if (this.source && this.format !== "rgba8") {
        throw new Error("TexImageSource uploads are only supported for rgba8 textures");
      }
      if (this.format === "depth24" && (this.data || this.mipLevels.length > 0 || this.source)) {
        throw new Error("Depth textures cannot define color data, mipLevels, or image sources");
      }
      if (this.mipLevels.length > 0) {
        validateTextureMipLevels(this.mipLevels, this.width, this.height, this.format, "mipLevels", this.dimension, this.depth, this.layers);
      }
      if (this.data) {
        // C-18: 2d-array content is width*height*bpp per layer.
        validateTexturePixelData(this.data, this.width * this.layers * this.depth, this.height, this.format, "texture data");
      }
      if (this.fallbackData) {
        throw new Error("fallbackData is only valid for compressed textures");
      }
      if (this.fallbackMipLevels.length > 0) {
        throw new Error("fallbackMipLevels are only valid for compressed textures");
      }
    }
  }

  /**
   * Retire this texture and release its CPU content references after all
   * synchronous disposal listeners run. Retained aliases remain caller-owned;
   * dimensions and {@link byteLength} still describe the original layout.
   */
  dispose(): void {
    if (this.disposed) return;
    if (!this.disposed) {
      (globalThis as unknown as Record<symbol, unknown>)[TEXTURE_DISPOSE_EPOCH] = currentTextureDisposeEpoch() + 1;
    }
    this.disposed = true;
    for (const listener of this.disposeListeners) {
      try { listener(); } catch { /* Other device owners must still release their leases. */ }
    }
    this.disposeListeners.clear();
    // Sources belong to their providers. Drop our references without pausing,
    // closing, or otherwise altering the borrowed image, canvas, or media.
    this.pollContentRevision = undefined;
    (this as { source: TexImageSource | null }).source = null;
    // Constructor inputs are copied, but update() can retain caller-owned
    // arrays. Release references only: never zero, detach, or mutate pixels
    // that a caller or a synchronous disposal listener may still hold.
    (this as { data: TexturePixelData | null }).data = null;
    (this as { mipLevels: readonly TextureMipLevel[] }).mipLevels = [];
    (this as { cubeFaces: readonly TextureCubeFaceLevel[] }).cubeFaces = [];
    (this as { fallbackData: Uint8Array | null }).fallbackData = null;
    (this as { fallbackMipLevels: readonly TextureMipLevel[] }).fallbackMipLevels = [];
    this.fallbackReplacement = null;
    this.mipOverrides.clear();
    this.mipRevisions.clear();
    this.fullContentRevision = 0;
    this.contentMarkPending = false;
    this.pendingUpdateRegion = null;
  }

  /** Subscribe to resource disposal. Registering on a disposed texture fires immediately. */
  onDispose(listener: () => void): () => void {
    if (this.disposed) { listener(); return () => {}; }
    this.disposeListeners.add(listener);
    return () => { this.disposeListeners.delete(listener); };
  }

  get byteLength(): number {
    let bytes = 0;
    for (let level = 0; level < this.mipLevelCount; level += 1) {
      const width = mipExtent(this.width, level);
      const height = mipExtent(this.height, level);
      const planes = this.dimension === "cube" ? 6 : this.dimension === "3d" ? mipExtent(this.depth, level) : this.layers;
      bytes += (isCompressedTextureFormat(this.format) ? compressedTextureByteLength(width, height, this.format) : width * height * bytesPerPixel(this.format)) * planes;
    }
    return bytes;
  }

  get fallbackByteLength(): number {
    return this.fallbackTextureLevels.reduce((total, level) => total + level.data.byteLength, 0);
  }

  /** Bytes retained by CPU content references, including snapshots and borrowed update data. */
  get cpuByteLength(): number {
    return (this.data?.byteLength ?? 0)
      + this.mipLevels.reduce((sum, level) => sum + level.data.byteLength, 0)
      + this.cubeFaces.reduce((sum, face) => sum + face.mipLevels.reduce((bytes, level) => bytes + level.data.byteLength, 0), 0)
      + (this.fallbackData?.byteLength ?? 0)
      + this.fallbackMipLevels.reduce((sum, level) => sum + level.data.byteLength, 0)
      + (this.fallbackReplacement ?? []).reduce((sum, level) => sum + level.data.byteLength, 0)
      + [...this.mipOverrides.values()].reduce((sum, level) => sum + level.data.byteLength, 0);
  }

  get textureLevels(): readonly TextureMipLevel[] {
    if (this.mipLevels.length > 0) return this.mipLevels;
    return this.data ? [{ width: this.width, height: this.height, data: this.data }] : [];
  }

  get fallbackTextureLevels(): readonly TextureMipLevel[] {
    // Compressed mip edits, including in-place edits marked dirty, invalidate
    // the decoded copy for every device. Metadata-only edits leave it intact.
    // A replacement supplied after the edit describes the current content.
    if (isCompressedTextureFormat(this.format) && (this.mipOverrides.size > 0 || this.fallbackInvalid)) return this.fallbackReplacement ?? [];
    if (this.fallbackMipLevels.length > 0) return this.fallbackMipLevels;
    return this.fallbackData ? [{ width: this.width, height: this.height, data: this.fallbackData }] : [];
  }

  /** C-18 (PR 0a): content revision, incremented by `update`. */
  public revision = 0;

  // Per-subresource revisions are never consumed: two devices can independently
  // catch up even when another device has already uploaded the same edit.
  private readonly mipOverrides = new Map<string, TextureMipLevel>();
  private readonly mipRevisions = new Map<string, number>();
  // A caller can mutate any retained subresource before a full-content mark.
  // Keep that revision for every device, even after one device acknowledges it.
  private fullContentRevision = 0;
  private contentMarkPending = false;
  private uploadAcknowledgements = 0;
  private fallbackInvalid = false;
  private fallbackReplacement: readonly TextureMipLevel[] | null = null;

  /** True while a decoded fallback supplied by `replaceFallbackLevels` is current. */
  get fallbackReplaced(): boolean {
    return this.fallbackReplacement !== null && isCompressedTextureFormat(this.format) && (this.mipOverrides.size > 0 || this.fallbackInvalid);
  }

  /**
   * Supply decoded RGBA8 fallback levels for the current compressed content.
   * A compressed content edit invalidates the decoded fallback for every
   * device; this installs its replacement (largest level first, matching the
   * texture extent, one level per allocated mip for BC1 RGB). Levels are
   * snapshotted. A later content edit invalidates them again, and devices
   * upload them on the next revision.
   */
  public replaceFallbackLevels(levels: readonly TextureMipLevelDescriptor[]): void {
    if (this.disposed) throw new Error("Cannot replace the fallback of a disposed texture");
    if (!isCompressedTextureFormat(this.format)) throw new Error("Fallback levels are only valid for compressed textures");
    if (this.dimension === "cube" || this.dimension === "3d") throw new Error("Decoded fallbacks are only supported for 2d and 2d-array compressed textures");
    const cloned = cloneMipLevels(levels, "fallbackMipLevels");
    validateMipDimensions(cloned, this.width, this.height, this.depth, this.dimension, "fallbackMipLevels");
    if (cloned.length > this.mipLevelCount) throw new Error("Fallback levels cannot exceed the allocated mip levels");
    for (const [index, level] of cloned.entries()) {
      if (!(level.data instanceof Uint8Array) || level.data.byteLength !== level.width * level.height * this.layers * 4) {
        throw new Error(`Compressed texture fallback mip level ${index} must contain exactly width * height * layers * 4 RGBA8 bytes`);
      }
    }
    if (this.format === "bc1-rgb-unorm") {
      if (cloned.length !== this.mipLevelCount) throw new Error("BC1 RGB fallback must contain every allocated mip level");
      for (const level of cloned) {
        for (let alpha = 3; alpha < level.data.byteLength; alpha += 4) {
          if (level.data[alpha] !== 255) throw new Error("BC1 RGB fallback alpha must be opaque");
        }
      }
    }
    // The replacement supersedes the constructor fallback for the current content.
    this.fallbackInvalid = true;
    this.fallbackReplacement = cloned;
    this._needsUpdate = true;
    this.revision += 1;
  }

  /** Current full-subresource data, or null if it has no CPU content or is disposed. */
  public getMipLevel(level: number, face?: TextureCubeFace): TextureMipLevel | null {
    const key = this.mipKey(level, face);
    const override = this.mipOverrides.get(key);
    if (override) return override;
    if (this.dimension === "cube") return this.cubeFaces.find((item) => item.face === face)?.mipLevels[level] ?? null;
    if (this.mipLevels.length > 0) return this.mipLevels[level] ?? null;
    return level === 0 && this.data ? { width: this.width, height: this.height, ...(this.dimension === "3d" ? { depth: this.depth } : {}), data: this.data } : null;
  }

  public getMipRevision(level: number, face?: TextureCubeFace): number {
    return Math.max(this.fullContentRevision, this.mipRevisions.get(this.mipKey(level, face)) ?? 0);
  }

  /**
   * Replace one complete mip (and one cube face where applicable), or merge a
   * bounded 3D region into a complete, CPU-authoritative retained mip. Such a
   * mip must not have GPU-only writes. Inputs are snapshotted; other mips are
   * neither modified nor regenerated.
   */
  public updateMip(level: number, data: TexturePixelData, options: TextureMipUpdateOptions = {}): void {
    if (this.disposed) throw new Error("Cannot update a disposed texture");
    if (!this.usage.includes("copy-dst")) throw new Error("Texture mip updates require copy-dst usage");
    if (this.source || this.format === "depth24") throw new Error("Source-backed and depth textures cannot accept mip data");
    const editRevision = this.revision;
    const key = this.mipKey(level, options.face);
    const width = mipExtent(this.width, level);
    const height = mipExtent(this.height, level);
    const depth = this.dimension === "3d" ? mipExtent(this.depth, level) : 1;
    const planes = this.dimension === "2d-array" ? this.layers : depth;
    const region = options.region;
    if (region !== undefined) {
      if (this.dimension !== "3d" || isCompressedTextureFormat(this.format)) throw new Error("Mip regions require an uncompressed 3d texture");
      if (this.usage.includes("storage") || this.usage.includes("render-attachment") || getRenderTargetTextureOwner(this) !== undefined) {
        throw new Error("3d mip regions require CPU-authoritative texture contents, not GPU-writable storage");
      }
      const retained = this.getMipLevel(level);
      if (!retained) throw new Error("3d mip regions require a complete retained mip; initialize it with updateMip first");
      const merged = mergeVolumeTextureUpdate(retained, data, region, width, height, depth, this.format);
      if (this.disposed || this.revision !== editRevision) throw new Error("Texture changed during the 3d mip region update");
      this.mipOverrides.set(key, merged);
    } else if (isCompressedTextureFormat(this.format)) {
      if (!(data instanceof Uint8Array)) throw new Error("Compressed mip data must be Uint8Array bytes");
      const expected = compressedTextureByteLength(width, height, this.format) * planes;
      if (data.byteLength !== expected) throw new Error(`Compressed mip ${level} for ${this.format} must contain ${expected} bytes`);
      this.mipOverrides.set(key, { width, height, data: clonePixelData(data) });
      this.fallbackReplacement = null;
    } else {
      validateTexturePixelData(data, width * planes, height, this.format, `mip ${level}`);
      this.mipOverrides.set(key, { width, height, ...(this.dimension === "3d" ? { depth } : {}), data: clonePixelData(data) });
    }
    this.generateMipmaps = false;
    this.revision += 1;
    this.mipRevisions.set(key, this.revision);
    this._needsUpdate = true;
    // A later full mark may describe bytes changed after this distinct edit.
    this.contentMarkPending = false;
  }

  private mipKey(level: number, face?: TextureCubeFace): string {
    if (!Number.isInteger(level) || level < 0 || level >= this.mipLevelCount) throw new Error(`Mip level must be an integer from 0 to ${this.mipLevelCount - 1}`);
    if (this.dimension === "cube") {
      if (!face || !(["px", "nx", "py", "ny", "pz", "nz"] as const).includes(face)) throw new Error("A valid cube face is required for cube mip access");
    } else if (face !== undefined) {
      throw new Error("A cube face is only valid for cube textures");
    }
    return `${face ?? "texture"}:${level}`;
  }

  /**
   * threejs-parity ST-02/ST-03 (L4): dirty flag mirroring three's
   * `Texture.needsUpdate`. Consecutive `true` writes coalesce until the dirty
   * flag is cleared or another explicit edit is recorded.
   * A pending mip or metadata edit does not subsume a full-content mark:
   * retained bytes can also have changed in place.
   * Acknowledgement never consumes the revisions used by other devices.
   */
  private _needsUpdate = false;

  get needsUpdate(): boolean {
    return this._needsUpdate;
  }

  set needsUpdate(value: boolean) {
    if (value) {
      this.markNeedsUpdate();
    } else {
      this._needsUpdate = false;
      this.contentMarkPending = false;
      this.uploadAcknowledgements += 1;
    }
  }

  /**
   * @internal Allow marks during an upload to create a new revision. If the
   * attempt fails, the returned callback restores its original dirty state
   * unless a newer edit or another device's acknowledgement superseded it.
   */
  public beginUploadAttempt(): () => void {
    const revision = this.revision;
    const dirty = this._needsUpdate;
    const contentMarkPending = this.contentMarkPending;
    const acknowledgements = this.uploadAcknowledgements;
    if (dirty) {
      this._needsUpdate = false;
      this.contentMarkPending = false;
    }
    return () => {
      if (!dirty || this.disposed || this.revision !== revision || this._needsUpdate || this.uploadAcknowledgements !== acknowledgements) return;
      this._needsUpdate = true;
      this.contentMarkPending = contentMarkPending;
    };
  }

  /**
   * Mark the texture's content changed for the next upload. Consecutive marks
   * are idempotent until the dirty flag is cleared or a distinct edit is recorded.
   */
  public markNeedsUpdate(): void {
    if (this.disposed) return;
    // A caller can modify exposed typed arrays even while a metadata update is
    // already pending; invalidation must not depend on the dirty flag.
    if (isCompressedTextureFormat(this.format)) { this.fallbackInvalid = true; this.fallbackReplacement = null; }
    if (this.contentMarkPending) return;
    this.recordContentChange();
  }

  /** Recreate the upload interpretation without changing retained pixel bytes. */
  public markMetadataNeedsUpdate(): void {
    if (this.disposed || this._needsUpdate) return;
    this._needsUpdate = true;
    this.revision += 1;
  }

  /** Record a distinct source frame even when an earlier frame is still dirty. */
  public recordContentChange(): void {
    if (this.disposed) return;
    if (isCompressedTextureFormat(this.format)) { this.fallbackInvalid = true; this.fallbackReplacement = null; }
    this._needsUpdate = true;
    this.revision += 1;
    this.fullContentRevision = this.revision;
    this.contentMarkPending = true;
  }

  /**
   * threejs-parity ST-03 (L4): optional source-driven poll for live sources
   * (video textures). Devices call it before comparing `revision` on the
   * cached handle, letting a source mark `needsUpdate` when a new frame is
   * ready — per-frame video upload without an app-level driver.
   */
  public pollContentRevision?: () => void;

  /**
   * C-18: the pending sub-region recorded by the last `update`. Consumed by the
   * device's texture upload path and cleared after the re-upload is issued.
   */
  public pendingUpdateRegion: TextureUpdateRegion | null = null;

  /**
   * C-18 (PRD-06 §7.3): replace pixel content in place and bump `revision`.
   *
   * For 2D/array updates the caller keeps ownership of `data` — it is stored by
   * reference, unlike the constructor. The device observes the revision to
   * decide whether to re-upload; `webgl2/TextureUpload.ts` re-uploads with
   * `texSubImage2D`/`texSubImage3D` rather than reallocating. Compressed and
   * 2D mip-mapped textures cannot be updated this way and throw. 3D updates
   * instead delegate to `updateMip(0, ...)`, including its snapshot, retained
   * content and CPU-authority requirements for regions.
   */
  public update(data: TexturePixelData, region?: TextureUpdateRegion | NonNullable<TextureMipUpdateOptions["region"]>): void {
    if (this.disposed) {
      throw new Error("Cannot update a disposed texture");
    }
    if (!this.usage.includes("copy-dst")) throw new Error("Texture updates require copy-dst usage");
    if (this.source) throw new Error("Source-backed textures must be updated through their source, not raw pixels");
    if (isCompressedTextureFormat(this.format)) {
      throw new Error(`Compressed texture format ${this.format} cannot be updated via Texture.update`);
    }
    if (this.dimension === "cube") {
      throw new Error("Cube textures cannot be updated via Texture.update");
    }
    if (this.dimension === "3d") {
      if (region === undefined) this.updateMip(0, data);
      else {
        if (!region || typeof region !== "object" || !("z" in region) || !("depth" in region)) {
          throw new Error("3d texture update regions require z and depth");
        }
        this.updateMip(0, data, { region: region as NonNullable<TextureMipUpdateOptions["region"]> });
      }
      return;
    }
    if (this.format === "depth24") {
      throw new Error("Depth textures cannot be updated via Texture.update");
    }
    if (this.mipLevels.length > 0) {
      throw new Error("Mip-mapped textures cannot be updated via Texture.update; update the flat data path instead");
    }
    if (region && ("z" in region || "depth" in region)) throw new Error("3d texture update coordinates only apply to 3d textures");
    if (this.dimension === "2d-array") {
      validateArrayUpdateData(data, this, region);
    } else if (region) {
      if (region.layer !== undefined) throw new Error("Texture update layer only applies to 2d-array textures");
      validateUpdatePixelData(data, region.width * region.height * bytesPerPixel(this.format), this.format, "texture update region");
      validateUpdateRegion(region, this.width, this.height);
    } else {
      validateUpdatePixelData(data, this.width * this.height * bytesPerPixel(this.format), this.format, "texture update data");
    }
    const partial = region !== undefined || (this.dimension === "2d-array" && data.byteLength < this.width * this.height * this.layers * bytesPerPixel(this.format));
    const merged = partial ? mergeTextureUpdate(this, data, region) : null;
    (this as { data: TexturePixelData | null }).data = data;
    this.pendingUpdateRegion = region ?? null;
    this._needsUpdate = true;
    this.revision += 1;
    if (merged) this.mipOverrides.set("texture:0", merged);
    else this.mipOverrides.delete("texture:0");
    this.mipRevisions.set("texture:0", this.revision);
    this.contentMarkPending = false;
  }
}

function mergeTextureUpdate(texture: Texture, data: TexturePixelData, region?: TextureUpdateRegion): TextureMipLevel {
  const previous = texture.getMipLevel(0)?.data;
  const elements = texture.width * texture.height * (texture.dimension === "2d-array" ? texture.layers : 1) * (texture.format === "r32f" ? 1 : 4);
  const full = previous ? clonePixelData(previous) : texture.format === "rgba32f" || texture.format === "r32f" ? new Float32Array(elements)
    : texture.format === "rgba16f" ? new Uint16Array(elements) : new Uint8Array(elements);
  const dst = new Uint8Array(full.buffer, full.byteOffset, full.byteLength);
  const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const pixelBytes = bytesPerPixel(texture.format);
  if (texture.dimension === "2d-array") {
    const rect = region ?? { x: 0, y: 0, width: texture.width, height: texture.height, layer: 0 };
    const rowBytes = rect.width * pixelBytes;
    const srcPlaneBytes = rowBytes * rect.height;
    const planeCount = src.byteLength / srcPlaneBytes;
    for (let layer = 0; layer < planeCount; layer += 1) {
      for (let y = 0; y < rect.height; y += 1) {
        const srcOffset = layer * srcPlaneBytes + y * rowBytes;
        const dstOffset = (((rect.layer ?? 0) + layer) * texture.height * texture.width + (rect.y + y) * texture.width + rect.x) * pixelBytes;
        dst.set(src.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
      }
    }
  } else {
    const rect = region ?? { x: 0, y: 0, width: texture.width, height: texture.height };
    const rowBytes = rect.width * pixelBytes;
    for (let y = 0; y < rect.height; y += 1) {
      dst.set(src.subarray(y * rowBytes, (y + 1) * rowBytes), ((rect.y + y) * texture.width + rect.x) * pixelBytes);
    }
  }
  return { width: texture.width, height: texture.height, data: full };
}

export interface TextureMipUpdateOptions {
  readonly face?: TextureCubeFace;
  /** Tightly packed texels, x fastest, then rows (y), then depth slices (z). */
  readonly region?: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly layer?: never;
  };
}

export interface TextureUpdateRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Layer index for `2d-array` textures (texSubImage3D). */
  readonly layer?: number;
}

function mergeVolumeTextureUpdate(
  retained: TextureMipLevel,
  data: TexturePixelData,
  region: NonNullable<TextureMipUpdateOptions["region"]>,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat
): TextureMipLevel {
  if (!region || typeof region !== "object") throw new Error("3d texture update requires a valid region");
  const { x, y, z, width: regionWidth, height: regionHeight, depth: regionDepth, layer } = region;
  if (layer !== undefined) throw new Error("3d texture update regions use z, not an array layer");
  if (![x, y, z, regionWidth, regionHeight, regionDepth, width, height, depth].every(Number.isSafeInteger)
    || x < 0 || y < 0 || z < 0 || regionWidth < 1 || regionHeight < 1 || regionDepth < 1) {
    throw new Error("3d texture update region origin and size must be safe non-negative and positive integers");
  }
  if (x + regionWidth > width || y + regionHeight > height || z + regionDepth > depth) {
    throw new Error("3d texture update region exceeds the mip bounds");
  }
  const pixelBytes = bytesPerPixel(format);
  const retainedBytes = width * height * depth * pixelBytes;
  const regionBytes = regionWidth * regionHeight * regionDepth * pixelBytes;
  if (!Number.isSafeInteger(retainedBytes) || !Number.isSafeInteger(regionBytes)) {
    throw new Error("3d texture update dimensions exceed safe byte accounting");
  }
  if (retained.width !== width || retained.height !== height || (retained.depth !== undefined && retained.depth !== depth)) {
    throw new Error("3d texture update requires retained contents matching the mip dimensions");
  }
  validateTexturePixelData(retained.data, width * depth, height, format, "retained 3d mip");
  validateUpdatePixelData(data, regionBytes, format, "3d texture update region");

  // Clone before writing so previous uploads and caller-held mip arrays remain
  // untouched, including when the input aliases the retained pixels.
  const full = clonePixelData(retained.data);
  const dst = new Uint8Array(full.buffer, full.byteOffset, full.byteLength);
  const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const rowBytes = regionWidth * pixelBytes;
  for (let plane = 0; plane < regionDepth; plane += 1) {
    for (let row = 0; row < regionHeight; row += 1) {
      const srcOffset = (plane * regionHeight + row) * rowBytes;
      const dstOffset = (((z + plane) * height + y + row) * width + x) * pixelBytes;
      dst.set(src.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    }
  }
  return { width, height, depth, data: full };
}

function validateUpdateRegion(region: TextureUpdateRegion, textureWidth: number, textureHeight: number): void {
  if (!Number.isInteger(region.x) || !Number.isInteger(region.y) || region.x < 0 || region.y < 0) {
    throw new Error("Texture update region origin must be non-negative integers");
  }
  if (!Number.isInteger(region.width) || !Number.isInteger(region.height) || region.width <= 0 || region.height <= 0) {
    throw new Error("Texture update region size must be positive integers");
  }
  if (region.x + region.width > textureWidth || region.y + region.height > textureHeight) {
    throw new Error("Texture update region exceeds the texture bounds");
  }
}

function validateUpdatePixelData(data: TexturePixelData, expectedBytes: number, format: TextureFormat, label: string): void {
  if (format === "rgba8" && !(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new Error(`${label} for rgba8 textures must be Uint8Array or Uint8ClampedArray`);
  }
  if (format === "rgba16f" && !(data instanceof Uint16Array)) {
    throw new Error(`${label} for rgba16f textures must be Uint16Array half-float data`);
  }
  if ((format === "rgba32f" || format === "r32f") && !(data instanceof Float32Array)) {
    throw new Error(`${label} for ${format} textures must be Float32Array data`);
  }
  if (data.byteLength !== expectedBytes) {
    throw new Error(`${label} for ${format} must contain exactly ${expectedBytes} bytes`);
  }
}

function validateArrayUpdateData(data: TexturePixelData, texture: Texture, region?: TextureUpdateRegion): void {
  if (region) validateUpdateRegion(region, texture.width, texture.height);
  const planeBytes = (region?.width ?? texture.width) * (region?.height ?? texture.height) * bytesPerPixel(texture.format);
  if (data.byteLength === 0 || data.byteLength % planeBytes !== 0) {
    throw new Error(`texture update data for a 2d-array ${texture.format} texture must be a multiple of a layer's ${texture.width * texture.height * bytesPerPixel(texture.format)} bytes`);
  }
  const firstLayer = region?.layer ?? 0;
  if (!Number.isInteger(firstLayer) || firstLayer < 0 || firstLayer + data.byteLength / planeBytes > texture.layers) {
    throw new Error("2d-array update layers exceed texture bounds");
  }
  validateUpdatePixelData(data, data.byteLength, texture.format, "texture update data");
}

export function bytesPerPixel(format: TextureFormat): number {
  switch (format) {
    case "rgba8":
    case "r32f":
      return 4;
    case "rgba16f":
      return 8;
    case "rgba32f":
      return 16;
    case "depth24":
      return 4;
    case "bc1-rgb-unorm":
    case "bc1-rgba-unorm":
    case "bc3-rgba-unorm":
    case "bc7-rgba-unorm":
    case "etc2-rgba8unorm":
    case "etc2-rgb8unorm":
    case "astc-4x4-rgba-unorm":
      return 0;
  }
}

/**
 * Floating-point colour formats.
 *
 * These are not guaranteed mipmap- or linear-filterable in WebGL2 without
 * `OES_texture_float_linear`, so callers must not call `generateMipmap` on them.
 */
export function isFloatColorTextureFormat(format: TextureFormat): boolean {
  return format === "rgba16f" || format === "rgba32f" || format === "r32f";
}

export function isCompressedTextureFormat(format: TextureFormat): format is TextureCompressedFormat {
  return format === "bc1-rgb-unorm" || format === "bc1-rgba-unorm" || format === "bc3-rgba-unorm" || format === "etc2-rgba8unorm" || format === "astc-4x4-rgba-unorm" || format === "bc7-rgba-unorm" || format === "etc2-rgb8unorm";
}

export function compressedTextureByteLength(width: number, height: number, format: TextureCompressedFormat): number {
  const blocksWide = Math.max(1, Math.ceil(width / 4));
  const blocksHigh = Math.max(1, Math.ceil(height / 4));
  return blocksWide * blocksHigh * compressedBlockByteLength(format);
}

export function compressedBlockByteLength(format: TextureCompressedFormat): number {
  switch (format) {
    case "bc1-rgb-unorm":
    case "bc1-rgba-unorm":
    case "etc2-rgb8unorm":
      return 8;
    case "bc3-rgba-unorm":
    case "etc2-rgba8unorm":
    case "astc-4x4-rgba-unorm":
    case "bc7-rgba-unorm":
      return 16;
    default:
      throw new Error(`UNSUPPORTED_COMPRESSED_FORMAT:${format}`);
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
    if (level.depth !== undefined && (!Number.isInteger(level.depth) || level.depth < 1)) {
      throw new Error(`${label} level ${index} depth must be a positive integer`);
    }
    return { width: level.width, height: level.height, ...(level.depth === undefined ? {} : { depth: level.depth }), data: clonePixelData(level.data) };
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
  const mipCount = faces[0]?.mipLevels.length;
  for (const face of faces) {
    if (!expectedFaces.includes(face.face)) {
      throw new Error(`Unsupported cube texture face: ${face.face}`);
    }
    if (seen.has(face.face)) {
      throw new Error(`Duplicate cube texture face: ${face.face}`);
    }
    seen.add(face.face);
    if (face.mipLevels.length !== mipCount) throw new Error("Cube faces must contain the same number of mip levels");
    if (isCompressedTextureFormat(format)) {
      validateMipDimensions(face.mipLevels, width, height, 1, "cube", `cubeFaces.${face.face}.mipLevels`);
      for (const [index, level] of face.mipLevels.entries()) {
        const expected = compressedTextureByteLength(level.width, level.height, format);
        if (!(level.data instanceof Uint8Array) || level.data.byteLength !== expected) throw new Error(`cubeFaces.${face.face} mip ${index} for ${format} must contain ${expected} bytes`);
      }
    } else {
      validateTextureMipLevels(face.mipLevels, width, height, format, `cubeFaces.${face.face}.mipLevels`);
    }
  }
  for (const face of expectedFaces) {
    if (!seen.has(face)) {
      throw new Error(`Missing cube texture face: ${face}`);
    }
  }
}

function mipExtent(size: number, level: number): number {
  return Math.max(1, Math.floor(size / 2 ** level));
}

function validateMipDimensions(levels: readonly TextureMipLevel[], width: number, height: number, depth: number, dimension: TextureDimension, label: string): void {
  if (levels[0]?.width !== width || levels[0]?.height !== height) {
    throw new Error(`${label} first level must match width and height`);
  }
  for (const [index, level] of levels.entries()) {
    if (level.width !== mipExtent(width, index) || level.height !== mipExtent(height, index)) throw new Error(`${label} level ${index} has invalid mip dimensions`);
    if (dimension === "3d" && (level.depth ?? mipExtent(depth, index)) !== mipExtent(depth, index)) throw new Error(`${label} level ${index} has invalid mip depth`);
    if (dimension !== "3d" && level.depth !== undefined) throw new Error(`${label} depth is only valid for 3d textures`);
  }
}

function validateTextureMipLevels(levels: readonly TextureMipLevel[], width: number, height: number, format: TextureFormat, label: string, dimension: TextureDimension = "2d", depth = 1, layers = 1): void {
  validateMipDimensions(levels, width, height, depth, dimension, label);
  for (const [index, level] of levels.entries()) {
    const planes = dimension === "3d" ? mipExtent(depth, index) : layers;
    validateTexturePixelData(level.data, level.width * planes, level.height, format, `${label} level ${index}`);
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
  } else if (format === "rgba32f" || format === "r32f") {
    if (!(data instanceof Float32Array)) {
      throw new Error(`${label} for ${format} textures must be Float32Array data`);
    }
  } else if (format === "depth24") {
    throw new Error(`${label} is not valid for depth24 textures`);
  }
  const expected = width * height * bytesPerPixel(format);
  if (data.byteLength !== expected) {
    throw new Error(`${label} for ${format} textures must contain exactly ${expected} bytes`);
  }
}
