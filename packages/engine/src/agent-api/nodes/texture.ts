/**
 * threejs-parity §6 Lane L4 (docs/workflows/threejs-parity-gaps.md):
 * ST-01 `texture.*` factories, ST-02 handle semantics (three's `Texture`
 * field surface), ST-03 runtime upload (revision-driven), ST-07 real
 * `texture.load` over `@aura3d/assets`.
 *
 * Every factory returns a `TextureHandle` — an `AuraTextureRef` — wrapping a
 * live `R/Texture.ts` `Texture`. Material texture slots accept the handle
 * through the frozen `AuraMaterialTextureInput` union; `AA/compiler/
 * textures.ts` resolves it to `{ texture, sampler, transform }` bindings.
 *
 * Defaults follow three's per-kind conventions: `flipY`/`generateMipmaps`/
 * color space mirror `THREE.Texture`, `CanvasTexture`, `VideoTexture`,
 * `DataTexture`, `CompressedTexture`, `DepthTexture`, `CubeTexture` and
 * `TextureLoader` output respectively.
 */

import {
  Texture,
  isCompressedTextureFormat,
  srgbToLinearChannel,
  type TextureCompressedFormat,
  type TextureCubeFace,
  type TextureCubeFaceDescriptor,
  type TextureFormat,
  type TextureMipUpdateOptions,
  type TexturePixelData
} from "@aura3d/rendering";
import { AssetManager, EXRLoader, ImageLoader, LoadContext, redactAssetUrl, TextureLoader as AssetTextureLoader, type AssetHandle, type AuraEXRTextureData, type TextureDescriptorAsset } from "@aura3d/assets/browser";
import { assetEventScopeForApp, emitAppAssetError, emitAppAssetProgress, safeAssetError } from "../assetEvents.js";
import { AuraRuntimeError } from "../../contracts/runtimeError.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { loadNativeTexture, type AuraNativeTextureLoadOptions, type NativeTextureConversionLimits } from "./loadNativeTexture.js";
import type {
  AuraAssetRef,
  AuraTextureCanvasOptions,
  AuraTextureColorSpace,
  AuraTextureCompressedOptions,
  AuraTextureCubeOptions,
  AuraTextureDataArrayOptions,
  AuraTextureDataOptions,
  AuraTextureDepthOptions,
  AuraTextureLoadOptions,
  AuraTextureMagFilter,
  AuraTextureMinFilter,
  AuraTextureRef,
  AuraTextureVideoOptions,
  AuraTextureWrapMode
} from "./types.js";

const CUBE_FACE_ORDER: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

/** Raw, layer-contiguous RGBA volume pixels. Volume depth halves with each mip. */
export interface AuraTexture3DOptions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly format?: "rgba8" | "rgba16f" | "rgba32f" | "r32f";
  readonly data?: TexturePixelData;
  readonly mipmaps?: readonly { readonly width: number; readonly height: number; readonly depth?: number; readonly data: TexturePixelData }[];
  readonly mipLevelCount?: number;
  readonly colorSpace?: AuraTextureColorSpace;
}

/** A device storage texture can also be sampled and copied after synchronization. */
export interface AuraTextureStorageOptions {
  readonly width: number;
  readonly height: number;
  readonly dimension?: "2d" | "2d-array" | "3d";
  /** Layer count for arrays, volume depth for 3D; omit for 2D. */
  readonly depth?: number;
  readonly format?: "rgba8" | "rgba16f" | "rgba32f" | "r32f";
  readonly mipLevelCount?: number;
}

export interface AuraTextureCompressedCubeOptions {
  readonly format: string;
  readonly colorSpace?: AuraTextureColorSpace;
  readonly faces: readonly { readonly face: TextureCubeFace; readonly mipmaps: readonly { readonly width: number; readonly height: number; readonly data: Uint8Array }[] }[];
}

/** Structural input accepted from `@aura3d/assets/importers` NativeImageAsset. */
export interface NativeImageTextureSource {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
  readonly levels: readonly {
    readonly width: number;
    readonly height: number;
    readonly encoding: string;
    readonly data: Uint8Array | Uint16Array | Float32Array;
  }[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly string[];
}

/** Live video/canvas/image sources accepted by the source-based factories. */
type TextureImageSource = TexImageSource;

interface VideoLikeSource {
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  readonly width?: number;
  readonly height?: number;
  readonly readyState?: number;
  readonly currentTime?: number;
}

let nextTextureHandleId = 1;

/**
 * Handle → device texture backings. The frozen `AuraTextureRef` type cannot
 * carry the `Texture`, so the compiler resolves it through this registry —
 * `resolveAuraTextureRef` in `compiler/textures.ts` is the only consumer.
 */
const textureHandleBackings = new WeakMap<AuraTextureRef, Texture>();

/** Distinguish an unbacked reference from a handle whose owned texture was disposed. */
export function auraTextureRefBackingStatus(ref: AuraTextureRef): "missing" | "disposed" | "live" {
  const backing = textureHandleBackings.get(ref);
  return backing === undefined ? "missing" : backing.disposed ? "disposed" : "live";
}

/** Internal bridge (compiler/textures.ts): the live `Texture` behind a ref. */
export function auraTextureRefTexture(ref: AuraTextureRef | null | undefined): Texture | null {
  if (!ref || ref.kind !== "aura-texture-ref") return null;
  const backing = textureHandleBackings.get(ref);
  return backing && !backing.disposed ? backing : null;
}

/**
 * ST-02: live handle for a user-created texture — three's `Texture` field
 * surface (`wrapS/T`, `repeat`, `offset`, `rotation`, `center`, filters,
 * `anisotropy`, `generateMipmaps`, `colorSpace`, `flipY`, `needsUpdate`,
 * `dispose`). `AuraTextureRef` (frozen, `nodes/types.ts`) is what material
 * texture slots and `AuraUniformValue` accept.
 *
 * Upload-facing fields (`colorSpace`, `flipY`, `generateMipmaps`,
 * `needsUpdate`) write through to the backing `Texture` and mark it dirty;
 * sampling/transform fields are compiled into the slot's sampler and
 * `AuraTextureTransform` by `resolveAuraTextureRef`.
 */
export class TextureHandle implements AuraTextureRef {
  readonly kind = "aura-texture-ref" as const;
  readonly id: string;
  wrapS: AuraTextureWrapMode = "clamp";
  wrapT: AuraTextureWrapMode = "clamp";
  repeat: readonly [number, number] = [1, 1];
  offset: readonly [number, number] = [0, 0];
  rotation = 0;
  center: readonly [number, number] = [0, 0];
  anisotropy = 1;
  minFilter: AuraTextureMinFilter = "linear-mipmap-linear";
  magFilter: AuraTextureMagFilter = "linear";

