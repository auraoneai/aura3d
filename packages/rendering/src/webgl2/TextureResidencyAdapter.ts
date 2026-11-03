import { RenderDeviceError } from "../RenderDevice";
import { Texture, bytesPerPixel, compressedTextureByteLength, isCompressedTextureFormat, type TexturePixelData } from "../Texture";
import { acquireTextureBudgetLimit, reserveTextureBudget, textureBudgetUsage } from "../textures/TextureBudget";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { resolveCompressedTextureFormatReal, textureUploadFormat } from "./TextureFormats";

/** Byte-backed mip values supplied by a streaming source. */
export interface WebGL2ResidencyMip {
  readonly data: TexturePixelData;
  /** Decoded RGBA8 for a compressed source when its native format cannot be used. */
  readonly fallbackData?: Uint8Array;
}

/** Structural counterpart of the assets controller contract; no rendering-to-assets dependency. */
export interface WebGL2ResidencySource {
  readonly texture: object;
  readonly identity: object;
  /** Material-chosen RGBA bytes in the logical texture's color space. */
  readonly fallback: readonly [number, number, number, number];
  readonly levels: readonly { readonly width: number; readonly height: number; readonly bytes: number }[];
  readonly label?: string;
  loadMip(level: number, signal: AbortSignal): Promise<{ readonly value: WebGL2ResidencyMip; release(): void }>;
}

export interface WebGL2ResidencyAllocation {
  readonly handle: WebGLTexture;
  readonly texture: Texture;
  readonly generation: number;
  readonly bytes: number;
}

interface OwnedAllocation extends WebGL2ResidencyAllocation {
  readonly release: () => void;
  readonly mode: "placeholder" | "compressed" | "fallback" | "uncompressed";
  retirement?: Promise<void>;
  invalid: boolean;
}
interface PreparedTexture {
  readonly identity: object;
  readonly colorSpace: Texture["colorSpace"];
  readonly revision: number;
  readonly selection: Selection;
  readonly fallback: OwnedAllocation;
  current: OwnedAllocation | null;
}

type Selection = { readonly compressed: false; readonly fallback: boolean }
  | { readonly compressed: true; readonly internalFormat: number; readonly fallback: false };

/**
 * WebGL2 storage and binding side of the assets residency controller. A caller
 * must choose a material-compatible fallback; it is not assumed to be white or
 * neutral for every material slot. The controller invokes prepare before the
 * texture can bind, and unprepare after its final resident lease retires.
 */
export class WebGL2TextureResidencyAdapter {
  readonly device: WebGL2DeviceHost["device"];
  private epoch = 0;
  private lost = false;
  private lossNotified = false;
  private notifyingLoss = false;
  private confirmedThrough = -1;
  private restorePending = false;
  private readonly prepared = new Map<Texture, PreparedTexture>();
  private readonly unpreparing = new Set<Texture>();
  private readonly allocations = new Set<OwnedAllocation>();
  private readonly ownedAllocations = new WeakSet<OwnedAllocation>();
  private readonly lostListeners = new Set<() => void>();
  private readonly restoredListeners = new Set<() => void>();

  constructor(private readonly host: WebGL2DeviceHost) { this.device = host.device; }
  generation(): number { return this.epoch; }
  isLost(): boolean { return this.lost || this.host.disposed || this.host.lifecycle.isDeviceLost(); }
  usageBytes(): number { return textureBudgetUsage(this.device); }
  acquireBudgetLimit(maxBytes: number): { setLimit(maxBytes: number): void; release(): void } { return acquireTextureBudgetLimit(maxBytes, this.device); }
  onDeviceLost(listener: () => void): () => void { this.lostListeners.add(listener); return () => this.lostListeners.delete(listener); }
  onDeviceRestored(listener: () => void): () => void { this.restoredListeners.add(listener); return () => this.restoredListeners.delete(listener); }

