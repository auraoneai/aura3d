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
  type TextureCompressedFormat,
  type TextureCubeFace,
  type TextureCubeFaceDescriptor,
  type TextureFormat,
  type TexturePixelData
} from "@aura3d/rendering";
import { AssetManager, EXRLoader, ImageLoader, TextureLoader as AssetTextureLoader, type AuraEXRTextureData, type TextureDescriptorAsset } from "@aura3d/assets/browser";
import { emitAppAssetError, emitAppAssetProgress } from "../assetEvents.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { lazyNamespace } from "../lazyNamespace.js";
import type {
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

/** Internal bridge (compiler/textures.ts): the live `Texture` behind a ref. */
export function auraTextureRefTexture(ref: AuraTextureRef | null | undefined): Texture | null {
  if (!ref || ref.kind !== "aura-texture-ref") return null;
  return textureHandleBackings.get(ref) ?? null;
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

  constructor(
    texture: Texture,
    defaults: {
      readonly wrapS?: AuraTextureWrapMode;
      readonly wrapT?: AuraTextureWrapMode;
      readonly anisotropy?: number;
      readonly minFilter?: AuraTextureMinFilter;
      readonly magFilter?: AuraTextureMagFilter;
    } = {}
  ) {
    this.texture = texture;
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
    this.needsUpdate = true;
  }

  get flipY(): boolean {
    return this.texture.flipY;
  }

  set flipY(value: boolean) {
    if (this.texture.flipY === value) return;
    this.texture.flipY = value;
    this.needsUpdate = true;
  }

  get generateMipmaps(): boolean {
    return this.texture.generateMipmaps;
  }

  set generateMipmaps(value: boolean) {
    if (this.texture.generateMipmaps === value) return;
    this.texture.generateMipmaps = value;
    this.needsUpdate = true;
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
function attachVideoSourcePolling(texture: Texture, video: object): void {
  let lastTime = Number.NaN;
  let lastReadyState = -1;
  texture.pollContentRevision = () => {
    const source = video as VideoLikeSource;
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
      texture.markNeedsUpdate();
    }
  };
}

const COMPRESSED_FORMAT_ALIASES: Readonly<Record<string, TextureCompressedFormat>> = {
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
    attachVideoSourcePolling(deviceTexture, options.video as object);
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

  /**
   * `new THREE.TextureLoader().load(url)` — real async decode over
   * `@aura3d/assets` (`ImageLoader` → `TextureLoader`). Progress/error events
   * flow to `createAuraApp({ onAssetProgress, onAssetError })` (ST-06).
   */
  async load(url: string, options: AuraTextureLoadOptions = {}): Promise<TextureHandle> {
    const manager = sharedTextureAssets();
    try {
      // AD-03/ST-07: EXR URLs decode through the real OpenEXR pipeline and
      // land as data textures — three's `EXRLoader` output shape (linear
      // HDR, flipY false, no mips).
      if (/\.exr(?:\?.*)?$/i.test(url)) {
        const decoded = await new EXRLoader().load(url, undefined,
          (p) => emitAppAssetProgress({ url, item: url, loaded: p.loaded ?? 0, total: p.total ?? p.loaded ?? 0 }));
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
          label: `texture.load:${url}`
        }), { anisotropy: options.anisotropy ?? 1, minFilter: "linear", magFilter: "linear" });
        return handle;
      }
      const asset = await manager.load<TextureDescriptorAsset>(url, {
        type: "texture",
        onProgress: (event) => emitAppAssetProgress({
          url,
          item: url,
          loaded: event.loadedBytes,
          total: event.totalBytes ?? event.loadedBytes
        })
      });
      const image = asset.value;
      return new TextureHandle(new Texture({
        width: image.width,
        height: image.height,
        source: image.source,
        dynamic: false,
        colorSpace: options.colorSpace ?? image.colorSpace,
        flipY: options.flipY ?? true,
        generateMipmaps: true,
        label: `texture.load:${url}`
      }), { anisotropy: options.anisotropy ?? 1 });
    } catch (error) {
      emitAppAssetError({ url, error, message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}));