  /** The backing device texture — do not mutate it from user code. */
  readonly texture: Texture;
  /** Source and backend caveats for adapters that preserve imported assets. */
  readonly diagnostics: readonly string[];

  constructor(
    texture: Texture,
    defaults: {
      readonly wrapS?: AuraTextureWrapMode;
      readonly wrapT?: AuraTextureWrapMode;
      readonly anisotropy?: number;
      readonly minFilter?: AuraTextureMinFilter;
      readonly magFilter?: AuraTextureMagFilter;
      readonly diagnostics?: readonly string[];
    } = {}
  ) {
    this.texture = texture;
    this.diagnostics = Object.freeze([...(defaults.diagnostics ?? [])]);
    this.id = `texture-${nextTextureHandleId++}`;
    if (defaults.wrapS !== undefined) this.wrapS = defaults.wrapS;
    if (defaults.wrapT !== undefined) this.wrapT = defaults.wrapT;
    if (defaults.anisotropy !== undefined) this.anisotropy = defaults.anisotropy;
    if (defaults.minFilter !== undefined) this.minFilter = defaults.minFilter;
    if (defaults.magFilter !== undefined) this.magFilter = defaults.magFilter;
    textureHandleBackings.set(this, texture);
  }

  get colorSpace(): AuraTextureColorSpace {
    return this.texture.colorSpace;
  }

  set colorSpace(value: AuraTextureColorSpace) {
    if (this.texture.colorSpace === value) return;
    this.texture.colorSpace = value;
    this.texture.markMetadataNeedsUpdate();
  }

  get flipY(): boolean {
    return this.texture.flipY;
  }

  set flipY(value: boolean) {
    if (this.texture.flipY === value) return;
    this.texture.flipY = value;
    this.texture.markMetadataNeedsUpdate();
  }

  get generateMipmaps(): boolean {
    return this.texture.generateMipmaps;
  }

  set generateMipmaps(value: boolean) {
    if (this.texture.generateMipmaps === value) return;
    this.texture.generateMipmaps = value;
    this.texture.markMetadataNeedsUpdate();
  }

  /**
   * ST-03: set after mutating pixels/source. Bumps the device revision
   * exactly once per dirty cycle; the device clears it once the revision
   * has been uploaded.
   */
  get needsUpdate(): boolean {
    return this.texture.needsUpdate;
  }

  set needsUpdate(value: boolean) {
    this.texture.needsUpdate = value;
  }

  /** Replace a mip or a CPU-retained 3D region without regenerating other levels. */
  updateMip(level: number, data: TexturePixelData, options: TextureMipUpdateOptions = {}): void {
    this.texture.updateMip(level, data, options);
  }

  dispose(): void {
    this.texture.dispose();
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AuraRuntimeError("unsupported-texture", `texture.${label} must be a positive integer (got ${value})`);
  }
}

function imageSourceDimensions(source: object): { readonly width: number; readonly height: number } {
  const candidate = source as VideoLikeSource;
  const width = candidate.videoWidth ?? candidate.width;
  const height = candidate.videoHeight ?? candidate.height;
  requirePositiveInteger(typeof width === "number" ? width : 0, "canvas/video width");
  requirePositiveInteger(typeof height === "number" ? height : 0, "canvas/video height");
  return { width: width as number, height: height as number };
}

/**
 * Expand single- and three-channel u8 data into the RGBA8 the device supports
 * (three's R8Format/LuminanceFormat read as the luminance triple; RGBFormat
 * gains an opaque alpha).
 */
function expandToRgba8(data: Uint8Array | Uint8ClampedArray, channels: 1 | 3, width: number, height: number): Uint8Array {
  const pixelCount = width * height;
  const out = new Uint8Array(pixelCount * 4);
  if (channels === 1) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const value = data[pixel] ?? 0;
      const base = pixel * 4;
      out[base] = value;
      out[base + 1] = value;
      out[base + 2] = value;
      out[base + 3] = 255;
    }
  } else {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const base = pixel * 4;
      const src = pixel * 3;
      out[base] = data[src] ?? 0;
      out[base + 1] = data[src + 1] ?? 0;
      out[base + 2] = data[src + 2] ?? 0;
      out[base + 3] = 255;
    }
  }
  return out;
}