  /** Published logical textures and their selected compressed representations. */
  diagnostics(): { textures: number; compressedTextures: number; compressedTextureBytes: number; textureFallbacks: number; textureFallbackBytes: number } {
    const result = { textures: 0, compressedTextures: 0, compressedTextureBytes: 0, textureFallbacks: 0, textureFallbackBytes: 0 };
    for (const [texture, prepared] of this.prepared) {
      if (texture.disposed) continue;
      result.textures += 1;
      const allocation = prepared.current;
      if (allocation?.mode === "compressed") { result.compressedTextures += 1; result.compressedTextureBytes += allocation.bytes; }
      if (allocation?.mode === "fallback") { result.textureFallbacks += 1; result.textureFallbackBytes += allocation.bytes; }
    }
    return result;
  }

  prepare(source: WebGL2ResidencySource, options: { readonly maxBytes: number; readonly generation: number }): void {
    this.assertGeneration(options.generation);
    const texture = this.validateSource(source);
    if (this.prepared.has(texture) || this.unpreparing.has(texture)) throw new Error("Texture is already prepared for streaming");
    this.host.textureRegistry.assertCanPrepareStreamedTexture(texture);
    const selection = this.select(texture);
    const pixel = fallbackPixel(texture, source.fallback);
    const bytes = pixel.byteLength;
    const release = this.reserve(bytes, options.maxBytes);
    let allocation: OwnedAllocation | undefined;
    let handle: WebGLTexture | null = null;
    try {
      const gl = this.host.gl;
      handle = gl.createTexture();
      if (!handle) throw new RenderDeviceError("Failed to allocate WebGL streamed fallback", "WEBGL_ALLOCATION_FAILED");
      allocation = { handle, texture, generation: this.epoch, bytes, release, mode: "placeholder", invalid: false };
      this.ownedAllocations.add(allocation);
      this.allocations.add(allocation);
      this.host.textureRegistry.withUnpackState(() => {
        this.host.stateCache.invalidate();
        gl.bindTexture(gl.TEXTURE_2D, handle);
        const format = isCompressedTextureFormat(texture.format)
          ? { internalFormat: texture.colorSpace === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE }
          : textureUploadFormat(gl, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, 1, 1, 0, format.format, format.type, pixel);
        this.configureLevels(1);
      });
      this.assertUpload(options.generation);
      this.host.textureRegistry.prepareStreamedTexture(texture, handle);
      this.prepared.set(texture, { identity: source.identity, colorSpace: texture.colorSpace, revision: texture.revision, selection, fallback: allocation, current: null });
    } catch (error) {
      void this.rollback(allocation, handle, release, options.generation);
      throw error;
    }
  }

  unprepare(source: WebGL2ResidencySource, generation: number): Promise<void> {
    const lost = this.isLost();
    // The context query can dispatch loss/restoration synchronously.
    if (lost || generation !== this.epoch) {
      // A lost flag or disposal alone does not prove that this fallback was
      // retired. Only a completed loss notification covers older generations.
      if (Number.isInteger(generation) && generation >= 0 && generation <= this.confirmedThrough) return Promise.resolve();
      return Promise.reject(new Error("WebGL texture residency generation is lost or stale"));
    }
    if (!(source.texture instanceof Texture)) return Promise.reject(new Error("A Texture is required for streaming"));
    const texture = source.texture;
    const prepared = this.prepared.get(texture);
    if (!prepared) return Promise.reject(new Error("Texture streaming registration is missing; fallback retirement is unverified"));
    if (prepared.identity !== source.identity || prepared.current) return Promise.reject(new Error("Cannot unprepare a texture with a published allocation"));
    if (this.unpreparing.has(texture)) return Promise.reject(new Error("Texture streaming registration is being detached"));
    this.unpreparing.add(texture);
    try {
      this.host.textureRegistry.unprepareStreamedTexture(texture, prepared.fallback.handle);
      if (this.prepared.get(texture) === prepared) this.prepared.delete(texture);
      // A new consumer can prepare another fallback while retirement starts.
      this.finishUnpreparing(texture);
      return this.retireOwned(prepared.fallback);
    } catch (error) { return Promise.reject(error); }
    finally { this.finishUnpreparing(texture); }
  }