function normalizeDataTexture(options: AuraTextureDataOptions): { readonly width: number; readonly height: number; readonly data: TexturePixelData; readonly format: TextureFormat } {
  requirePositiveInteger(options.width, "data width");
  requirePositiveInteger(options.height, "data height");
  const format = options.format ?? "rgba8";
  if (format === "depth24") {
    throw new AuraRuntimeError(
      "unsupported-texture",
      "texture.data does not carry depth24 pixel data — use texture.depth({width,height}) for depth attachments"
    );
  }
  if (format === "rgb8" || format === "r8") {
    if (!(options.data instanceof Uint8Array) && !(options.data instanceof Uint8ClampedArray)) {
      throw new AuraRuntimeError("unsupported-texture", `texture.data ${format} requires 8-bit data`);
    }
    const channels = format === "r8" ? 1 : 3;
    const expected = options.width * options.height * channels;
    if (options.data.byteLength !== expected) {
      throw new AuraRuntimeError("unsupported-texture", `texture.data ${format} requires exactly ${expected} bytes for ${options.width}x${options.height}`);
    }
    return { width: options.width, height: options.height, data: expandToRgba8(options.data, channels, options.width, options.height), format: "rgba8" };
  }
  let data: TexturePixelData;
  if (options.data instanceof Uint32Array) {
    // Packed RGBA words — reinterpret the bytes (three accepts Uint32Array
    // for packed formats; RGBA8 keeps the byte content verbatim).
    data = new Uint8Array(options.data.buffer, options.data.byteOffset, options.data.byteLength);
  } else {
    data = options.data;
  }
  const expectedBytes: Record<string, number | undefined> = {
    rgba8: options.width * options.height * 4,
    rgba16f: options.width * options.height * 8,
    rgba32f: options.width * options.height * 16
  };
  const requiredFormat: Record<string, string | undefined> = {
    rgba8: "Uint8Array/Uint8ClampedArray",
    rgba16f: "Uint16Array half floats",
    rgba32f: "Float32Array"
  };
  const expected = expectedBytes[format];
  if (expected === undefined) {
    throw new AuraRuntimeError("unsupported-texture", `texture.data format "${format}" is not a supported pixel format`);
  }
  if (data.byteLength !== expected) {
    throw new AuraRuntimeError("unsupported-texture", `texture.data ${format} requires exactly ${expected} bytes for ${options.width}x${options.height} (got ${data.byteLength})`);
  }
  if (format === "rgba16f" && !(data instanceof Uint16Array)) {
    throw new AuraRuntimeError("unsupported-texture", `texture.data rgba16f requires ${requiredFormat[format]}`);
  }
  if (format === "rgba32f" && !(data instanceof Float32Array)) {
    throw new AuraRuntimeError("unsupported-texture", `texture.data rgba32f requires ${requiredFormat[format]}`);
  }
  if (format === "rgba8" && !(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new AuraRuntimeError("unsupported-texture", `texture.data rgba8 requires ${requiredFormat[format]}`);
  }
  return { width: options.width, height: options.height, data, format: format as TextureFormat };
}

/** threejs-parity ST-03: mark the texture dirty when the video frame advances. */
function attachVideoSourcePolling(texture: Texture): void {
  let lastTime = Number.NaN;
  let lastReadyState = -1;
  texture.pollContentRevision = () => {
    // Read through the backing texture so a retained callback cannot keep the
    // borrowed video alive after that texture has released its source.
    const source = texture.source as VideoLikeSource | null;
    if (texture.disposed || source === null) return;
    const time = typeof source.currentTime === "number" ? source.currentTime : Number.NaN;
    // readyState 2 == HAVE_CURRENT_DATA; sources without the field
    // (mock/test video elements) are treated as always-current.
    const readyState = typeof source.readyState === "number" ? source.readyState : 4;
    if (readyState < 2) {
      lastReadyState = readyState;
      return;
    }
    if ((!Number.isFinite(time) || time !== lastTime) || readyState !== lastReadyState) {
      lastTime = time;
      lastReadyState = readyState;
      texture.recordContentChange();
    }
  };
}

const COMPRESSED_FORMAT_ALIASES: Readonly<Record<string, TextureCompressedFormat>> = {
  "bc1-rgb-unorm": "bc1-rgb-unorm",
  "bc1-rgb": "bc1-rgb-unorm",
  "bc1-rgba-unorm": "bc1-rgba-unorm",
  bc1: "bc1-rgba-unorm",
  dxt1: "bc1-rgba-unorm",
  "bc3-rgba-unorm": "bc3-rgba-unorm",
  bc3: "bc3-rgba-unorm",
  dxt5: "bc3-rgba-unorm",
  "bc7-rgba-unorm": "bc7-rgba-unorm",
  bc7: "bc7-rgba-unorm",
  "etc2-rgba8unorm": "etc2-rgba8unorm",
  "etc2-rgb8unorm": "etc2-rgb8unorm",
  etc2: "etc2-rgba8unorm",
  "astc-4x4-rgba-unorm": "astc-4x4-rgba-unorm",
  astc: "astc-4x4-rgba-unorm",
  astc4x4: "astc-4x4-rgba-unorm"
};

function normalizeCompressedFormat(format: string): TextureCompressedFormat {
  const normalized = COMPRESSED_FORMAT_ALIASES[format.toLowerCase()] ?? (isCompressedTextureFormat(format as TextureFormat) ? format as TextureCompressedFormat : undefined);
  if (!normalized) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `texture.compressed format "${format}" is not a supported compressed texture format (bc1/bc3/bc7/etc2/astc-4x4)`
    );
  }
  return normalized;
}

interface CubeFacePixels {
  readonly width: number;
  readonly height: number;
  readonly data: TexturePixelData;
  readonly format: TextureFormat;
}

function normalizeCubeFacePixels(face: unknown, faceIndex: number): CubeFacePixels {
  if (face && typeof face === "object" && !(face instanceof ArrayBuffer) && !ArrayBuffer.isView(face)) {
    const descriptor = face as { readonly width?: unknown; readonly height?: unknown; readonly data?: unknown; readonly format?: unknown };
    if (descriptor.data !== undefined) {
      const data = descriptor.data;
      if (!ArrayBuffer.isView(data)) {
        throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} data must be a typed pixel array`);
      }
      if (typeof descriptor.width !== "number" || typeof descriptor.height !== "number") {
        throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} requires explicit width and height`);
      }
      const format = (typeof descriptor.format === "string" ? descriptor.format : undefined) as TextureFormat | undefined;
      return { width: descriptor.width, height: descriptor.height, data: data as TexturePixelData, format: format ?? "rgba8" };
    }
    // Image sources (canvas/image/bitmap): read back through a 2d canvas.
    const dims = imageSourceDimensions(face);
    const canvas = createCubeFaceReadbackCanvas(dims.width, dims.height);
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) {
      throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} could not get a 2d context for pixel readback`);
    }
    context.drawImage(face as CanvasImageSource, 0, 0, dims.width, dims.height);
    const pixels = context.getImageData(0, 0, dims.width, dims.height);
    return { width: dims.width, height: dims.height, data: new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), format: "rgba8" };
  }
  if (ArrayBuffer.isView(face)) {
    // Bare typed array — infer a square rgba8 face (or float formats).
    const data = face as TexturePixelData;
    const bytesPerTexel = data instanceof Uint16Array ? 8 : data instanceof Float32Array ? 16 : 4;
    if (data.byteLength % bytesPerTexel !== 0) {
      throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} byte length ${data.byteLength} is not a multiple of ${bytesPerTexel}`);
    }
    const texels = data.byteLength / bytesPerTexel;
    const side = Math.round(Math.sqrt(texels));
    if (side * side !== texels) {
      throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} (${texels} texels) is not square; pass {width,height,data}`);
    }
    return { width: side, height: side, data, format: data instanceof Uint16Array ? "rgba16f" : data instanceof Float32Array ? "rgba32f" : "rgba8" };
  }
  throw new AuraRuntimeError("unsupported-texture", `texture.cube face ${faceIndex} must be a typed pixel array, {width,height,data} or an image source`);
}

function createCubeFaceReadbackCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  const offscreen = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (offscreen) return new offscreen(width, height);
  if (typeof document === "undefined") {
    throw new AuraRuntimeError("unsupported-texture", "texture.cube image faces require a DOM or OffscreenCanvas");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * AD-03: EXR output may carry 1 or 2 channels; device textures are RGBA —
 * replicate luminance into RGB (alpha stays 1) like three's `shouldExpand`.
 */
function expandExrChannels(decoded: AuraEXRTextureData): Uint16Array | Float32Array {
  const pixelCount = decoded.width * decoded.height;
  const src = decoded.data;
  if (decoded.data instanceof Float32Array) {
    const out = new Float32Array(pixelCount * 4);
    for (let p = 0; p < pixelCount; p += 1) {
      const v = decoded.channels === 1 ? src[p]! : src[p * 2]!;
      out[p * 4] = v;
      out[p * 4 + 1] = decoded.channels === 1 ? v : src[p * 2 + 1]!;
      out[p * 4 + 2] = decoded.channels === 1 ? v : 0;
      out[p * 4 + 3] = 1;
    }
    return out;
  }
  const half1 = 0x3c00;
  const out = new Uint16Array(pixelCount * 4);
  for (let p = 0; p < pixelCount; p += 1) {
    const v = decoded.channels === 1 ? src[p]! : src[p * 2]!;
    out[p * 4] = v;
    out[p * 4 + 1] = decoded.channels === 1 ? v : src[p * 2 + 1]!;
    out[p * 4 + 2] = decoded.channels === 1 ? v : 0;
    out[p * 4 + 3] = half1;
  }
  return out;
}

// Limit the source plus the temporary and retained snapshots created here.
// NativeImageAsset is public and can also be constructed without its loader.
const NATIVE_IMAGE_TEXTURE_MAX_WORKING_BYTES = 256 * 1024 * 1024;
const NATIVE_IMAGE_TEXTURE_MAX_PIXELS = 32 * 1024 * 1024;

function nativeImageError(message: string): never {
  throw new AuraRuntimeError("unsupported-texture", `texture.fromNativeImage: ${message}`);
}

/** Decode S3TC RGB DXT1 to opaque RGBA8 without changing its color encoding.
 * https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_compression_s3tc.txt
 */
function decodeOpaqueBc1(data: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const rgb565 = (value: number): readonly [number, number, number] => [
    Math.round(((value >>> 11) & 31) * 255 / 31),
    Math.round(((value >>> 5) & 63) * 255 / 63),
    Math.round((value & 31) * 255 / 31)
  ];
  for (let by = 0; by < blocksHigh; by += 1) for (let bx = 0; bx < blocksWide; bx += 1) {
    const base = (by * blocksWide + bx) * 8;
    const c0 = data[base]! | data[base + 1]! << 8;
    const c1 = data[base + 2]! | data[base + 3]! << 8;
    const a = rgb565(c0), b = rgb565(c1);
    const palette: readonly (readonly number[])[] = [a, b,
      a.map((channel, i) => Math.floor((c0 > c1 ? 2 * channel + b[i]! : channel + b[i]!) / (c0 > c1 ? 3 : 2))),
      c0 > c1 ? a.map((channel, i) => Math.floor((channel + 2 * b[i]!) / 3)) : [0, 0, 0]
    ];
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
      const px = bx * 4 + x, py = by * 4 + y;
      if (px >= width || py >= height) continue;
      const pixel = y * 4 + x;
      const selector = (data[base + 4 + (pixel >>> 2)]! >>> ((pixel & 3) * 2)) & 3;
      const color = palette[selector]!;
      const dest = (py * width + px) * 4;
      result[dest] = color[0]!;
      result[dest + 1] = color[1]!;
      result[dest + 2] = color[2]!;
      result[dest + 3] = 255;
    }
  }
  return result;
}

function nativeImageTransform(metadata: Readonly<Record<string, unknown>>): { repeat: readonly [number, number]; offset: readonly [number, number] } {
  if (metadata.uvTransform === undefined) return { repeat: [1, 1], offset: [0, 0] };
  const transform = metadata.uvTransform;
  if (!transform || typeof transform !== "object") nativeImageError("invalid UV orientation metadata");
  const { scale, offset } = transform as { scale?: unknown; offset?: unknown };
  if (!Array.isArray(scale) || !Array.isArray(offset) || scale.length !== 2 || offset.length !== 2
    || ![...scale, ...offset].every((value) => typeof value === "number" && Number.isFinite(value))) {
    nativeImageError("invalid UV orientation metadata");
  }
  return { repeat: [scale[0], scale[1]], offset: [offset[0], offset[1]] };
}

/** The importer expands supported PVR UNORM16 layouts into RGBA order. */
function isPvrUnorm16PixelFormat(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => Number.isSafeInteger(item) && item >= 0 && item <= 0xffffffff)) return false;
  const [channels, bits] = value as [number, number];
  const widths = Array.from({ length: 4 }, (_, i) => (bits >>> (8 * i)) & 255);
  const count = widths.filter((width) => width !== 0).length;
  if (count < 1 || widths.slice(0, count).some((width) => width !== 16) || widths.slice(count).some(Boolean)) return false;
  const names = Array.from({ length: count }, (_, i) => String.fromCharCode((channels >>> (8 * i)) & 255));
  return names.every((name) => "rgba".includes(name)) && new Set(names).size === names.length;
}

function textureFromNativeImage(asset: NativeImageTextureSource, limits?: NativeTextureConversionLimits): TextureHandle {
  if (!asset || typeof asset !== "object" || !asset.metadata || typeof asset.metadata !== "object" || !Array.isArray(asset.diagnostics) || !asset.diagnostics.every((entry) => typeof entry === "string")) nativeImageError("an image asset with metadata and diagnostics is required");
  requirePositiveInteger(asset.width, "native image width");
  requirePositiveInteger(asset.height, "native image height");
  if (!Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) || asset.width * asset.height > NATIVE_IMAGE_TEXTURE_MAX_PIXELS) nativeImageError("dimensions exceed the pixel limit");
  if (asset.colorSpace !== "linear" && asset.colorSpace !== "srgb") nativeImageError("invalid color space");
  if (!Array.isArray(asset.levels) || asset.levels.length < 1 || asset.levels.length > Math.floor(Math.log2(Math.max(asset.width, asset.height))) + 1) nativeImageError("invalid mip count");

  const metadata = asset.metadata;
  const pixelFormat = metadata.pixelFormat;
  if (asset.format === "pvr") {
    if (metadata.flags !== undefined && (!Number.isSafeInteger(metadata.flags) || (metadata.flags as number) < 0 || (metadata.flags as number) > 0xffffffff)) nativeImageError("invalid PVR flags");
    if (pixelFormat !== undefined && (!Array.isArray(pixelFormat) || pixelFormat.length !== 2 || !pixelFormat.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff))) nativeImageError("invalid PVR pixel format");
    if (metadata.metadata !== undefined && !(metadata.metadata instanceof Uint8Array)) nativeImageError("invalid PVR orientation metadata");
    if (metadata.metadata instanceof Uint8Array && metadata.metadata.length > 0) nativeImageError("PVR metadata orientation has not been interpreted; normalize it before texture creation");
  }
  // PVR's existing importer recognizes both the premultiplied flag and the
  // DXT2/DXT4 pixel-format identifiers. Other formats retain their rejection.
  const pvrPremultiplied = asset.format === "pvr" && ((typeof metadata.flags === "number" && (metadata.flags & 2) !== 0)
    || (Array.isArray(pixelFormat) && pixelFormat[1] === 0 && (pixelFormat[0] === 8 || pixelFormat[0] === 10)));
  if (metadata.attributeType === 4 || (metadata.alphaMode === "premultiplied" && !pvrPremultiplied)) nativeImageError("premultiplied pixels require an explicit straight-alpha conversion before texture creation");
  if (pvrPremultiplied && metadata.alphaMode !== undefined && metadata.alphaMode !== "premultiplied") nativeImageError("conflicting PVR premultiplied alpha metadata");
  if (metadata.alphaMode === "custom" || metadata.attributeType === 2) nativeImageError("application-defined alpha must be resolved before texture creation");
  const opaque = metadata.alphaMode === "opaque";
  const encoding = asset.levels[0]?.encoding;
  if (typeof encoding !== "string") nativeImageError("the first mip requires an encoding");
  const pvrUnorm16 = asset.format === "pvr" && encoding === "rgba16";
  if (pvrUnorm16 && (metadata.channelType !== 4 || !isPvrUnorm16PixelFormat(pixelFormat))) nativeImageError("PVR RGBA16 requires unsigned-normalized 16-bit source channels");
  const convertedLimit = limits?.maxDecodedBytes ?? NATIVE_IMAGE_TEXTURE_MAX_WORKING_BYTES;
  if (!Number.isSafeInteger(convertedLimit) || convertedLimit < 1 || convertedLimit > NATIVE_IMAGE_TEXTURE_MAX_WORKING_BYTES) nativeImageError("invalid converted pixel byte limit");
  const formats: Readonly<Record<string, TextureFormat>> = {
    rgba8: "rgba8", rgba32f: "rgba32f", "bc1-rgb": "bc1-rgb-unorm", bc1: "bc1-rgba-unorm",
    bc3: "bc3-rgba-unorm", "etc2-rgb": "etc2-rgb8unorm", "etc2-rgba": "etc2-rgba8unorm"
  };
  let format = pvrUnorm16 ? "rgba32f" as const : formats[encoding];
  if (!format) nativeImageError(`encoding ${encoding} is not uploadable; request an RGBA8 decode or provide a transcoder`);
  if (opaque && encoding === "bc1") format = "bc1-rgb-unorm";
  else if (opaque && isCompressedTextureFormat(format) && format !== "bc1-rgb-unorm") nativeImageError("opaque alpha for this compressed format requires an RGBA8 decode");
  if (format === "rgba32f" && asset.colorSpace !== "linear" && !pvrUnorm16) nativeImageError("RGBA32F uploads require linear color space");
  const orientation = nativeImageTransform(metadata);
  let sourceBytes = 0, fallbackBytes = 0, convertedBytes = 0;
  for (const [index, level] of asset.levels.entries()) {
    const width = Math.max(1, Math.floor(asset.width / 2 ** index));
    const height = Math.max(1, Math.floor(asset.height / 2 ** index));
    if (!level || level.width !== width || level.height !== height || level.encoding !== encoding) nativeImageError(`mip ${index} has inconsistent dimensions or encoding`);
    const expected = pvrUnorm16 ? width * height * 8 : isCompressedTextureFormat(format)
      ? Math.ceil(width / 4) * Math.ceil(height / 4) * (format === "bc1-rgb-unorm" || format === "bc1-rgba-unorm" || format === "etc2-rgb8unorm" ? 8 : 16)
      : width * height * (format === "rgba32f" ? 16 : 4);
    if ((pvrUnorm16 ? !(level.data instanceof Uint16Array) : format === "rgba32f" ? !(level.data instanceof Float32Array) : !(level.data instanceof Uint8Array)) || level.data.byteLength !== expected) nativeImageError(`mip ${index} has invalid pixel or block bytes`);
    sourceBytes += expected;
    if (pvrUnorm16) convertedBytes += width * height * 16;
    if (format === "bc1-rgb-unorm") fallbackBytes += width * height * 4;
    const retainedBytes = (pvrUnorm16 ? convertedBytes : sourceBytes) + fallbackBytes;
    if (retainedBytes > convertedLimit) nativeImageError(pvrUnorm16
      ? "converted mip pixels exceed the decoded-byte limit"
      : "retained mip pixels and decoded fallback exceed the decoded-byte limit");
    if (3 * (sourceBytes + fallbackBytes + convertedBytes) > NATIVE_IMAGE_TEXTURE_MAX_WORKING_BYTES) nativeImageError("mip snapshots and decoded fallback exceed the allocation limit");
    if (level.data instanceof Float32Array && level.data.some((value: number) => !Number.isFinite(value))) nativeImageError(`mip ${index} contains non-finite pixels`);
  }
  // A premultiplied pixel with full alpha is already straight. For transparent
  // linear RGBA8, validate every mip before allocating a conversion snapshot.
  // Non-opaque sRGB/16-bit and compressed uploads need additional contracts.
  const straighten = asset.levels.map(() => false);
  if (pvrPremultiplied) {
    if (encoding !== "rgba8" && !pvrUnorm16) nativeImageError("premultiplied PVR compressed pixels require an RGBA8 decode");
    for (const [index, level] of asset.levels.entries()) {
      const pixels = level.data as Uint8Array | Uint16Array;
      const fullAlpha = pvrUnorm16 ? 65535 : 255;
      for (let p = 0; p < pixels.length; p += 4) {
        const alpha = pixels[p + 3]!;
        if (alpha === fullAlpha) continue;
        if (pvrUnorm16 || asset.colorSpace !== "linear") nativeImageError("premultiplied PVR transparent pixels require linear RGBA8 data");
        if (pixels[p]! > alpha || pixels[p + 1]! > alpha || pixels[p + 2]! > alpha) nativeImageError(`premultiplied PVR mip ${index} has a color channel greater than alpha`);
        straighten[index] = true;
      }
    }
  }
  const levels = asset.levels.map((level, index) => {
    if (pvrUnorm16) {
      const source = level.data as Uint16Array;
      const data = new Float32Array(source.length);
      for (let i = 0; i < source.length; i += 1) {
        const channel = source[i]! / 65535;
        data[i] = i % 4 === 3 ? (opaque ? 1 : channel) : asset.colorSpace === "srgb" ? srgbToLinearChannel(channel) : channel;
      }
      return { width: level.width, height: level.height, data };
    }
    if (straighten[index]) {
      const data = (level.data as Uint8Array).slice();
      for (let p = 0; p < data.length; p += 4) {
        const alpha = data[p + 3]!;
        if (alpha === 0) { data[p] = 0; data[p + 1] = 0; data[p + 2] = 0; }
        else if (alpha !== 255) for (let c = 0; c < 3; c += 1) data[p + c] = Math.round(data[p + c]! * 255 / alpha);
      }
      return { width: level.width, height: level.height, data };
    }
    if (!opaque || isCompressedTextureFormat(format)) return { width: level.width, height: level.height, data: level.data };
    const data = level.data.slice() as Uint8Array | Float32Array;
    for (let i = 3; i < data.length; i += 4) data[i] = data instanceof Float32Array ? 1 : 255;
    return { width: level.width, height: level.height, data };
  });
  const fallbackMipLevels = format === "bc1-rgb-unorm"
    ? asset.levels.map((level) => ({ width: level.width, height: level.height, data: decodeOpaqueBc1(level.data as Uint8Array, level.width, level.height) }))
    : undefined;
  const diagnostics = [...asset.diagnostics];
  if (pvrPremultiplied) diagnostics.push(straighten.some(Boolean)
    ? "Linear premultiplied PVR RGBA8 was converted to straight alpha; RGB recovery is quantized"
    : "Premultiplied PVR pixels were verified fully opaque; alpha association does not change the pixels");
  if (pvrUnorm16) diagnostics.push("PVR unsigned-normalized 16-bit pixels were converted to linear RGBA32F; nearest filtering is used, and some WebGPU paths require float32-filterable");
  if (metadata.generateMipmaps === true) diagnostics.push("The requested generated mip pyramid was not created; only supplied levels are used");
  if (format === "bc1-rgb-unorm") diagnostics.push("BC1 RGB uses an opaque RGBA8 fallback on WebGPU and when WebGL cannot safely preserve opaque alpha");
  else if (isCompressedTextureFormat(format)) diagnostics.push("This compressed image has no decoded fallback and requires a compatible device format");
  const handle = new TextureHandle(new Texture({
    width: asset.width, height: asset.height, format, colorSpace: pvrUnorm16 ? "linear" : asset.colorSpace,
    mipLevels: levels, fallbackMipLevels, flipY: false, generateMipmaps: false, label: `texture.fromNativeImage:${asset.format}`
  }), {
    minFilter: pvrUnorm16 && levels.length > 1 ? "nearest-mipmap-nearest" : format === "rgba32f" ? "nearest" : levels.length > 1 ? "linear-mipmap-linear" : "linear",
    magFilter: format === "rgba32f" ? "nearest" : "linear",
    diagnostics
  });
  handle.repeat = orientation.repeat;
  handle.offset = orientation.offset;
  return handle;
}

/** Shared engine asset manager for `texture.load` (image + texture loaders). */
let sharedTextureAssetManager: AssetManager | null = null;

function sharedTextureAssets(): AssetManager {
  if (!sharedTextureAssetManager) {
    sharedTextureAssetManager = new AssetManager();
    sharedTextureAssetManager.register(new ImageLoader());
    sharedTextureAssetManager.register(new AssetTextureLoader());
  }
  return sharedTextureAssetManager;
}

/** Test hook: replace the shared manager (custom loaders/baseUrl). */
export function setTextureAssetManager(manager: AssetManager | null): void {
  sharedTextureAssetManager = manager;
}

function textureOwnerClosed(): Error {
  const error = new Error("Texture load cancelled because its app is closed or unavailable");
  error.name = "AbortError";
  return error;
}

function ensureTextureOwnerActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw textureOwnerClosed();
}

/**
 * A loader may ignore cancellation. Reject the owner promptly, but keep
 * observing the work so any eventual acquisition can be released.
 */
function awaitOwnedTextureWork<T>(pending: Promise<T>, signal?: AbortSignal, releaseLate?: (value: T) => void): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      signal.removeEventListener("abort", abort);
      return true;
    };
    const abort = (): void => { if (finish()) reject(textureOwnerClosed()); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then((value) => {
      if (finish()) resolve(value);
      else {
        try { releaseLate?.(value); } catch { /* No caller owns a late result. */ }
      }
    }, (error: unknown) => { if (finish()) reject(error); });
  });
}

/** Each load holds one manager lease, even when another load shares its handle. */
function textureLeaseRelease(manager: AssetManager, asset: AssetHandle<TextureDescriptorAsset>): () => Promise<void> {
  let released = false;
  return () => {
    if (released) return Promise.resolve();
    released = true;
    try {
      // The optional fallback also accommodates the lightweight injected
      // manager used by existing callers; real manager handles always release.
      const result = typeof manager.release === "function"
        ? manager.release(asset)
        : typeof asset.release === "function" ? asset.release() : undefined;
      return Promise.resolve(result).then(() => undefined);
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

/**
 * ST-01: the `texture.*` namespace. Every factory returns a live
 * `TextureHandle`; `load` is the async three `TextureLoader` parity path.
 */
// threejs-parity ST-01 — the public `aura.texture` namespace. Wrapped in
// lazyNamespace because this module sits inside the nodes↔compiler import
// graph (compiler/textures reads `auraTextureRefTexture` from here); deferring
// the literal avoids an initialization-order read in the packed dist.
export const texture = lazyNamespace(() => ({
  /**
   * `new THREE.DataTexture(data, width, height)` — raw pixel data. `format`
   * accepts the frozen option strings; `rgb8`/`r8` expand to RGBA8 (the
   * device's supported format family).
   */
  data(options: AuraTextureDataOptions): TextureHandle {
    const normalized = normalizeDataTexture(options);
    return new TextureHandle(new Texture({
      width: normalized.width,
      height: normalized.height,
      data: normalized.data,
      format: normalized.format,
      colorSpace: options.colorSpace ?? "linear",
      flipY: false,
      generateMipmaps: false, // three DataTexture sets both false
      dynamic: true,
      label: "texture.data"
    }));
  },

  /**
   * `new THREE.CanvasTexture(canvas)` — a live 2D canvas. `needsUpdate`
   * re-uploads on the next bind (ST-03).
   */
  canvas(options: AuraTextureCanvasOptions): TextureHandle {
    const canvas = options.canvas as TextureImageSource;
    if (!canvas || typeof canvas !== "object") {
      throw new AuraRuntimeError("unsupported-texture", "texture.canvas requires a canvas/image source");
    }
    const { width, height } = imageSourceDimensions(canvas);
    return new TextureHandle(new Texture({
      width,
      height,
      source: canvas,
      dynamic: true,
      colorSpace: options.colorSpace ?? "srgb",
      flipY: options.flipY ?? true,
      generateMipmaps: true,
      label: "texture.canvas"
    }));
  },

  /**
   * `new THREE.VideoTexture(video)` — per-frame upload: the device polls the
   * source each bind and re-uploads when `currentTime` advanced (ST-03). Like
   * three's VideoTexture, mipmaps are off and filtering is linear.
   */
  video(options: AuraTextureVideoOptions): TextureHandle {
    const video = options.video as TextureImageSource;
    if (!video || typeof video !== "object") {
      throw new AuraRuntimeError("unsupported-texture", "texture.video requires a video source element");
    }
    const { width, height } = imageSourceDimensions(video);
    const deviceTexture = new Texture({
      width,
      height,
      source: video,
      dynamic: true,
      colorSpace: options.colorSpace ?? "srgb",
      flipY: true,
      generateMipmaps: false,
      label: "texture.video"
    });
    attachVideoSourcePolling(deviceTexture);
    return new TextureHandle(deviceTexture, { minFilter: "linear", magFilter: "linear" });
  },

  /** `new THREE.CompressedTexture(mipmaps, w, h, format)` — device-ready blocks. */
  compressed(options: AuraTextureCompressedOptions): TextureHandle {
    const format = normalizeCompressedFormat(options.format);
    if (options.mipmaps.length === 0) {
      throw new AuraRuntimeError("unsupported-texture", "texture.compressed requires at least one mipmap level");
    }
    return new TextureHandle(new Texture({
      width: options.mipmaps[0]!.width,
      height: options.mipmaps[0]!.height,
      format,
      mipLevels: options.mipmaps.map((level) => ({ width: level.width, height: level.height, data: level.data })),
      colorSpace: "linear",
      flipY: false,
      generateMipmaps: false,
      label: "texture.compressed"
    }));
  },

  /** Create a sampleable texture from the public NativeImageAsset importer result. */
  fromNativeImage(asset: NativeImageTextureSource, limits?: NativeTextureConversionLimits): TextureHandle {
    return textureFromNativeImage(asset, limits);
  },

  /**
   * Load an admitted native image container into a caller-owned handle.
   * The current route accepts bounded PVR texture assets and verifies the
   * declared digest before decoding; unsupported variants fail explicitly.
   */
  async loadNativeAsset(asset: AuraAssetRef<"texture">, options: AuraNativeTextureLoadOptions = {}): Promise<TextureHandle> {
    return loadNativeTexture(asset, options, textureFromNativeImage);
  },

  /** `new THREE.DepthTexture(w, h)` — a depth24 attachment texture. */
  depth(options: AuraTextureDepthOptions): TextureHandle {
    requirePositiveInteger(options.width, "depth width");
    requirePositiveInteger(options.height, "depth height");
    return new TextureHandle(new Texture({
      width: options.width,
      height: options.height,
      format: "depth24",
      colorSpace: "linear",
      flipY: false,
      generateMipmaps: false,
      label: "texture.depth"
    }), { minFilter: "nearest", magFilter: "nearest" });
  },

  /**
   * `new THREE.CubeTexture(images)` — six faces in WebGPU/cube order
   * px, nx, py, ny, pz, nz. Each face is a typed pixel array (square size
   * inferred), `{ width, height, data, format? }`, or an image source
   * (canvas/ImageBitmap/image — read back through a 2D canvas).
   */
  cube(facesOrOptions: readonly unknown[] | AuraTextureCubeOptions): TextureHandle {
    const options: AuraTextureCubeOptions = Array.isArray(facesOrOptions)
      ? { faces: facesOrOptions as readonly unknown[] }
      : (facesOrOptions as AuraTextureCubeOptions);
    const faces = options.faces;
    if (!Array.isArray(faces) || faces.length !== 6) {
      throw new AuraRuntimeError("unsupported-texture", `texture.cube requires exactly six faces (got ${Array.isArray(faces) ? faces.length : typeof faces})`);
    }
    const pixels = faces.map((face, index) => normalizeCubeFacePixels(face, index));
    const first = pixels[0]!;
    if (pixels.some((face) => face.width !== first.width || face.height !== first.height)) {
      throw new AuraRuntimeError("unsupported-texture", "texture.cube faces must share identical dimensions");
    }
    if (pixels.some((face) => face.format !== first.format)) {
      throw new AuraRuntimeError("unsupported-texture", "texture.cube faces must share one pixel format");
    }
    const cubeFaces: TextureCubeFaceDescriptor[] = pixels.map((face, index) => ({
      face: CUBE_FACE_ORDER[index]!,
      mipLevels: [{ width: face.width, height: face.height, data: face.data }]
    }));
    return new TextureHandle(new Texture({
      width: first.width,
      height: first.height,
      dimension: "cube",
      format: first.format,
      cubeFaces,
      colorSpace: options.colorSpace ?? "srgb",
      flipY: false,
      generateMipmaps: false,
      label: "texture.cube"
    }));
  },

  /** `new THREE.DataArrayTexture(data, w, h, depth)` — layer-stacked 2D data. */
  dataArray(options: AuraTextureDataArrayOptions): TextureHandle {
    requirePositiveInteger(options.width, "dataArray width");
    requirePositiveInteger(options.height, "dataArray height");
    requirePositiveInteger(options.depth, "dataArray depth");
    const format = options.format ?? "rgba8";
    if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") {
      throw new AuraRuntimeError("unsupported-texture", `texture.dataArray format "${format}" must be rgba8, rgba16f or rgba32f`);
    }
    const bytesPerLayerTexel = format === "rgba16f" ? 8 : format === "rgba32f" ? 16 : 4;
    const data = options.data;
    const expected = options.width * options.height * options.depth * bytesPerLayerTexel;
    if (data.byteLength !== expected) {
      throw new AuraRuntimeError(
        "unsupported-texture",
        `texture.dataArray ${format} requires exactly ${expected} bytes for ${options.width}x${options.height}x${options.depth} (got ${data.byteLength})`
      );
    }
    if (format === "rgba16f" && !(data instanceof Uint16Array)) {
      throw new AuraRuntimeError("unsupported-texture", "texture.dataArray rgba16f requires Uint16Array half floats");
    }
    if (format === "rgba32f" && !(data instanceof Float32Array)) {
      throw new AuraRuntimeError("unsupported-texture", "texture.dataArray rgba32f requires Float32Array data");
    }
    if (format === "rgba8" && !(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
      throw new AuraRuntimeError("unsupported-texture", "texture.dataArray rgba8 requires Uint8Array/Uint8ClampedArray data");
    }
    return new TextureHandle(new Texture({
      width: options.width,
      height: options.height,
      dimension: "2d-array",
      layers: options.depth,
      data,
      format,
      colorSpace: options.colorSpace ?? "linear",
      flipY: false,
      generateMipmaps: false,
      label: "texture.dataArray"
    }));
  },

  /** A sampleable RGBA volume, including independently updatable mip levels. */
  data3d(options: AuraTexture3DOptions): TextureHandle {
    return new TextureHandle(new Texture({
      width: options.width,
      height: options.height,
      depth: options.depth,
      dimension: "3d",
      format: options.format ?? "rgba8",
      data: options.data,
      mipLevels: options.mipmaps,
      mipLevelCount: options.mipLevelCount,
      colorSpace: options.colorSpace ?? "linear",
      generateMipmaps: false,
      label: "texture.data3d"
    }), { minFilter: "linear", magFilter: "linear" });
  },

  /** Allocate a linear storage texture; unsupported devices report a capability error on use. */
  storage(options: AuraTextureStorageOptions): TextureHandle {
    const dimension = options.dimension ?? "2d";
    if (dimension === "2d" && options.depth !== undefined) throw new AuraRuntimeError("unsupported-texture", "texture.storage depth is valid only for 3d or 2d-array textures");
    if (dimension !== "2d") requirePositiveInteger(options.depth ?? 0, "storage depth");
    return new TextureHandle(new Texture({
      width: options.width,
      height: options.height,
      dimension,
      ...(dimension === "3d" ? { depth: options.depth } : {}),
      ...(dimension === "2d-array" ? { layers: options.depth } : {}),
      format: options.format ?? "rgba8",
      usage: ["storage", "sampled", "copy-src", "copy-dst"],
      mipLevelCount: options.mipLevelCount,
      colorSpace: "linear",
      generateMipmaps: false,
      label: "texture.storage"
    }), { minFilter: "nearest", magFilter: "nearest" });
  },

  /** Six independently addressable block-compressed faces and their mip chains. */
  compressedCube(options: AuraTextureCompressedCubeOptions): TextureHandle {
    const first = options.faces[0]?.mipmaps[0];
    if (!first) throw new AuraRuntimeError("unsupported-texture", "texture.compressedCube requires six faces with mip data");
    return new TextureHandle(new Texture({
      width: first.width,
      height: first.height,
      dimension: "cube",
      format: normalizeCompressedFormat(options.format),
      cubeFaces: options.faces.map(({ face, mipmaps }) => ({ face, mipLevels: mipmaps })),
      colorSpace: options.colorSpace ?? "linear",
      generateMipmaps: false,
      label: "texture.compressedCube"
    }));
  },

  /**
   * `new THREE.TextureLoader().load(url)` — real async decode over
   * `@aura3d/assets` (`ImageLoader` → `TextureLoader`). Progress/error events
   * flow to `createAuraApp({ onAssetProgress, onAssetError })` (ST-06).
   */
  async load(url: string, options: AuraTextureLoadOptions = {}): Promise<TextureHandle> {
    const eventScope = options.app ? assetEventScopeForApp(options.app) : undefined;
    // Never silently turn an explicitly owned request into a standalone one.
    if (options.app && !eventScope) throw textureOwnerClosed();
    const signal = eventScope?.signal;
    const progress: typeof emitAppAssetProgress = options.app
      ? (event) => eventScope?.emitProgress(event)
      : emitAppAssetProgress;
    const fail: typeof emitAppAssetError = options.app
      ? (event) => eventScope?.emitError(event)
      : emitAppAssetError;
    try {
      ensureTextureOwnerActive(signal);
      // AD-03/ST-07: EXR URLs decode through the real OpenEXR pipeline and
      // land as data textures — three's `EXRLoader` output shape (linear
      // HDR, flipY false, no mips).
      if (/\.exr(?:[?#].*)?$/i.test(url)) {
        const decoded = await awaitOwnedTextureWork(new EXRLoader().load({
          url,
          signal,
          onProgress: (event) => progress({
            url: event.url, item: event.url, loaded: event.loadedBytes,
            total: event.totalBytes ?? event.loadedBytes
          })
        }, new LoadContext({ signal })), signal);
        ensureTextureOwnerActive(signal);
        const data = decoded.channels === 4 ? decoded.data : expandExrChannels(decoded);
        const handle = new TextureHandle(new Texture({
          width: decoded.width,
          height: decoded.height,
          data,
          format: decoded.type === "half" ? "rgba16f" : "rgba32f",
          dynamic: false,
          colorSpace: options.colorSpace ?? "linear",
          flipY: false,
          generateMipmaps: false,
          label: `texture.load:${redactAssetUrl(url)}`
        }), { anisotropy: options.anisotropy ?? 1, minFilter: "linear", magFilter: "linear" });
        if (signal?.aborted) {
          handle.dispose();
          throw textureOwnerClosed();
        }
        return handle;
      }
      const manager = sharedTextureAssets();
      const pending = manager.load<TextureDescriptorAsset>(url, {
        type: "texture",
        signal,
        onProgress: (event) => progress({
          url,
          item: url,
          loaded: event.loadedBytes,
          total: event.totalBytes ?? event.loadedBytes
        })
      });
      const asset = await awaitOwnedTextureWork(pending, signal, (late) => {
        void textureLeaseRelease(manager, late)().catch(() => { /* No subscriber remains. */ });
      });
      const release = textureLeaseRelease(manager, asset);
      let backing: Texture | undefined;
      try {
        ensureTextureOwnerActive(signal);
        const image = asset.value;
        backing = new Texture({
          width: image.width,
          height: image.height,
          source: image.source,
          dynamic: false,
          colorSpace: options.colorSpace ?? image.colorSpace,
          flipY: options.flipY ?? true,
          generateMipmaps: true,
          label: `texture.load:${redactAssetUrl(url)}`
        });
        // The decoded source remains borrowed by the texture until disposal.
        // A returned handle belongs to the caller, not the app's pending work.
        backing.onDispose(() => { void release().catch(() => { /* dispose() is synchronous. */ }); });
        const handle = new TextureHandle(backing, { anisotropy: options.anisotropy ?? 1 });
        ensureTextureOwnerActive(signal);
        return handle;
      } catch (error) {
        backing?.dispose();
        void release().catch(() => { /* Preserve the load failure. */ });
        throw error;
      }
    } catch (error) {
      if (signal?.aborted) throw textureOwnerClosed();
      const safe = safeAssetError(error, url);
      fail({ url, error: safe, message: safe.message });
      throw safe;
    }
  }
}));