  estimate(source: WebGL2ResidencySource, levelCount: number): number {
    const texture = this.validatePrepared(source);
    if (!Number.isSafeInteger(levelCount) || levelCount < 1 || levelCount > source.levels.length) throw new Error("Invalid streamed mip count");
    const selection = this.prepared.get(texture)!.selection;
    let bytes = 0;
    for (const level of source.levels.slice(-levelCount)) {
      bytes += selection.compressed ? compressedTextureByteLength(level.width, level.height, texture.format as Parameters<typeof compressedTextureByteLength>[2])
        : level.width * level.height * (selection.fallback ? 4 : bytesPerPixel(texture.format));
      if (!Number.isSafeInteger(bytes)) throw new Error("Streamed texture allocation exceeds safe integer byte accounting");
    }
    return bytes;
  }

  /** Reservation and the WebGL calls happen before this method returns its promise. */
  allocate(source: WebGL2ResidencySource, levels: readonly { readonly level: number; readonly value: WebGL2ResidencyMip }[], options: { readonly maxBytes: number; readonly signal: AbortSignal }): Promise<{ readonly allocation: WebGL2ResidencyAllocation; readonly bytes: number }> {
    let release: (() => void) | undefined;
    let allocation: OwnedAllocation | undefined;
    let handle: WebGLTexture | null = null;
    const generation = this.epoch;
    try {
      this.assertGeneration(generation);
      if (options.signal.aborted) throw abortError(options.signal);
      const texture = this.validatePrepared(source);
      const count = levels.length;
      const bytes = this.estimate(source, count);
      const selection = this.prepared.get(texture)!.selection;
      const first = source.levels.length - count;
      for (let index = 0; index < count; index += 1) {
        const mip = levels[index]!;
        if (mip.level !== first + index) throw new Error("Streamed mip levels must be a contiguous finest-first tail");
        validatePixels(texture, source.levels[mip.level]!, mip.value, selection);
      }
      const policy = this.host.textureBudgetPolicy;
      const maxDimension = policy?.maxDimension ?? policy?.maxTextureSize;
      if (maxDimension !== undefined && (!Number.isInteger(maxDimension) || maxDimension < 1)) throw new Error("Texture budget maxDimension must be a positive integer");
      if (maxDimension !== undefined && Math.max(source.levels[first]!.width, source.levels[first]!.height) > maxDimension) throw new Error("Streamed mip dimensions exceed the texture budget policy");
      release = this.reserve(bytes, options.maxBytes);
      const gl = this.host.gl;
      handle = gl.createTexture();
      if (!handle) throw new RenderDeviceError("Failed to allocate WebGL streamed texture", "WEBGL_ALLOCATION_FAILED");
      allocation = { handle, texture, generation, bytes, release, mode: selection.compressed ? "compressed" : selection.fallback ? "fallback" : "uncompressed", invalid: false };
      this.ownedAllocations.add(allocation);
      this.allocations.add(allocation);
      this.host.textureRegistry.withUnpackState(() => {
        this.host.stateCache.invalidate();
        gl.bindTexture(gl.TEXTURE_2D, handle);
        for (let index = 0; index < count; index += 1) {
          const mip = levels[index]!;
          const metadata = source.levels[mip.level]!;
          if (selection.compressed) {
            gl.compressedTexImage2D(gl.TEXTURE_2D, index, selection.internalFormat, metadata.width, metadata.height, 0, mip.value.data as Uint8Array);
          } else {
            const format = selection.fallback
              ? { internalFormat: texture.colorSpace === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE }
              : textureUploadFormat(gl, texture);
            gl.texImage2D(gl.TEXTURE_2D, index, format.internalFormat, metadata.width, metadata.height, 0, format.format, format.type, selection.fallback ? mip.value.fallbackData! : mip.value.data);
          }
        }
        this.configureLevels(count);
      });
      this.assertUpload(generation);
      return Promise.resolve({ allocation, bytes });
    } catch (error) {
      if (release) return this.rollback(allocation, handle, release, generation).then(() => { throw error; });
      return Promise.reject(error);
    }
  }

  publish(logicalTexture: object, allocation: WebGL2ResidencyAllocation | null, generation: number): void {
    this.assertGeneration(generation);
    if (!(logicalTexture instanceof Texture) || (logicalTexture.disposed && allocation !== null)) throw new Error("A live Texture is required for streaming");
    const prepared = this.prepared.get(logicalTexture);
    if (!prepared || (allocation !== null && (logicalTexture.colorSpace !== prepared.colorSpace || logicalTexture.revision !== prepared.revision))) throw new Error("Streamed texture is not prepared for its current content and color space");
    const owned = allocation as OwnedAllocation | null;
    if (owned && (!this.allocations.has(owned) || owned.invalid || owned.retirement || owned.texture !== logicalTexture || owned.generation !== generation || owned === prepared.fallback)) {
      throw new Error("Streamed allocation does not belong to this texture and generation");
    }
    this.host.textureRegistry.publishStreamedTexture(logicalTexture, owned?.handle ?? prepared.fallback.handle);
    prepared.current = owned;
  }

  retire(allocation: WebGL2ResidencyAllocation): Promise<void> {
    const owned = allocation as OwnedAllocation;
    if (!this.ownedAllocations.has(owned)) return Promise.reject(new Error("Streamed allocation does not belong to this device"));
    if (owned.retirement) return owned.retirement;
    if (!this.allocations.has(owned)) return Promise.resolve();
    if (this.prepared.get(owned.texture)?.current === owned) return Promise.reject(new Error("Cannot retire a published texture allocation"));
    return this.retireOwned(owned);
  }

  /** Called by the device before notifying its external loss listeners. */
  invalidate(contextLost: boolean): void {
    this.restorePending = false;
    if (!this.lost) { this.lost = true; this.epoch += 1; }
    const invalidatedGeneration = this.epoch - 1;
    this.prepared.clear();
    if (contextLost) {
      // The registry invalidates queued retirements before calling us. Any
      // remaining live names were reclaimed by the lost native context.
      for (const allocation of [...this.allocations]) {
        allocation.invalid = true;
        allocation.release();
        this.allocations.delete(allocation);
      }
      this.notifyLoss(invalidatedGeneration);
      return;
    }
    // Device disposal is not proof that submitted GPU work is finished.
    // Queue every live name; an unavailable fence remains charged until loss.
    const pending = [...this.allocations].map((allocation) => this.retireOwned(allocation));
    void Promise.all(pending).then(() => this.notifyLoss(invalidatedGeneration));
  }

  /** The controller re-prepares its active sources during restoration. */
  restore(): void {
    if (this.host.disposed) return;
    if (this.unpreparing.size || this.notifyingLoss) { this.restorePending = true; return; }
    this.activateRestore();
  }

  private activateRestore(): void {
    this.epoch += 1;
    this.lost = false;
    this.lossNotified = false;
    for (const listener of [...this.restoredListeners]) { try { listener(); } catch { /* Notify other observers. */ } }
  }

  private finishUnpreparing(texture: Texture): void {
    if (this.unpreparing.delete(texture)) this.finishPendingRestore();
  }

  private finishPendingRestore(): void {
    if (!this.restorePending || this.unpreparing.size || this.notifyingLoss) return;
    this.restorePending = false;
    if (!this.host.disposed && !this.host.contextLost) this.activateRestore();
  }

  private assertGeneration(generation: number): void {
    if (this.isLost() || generation !== this.epoch) throw new Error("WebGL texture residency generation is lost or stale");
  }
  private notifyLoss(generation: number): void {
    this.confirmedThrough = Math.max(this.confirmedThrough, generation);
    if (this.lossNotified || !this.lost || this.epoch !== generation + 1) return;
    this.lossNotified = true;
    this.notifyingLoss = true;
    try {
      for (const listener of [...this.lostListeners]) { try { listener(); } catch { /* Notify other observers. */ } }
    } finally {
      this.notifyingLoss = false;
      this.finishPendingRestore();
    }
  }
  private validateSource(source: WebGL2ResidencySource): Texture {
    if (!(source.texture instanceof Texture) || source.texture.disposed) throw new Error("A live Texture is required for streaming");
    const texture = source.texture;
    if (texture.dimension !== "2d" || texture.dynamic || texture.source || texture.format === "depth24" || !texture.usage.includes("sampled") || texture.usage.includes("storage") || texture.usage.includes("render-attachment")) {
      throw new Error("Streaming supports sampled 2D textures without dynamic sources, depth, storage or render attachments");
    }
    if (!source.identity || typeof source.identity !== "object") throw new Error("Streaming requires an object source identity");
    if (!Array.isArray(source.fallback) || source.fallback.length !== 4 || source.fallback.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error("Streaming requires an explicit four-byte RGBA fallback");
    if ((texture.format === "bc1-rgb-unorm" || texture.format === "etc2-rgb8unorm") && source.fallback[3] !== 255) throw new Error("Opaque RGB textures require an opaque fallback");
    if (texture.format === "r32f" && (source.fallback[1] !== 0 || source.fallback[2] !== 0 || source.fallback[3] !== 255)) throw new Error("R32F fallback must have zero green and blue and opaque alpha");
    if (!source.levels.length || source.levels.length !== texture.mipLevelCount) throw new Error("Streamed mip count must match the logical texture mipLevelCount");
    for (let index = 0; index < source.levels.length; index += 1) {
      const mip = source.levels[index]!;
      if (mip.width !== Math.max(1, Math.floor(texture.width / 2 ** index)) || mip.height !== Math.max(1, Math.floor(texture.height / 2 ** index)) || !Number.isSafeInteger(mip.bytes) || mip.bytes < 1) throw new Error("Streamed mip metadata does not match the logical texture");
    }
    if ((texture.format === "rgba16f" || texture.format === "rgba32f" || texture.format === "r32f") && texture.colorSpace !== "linear") throw new Error("Float streamed textures require linear color space");
    // The adapter cannot inspect all material samplers. Without the extension,
    // linear filtering of 32-bit float storage would be texture-incomplete.
    if ((texture.format === "rgba32f" || texture.format === "r32f") && !this.host.gl.getExtension("OES_texture_float_linear")) throw new Error("32-bit float streamed textures require OES_texture_float_linear");
    return texture;
  }
  private validatePrepared(source: WebGL2ResidencySource): Texture {
    this.assertGeneration(this.epoch);
    const texture = this.validateSource(source);
    const prepared = this.prepared.get(texture);
    if (!prepared || prepared.identity !== source.identity || prepared.colorSpace !== texture.colorSpace || prepared.revision !== texture.revision) throw new Error("Streamed texture has not been prepared for this source, content and color space");
    return texture;
  }
  private select(texture: Texture): Selection {
    if (!isCompressedTextureFormat(texture.format)) return { compressed: false, fallback: false };
    // Opaque BC1 RGB may have transparent selectors. The source bytes are not
    // available to estimate, so always require and charge its decoded RGBA.
    if (texture.format === "bc1-rgb-unorm") return { compressed: false, fallback: true };
    const internalFormat = resolveCompressedTextureFormatReal(texture.format, texture.colorSpace, this.host.gl);
    return typeof internalFormat === "number" && Number.isFinite(internalFormat)
      ? { compressed: true, internalFormat, fallback: false } : { compressed: false, fallback: true };
  }
  private reserve(bytes: number, maxBytes: number): () => void {
    const policy = this.host.textureBudgetPolicy;
    return reserveTextureBudget(bytes, Math.min(maxBytes, policy?.maxBytes ?? policy?.textureBudgetBytes ?? Infinity), this.device);
  }
  private configureLevels(count: number): void {
    const gl = this.host.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, count - 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  private assertUpload(generation: number): void {
    this.assertGeneration(generation);
    const error = this.host.lifecycle.readError();
    if (error) throw new RenderDeviceError("WebGL streamed texture upload failed", "TEXTURE_UPLOAD_FAILED", { error });
  }
  private rollback(allocation: OwnedAllocation | undefined, handle: WebGLTexture | null, release: () => void, generation: number): Promise<void> {
    if (handle && generation === this.epoch && !this.isLost()) {
      const pending = this.host.textureRegistry.retireNativeTextures([handle], () => {
        if (allocation) { allocation.invalid = true; this.allocations.delete(allocation); }
        release();
      });
      if (allocation) allocation.retirement = pending;
      return pending;
    }
    if (allocation) { allocation.invalid = true; this.allocations.delete(allocation); }
    release();
    return Promise.resolve();
  }
  private retireOwned(allocation: OwnedAllocation): Promise<void> {
    if (allocation.retirement) return allocation.retirement;
    if (allocation.invalid || !this.allocations.has(allocation)) return Promise.resolve();
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const retirement = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
    // The registry can synchronously reenter loss, disposal or retirement.
    // Publish the same receipt before it can queue this allocation twice.
    allocation.retirement = retirement;
    void retirement.catch(() => undefined);
    try {
      const completion = this.host.textureRegistry.retireNativeTextures([allocation.handle], () => {
        allocation.invalid = true;
        this.allocations.delete(allocation);
        allocation.release();
      });
      if (allocation.retirement === retirement) allocation.retirement = completion;
      void Promise.resolve(completion).then(resolve, reject);
      return completion;
    } catch (error) {
      reject(error);
      throw error;
    }
  }
}

function validatePixels(texture: Texture, metadata: { readonly width: number; readonly height: number }, value: WebGL2ResidencyMip, selection: Selection): void {
  const data = value?.data;
  const pixels = metadata.width * metadata.height;
  if (isCompressedTextureFormat(texture.format)) {
    if (!(data instanceof Uint8Array) || data.byteLength !== compressedTextureByteLength(metadata.width, metadata.height, texture.format)) throw new Error("Invalid compressed streamed mip bytes");
    if (selection.fallback && (!(value.fallbackData instanceof Uint8Array) || value.fallbackData.byteLength !== pixels * 4)) throw new Error("Compressed streamed mip requires its exact decoded RGBA8 fallback");
    if (selection.fallback && (texture.format === "bc1-rgb-unorm" || texture.format === "etc2-rgb8unorm")) {
      for (let offset = 3; offset < value.fallbackData!.length; offset += 4) if (value.fallbackData![offset] !== 255) throw new Error("Opaque RGB mip fallback must have opaque alpha");
    }
    return;
  }
  const validType = texture.format === "rgba8" ? data instanceof Uint8Array || data instanceof Uint8ClampedArray
    : texture.format === "rgba16f" ? data instanceof Uint16Array : data instanceof Float32Array;
  if (!validType || data.byteLength !== pixels * bytesPerPixel(texture.format)) throw new Error("Invalid streamed mip pixel type or byte length");
}

function fallbackPixel(texture: Texture, rgba: readonly [number, number, number, number]): TexturePixelData {
  if (texture.format === "r32f") return new Float32Array([rgba[0] / 255]);
  if (texture.format === "rgba32f") return new Float32Array(rgba.map((value) => value / 255));
  if (texture.format === "rgba16f") return new Uint16Array(rgba.map((value) => floatToHalf(value / 255)));
  return new Uint8Array(rgba);
}

function floatToHalf(value: number): number {
  if (value === 0) return 0;
  const exponent = Math.floor(Math.log2(value));
  if (exponent < -14) return Math.round(value * 2 ** 24);
  const fraction = Math.round((value / 2 ** exponent - 1) * 1024);
  return ((exponent + 15) << 10) + fraction;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Texture residency allocation aborted");
}
