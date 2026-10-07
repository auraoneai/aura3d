// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts.
// C-18 (PRD-06 T0.10a): `Texture.revision`-aware re-upload — dynamic textures
// allocate once via `texStorage2D` and refresh via `texSubImage2D`/`texSubImage3D`
// (`uploadTextureRevision`). All other paths are unchanged.

import { RenderDeviceError } from "../RenderDevice";
import { Texture, bytesPerPixel, isCompressedTextureFormat, isFloatColorTextureFormat, type TexturePixelData, type TextureUpdateRegion } from "../Texture";
import { WEBGL_CUBE_FACES } from "../WebGL2Device";
import { applyTextureBudget, DEFAULT_TEXTURE_BUDGET_POLICY } from "../textures/TextureBudget";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { cubeFaceTarget, resolveCompressedTextureFormat, rgba8TextureInternalFormat, textureUploadFormat } from "./TextureFormats";

export class WebGL2TextureRegistry {
  constructor(readonly host: WebGL2DeviceHost) {}

  fallbackCubeTexture: WebGLTexture | null = null;

  fallbackTexture: WebGLTexture | null = null;

  textureUploadModes = new Map<Texture, "compressed" | "cube" | "depth-render-target" | "fallback" | "rgba8" | "rgba16f" | "rgba32f">();

  textures = new Map<Texture, WebGLTexture>();

  /**
   * C-18: `Texture.revision` at the last successful upload. A mismatch means
   * `texture.update()` produced new pixels and the handle needs a sub-image
   * upload rather than a rebind.
   */
  private readonly textureUploadRevisions = new Map<Texture, number>();

  getFallbackTextureHandle(): WebGLTexture {
    if (this.fallbackTexture) {
      return this.fallbackTexture;
    }
    const handle = this.host.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL fallback texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.stateCache.invalidate();
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, handle);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, this.host.gl.RGBA, 1, 1, 0, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.fallbackTexture = handle;
    return handle;
  }

  getFallbackCubeTextureHandle(): WebGLTexture {
    if (this.fallbackCubeTexture) {
      return this.fallbackCubeTexture;
    }
    const handle = this.host.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL fallback cube texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.stateCache.invalidate();
    this.host.gl.bindTexture(this.host.gl.TEXTURE_CUBE_MAP, handle);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_R, this.host.gl.CLAMP_TO_EDGE);
    const pixel = new Uint8Array([255, 255, 255, 255]);
    for (const face of WEBGL_CUBE_FACES) {
      this.host.gl.texImage2D(cubeFaceTarget(this.host.gl, face), 0, this.host.gl.RGBA, 1, 1, 0, this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, pixel);
    }
    this.fallbackCubeTexture = handle;
    return handle;
  }

  getTextureHandle(texture: Texture): WebGLTexture {
    this.releaseDisposedTextureHandles();
    if (texture.disposed) {
      throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
    }
    const cached = this.textures.get(texture);
    if (cached) {
      // C-18: `update()` bumped the revision — re-upload in place instead of
      // reallocating a new WebGL texture (E39/T0.10a).
      if (this.textureUploadRevisions.get(texture) !== texture.revision) {
        this.uploadTextureRevision(texture, cached);
      }
      return cached;
    }
    // C-28/§3.4 seam: upload honors the texture-budget policy hook (identity stub until PRD 04).
    texture = applyTextureBudget(texture, this.host.textureBudgetPolicy ?? DEFAULT_TEXTURE_BUDGET_POLICY);
    const handle = this.host.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL texture", "WEBGL_ALLOCATION_FAILED", { label: texture.label });
    }
    this.host.stateCache.invalidate();
    this.host.gl.pixelStorei(this.host.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.host.gl.pixelStorei(this.host.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.host.gl.pixelStorei(this.host.gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, this.host.gl.NONE);
    if (texture.dimension === "cube") {
      this.uploadCubeTexture(texture, handle);
      this.textureUploadModes.set(texture, "cube");
      this.textures.set(texture, handle);
      this.textureUploadRevisions.set(texture, texture.revision);
      return handle;
    }
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, handle);
    if (isCompressedTextureFormat(texture.format)) {
      const compressed = resolveCompressedTextureFormat(this.host.gl, texture.format);
      if (compressed) {
        const uploadLevels = completeUploadLevels(texture.textureLevels);
        for (const [levelIndex, level] of uploadLevels.entries()) {
          this.host.gl.compressedTexImage2D(this.host.gl.TEXTURE_2D, levelIndex, compressed.internalFormat, level.width, level.height, 0, level.data);
        }
        const compressedUploadError = this.host.lifecycle.readError();
        if (!compressedUploadError) {
          this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_BASE_LEVEL, 0);
          this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
          this.textureUploadModes.set(texture, "compressed");
          this.textures.set(texture, handle);
          this.textureUploadRevisions.set(texture, texture.revision);
          return handle;
        }
      }
      const fallbackLevels = completeUploadLevels(texture.fallbackTextureLevels);
      if (fallbackLevels.length === 0) {
        this.host.gl.deleteTexture(handle);
        throw new RenderDeviceError("Compressed texture format is not supported and no RGBA8 fallback data was provided", "COMPRESSED_TEXTURE_UNSUPPORTED", {
          label: texture.label,
          format: texture.format
        });
      }
      this.uploadRgba8FallbackTexture(texture, fallbackLevels);
      this.textureUploadModes.set(texture, "fallback");
      this.textures.set(texture, handle);
      this.textureUploadRevisions.set(texture, texture.revision);
      return handle;
    }
    if (texture.format === "depth24") {
      throw new RenderDeviceError("Depth textures cannot be uploaded to WebGL2 color samplers", "UNSUPPORTED_TEXTURE_FORMAT", {
        label: texture.label,
        format: texture.format
      });
    }
    if (texture.source) {
      this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, rgba8TextureInternalFormat(this.host.gl, texture), this.host.gl.RGBA, this.host.gl.UNSIGNED_BYTE, texture.source);
      this.host.gl.generateMipmap(this.host.gl.TEXTURE_2D);
    } else if (texture.mipLevels.length > 0) {
      const uploadFormat = textureUploadFormat(this.host.gl, texture);
      const uploadLevels = completeUploadLevels(texture.textureLevels);
      for (const [levelIndex, level] of uploadLevels.entries()) {
        this.host.gl.texImage2D(
          this.host.gl.TEXTURE_2D,
          levelIndex,
          uploadFormat.internalFormat,
          level.width,
          level.height,
          0,
          uploadFormat.format,
          uploadFormat.type,
          texturePixelUploadData(level.data, texture.format)
        );
      }
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_BASE_LEVEL, 0);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
    } else if (texture.dimension === "2d-array") {
      // C-18 (T0.10a): morph-target array textures get immutable `texStorage3D`
      // storage; initial content and later update()s go through texSubImage3D
      // per layer — no reallocation per frame (E19).
      const uploadFormat = textureUploadFormat(this.host.gl, texture);
      this.host.gl.texStorage3D(this.host.gl.TEXTURE_2D_ARRAY, 1, uploadFormat.internalFormat, texture.width, texture.height, texture.layers);
      if (texture.data) {
        const layerElements = (texture.width * texture.height * bytesPerPixel(texture.format)) / texture.data.BYTES_PER_ELEMENT;
        for (let layer = 0; layer < texture.layers; layer += 1) {
          const layerData = texture.data.subarray(layer * layerElements, (layer + 1) * layerElements) as TexturePixelData;
          this.host.gl.texSubImage3D(
            this.host.gl.TEXTURE_2D_ARRAY,
            0,
            0,
            0,
            layer,
            texture.width,
            texture.height,
            1,
            uploadFormat.format,
            uploadFormat.type,
            texturePixelUploadData(layerData, texture.format)
          );
        }
      }
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D_ARRAY, this.host.gl.TEXTURE_BASE_LEVEL, 0);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D_ARRAY, this.host.gl.TEXTURE_MAX_LEVEL, 0);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D_ARRAY, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D_ARRAY, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
    } else if (texture.dynamic) {
      // C-18 (T0.10a): dynamic textures get immutable storage allocated once via
      // texStorage2D; initial content (if any) goes through texSubImage2D and
      // every later Texture.update() re-uploads the sub-image in place.
      const uploadFormat = textureUploadFormat(this.host.gl, texture);
      this.host.gl.texStorage2D(this.host.gl.TEXTURE_2D, 1, uploadFormat.internalFormat, texture.width, texture.height);
      if (texture.data) {
        this.host.gl.texSubImage2D(
          this.host.gl.TEXTURE_2D,
          0,
          0,
          0,
          texture.width,
          texture.height,
          uploadFormat.format,
          uploadFormat.type,
          texturePixelUploadData(texture.data, texture.format)
        );
      }
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_BASE_LEVEL, 0);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAX_LEVEL, 0);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
    } else {
      const uploadFormat = textureUploadFormat(this.host.gl, texture);
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        uploadFormat.internalFormat,
        texture.width,
        texture.height,
        0,
        uploadFormat.format,
        uploadFormat.type,
        texture.data ? texturePixelUploadData(texture.data, texture.format) : null
      );
      // Float colour formats are not guaranteed mipmap-filterable in WebGL2:
      // RGBA32F/RGBA16F are only linear-filterable with OES_texture_float_linear, and
      // generateMipmap on a non-filterable format raises INVALID_OPERATION. Data
      // textures such as joint palettes are point-sampled with texelFetch and never
      // need mips, so skip generation and pin the level range instead.
      if (isFloatColorTextureFormat(texture.format)) {
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_BASE_LEVEL, 0);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAX_LEVEL, 0);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
      } else {
        this.host.gl.generateMipmap(this.host.gl.TEXTURE_2D);
      }
    }
    this.textureUploadModes.set(texture, texture.format);
    this.textures.set(texture, handle);
    this.textureUploadRevisions.set(texture, texture.revision);
    return handle;
  }

  /**
   * C-18 (T0.10a): re-upload changed texture content on the existing handle.
   * Dynamic textures (immutable `texStorage2D` storage) use `texSubImage2D` for
   * the pending region or the whole level-0 image; `2d-array` textures use
   * `texSubImage3D` per written layer. Non-dynamic textures are re-uploaded via
   * a whole-image `texImage2D` (correct but reallocating — the C-18 stub
   * semantic; palette/morph textures are always `dynamic`).
   */
  private uploadTextureRevision(texture: Texture, handle: WebGLTexture): void {
    const mode = this.textureUploadModes.get(texture);
    if (mode === "cube" || mode === "compressed" || mode === "fallback" || mode === "depth-render-target") {
      // These modes re-upload through their own paths; only record the revision
      // so we do not re-enter every bind.
      this.textureUploadRevisions.set(texture, texture.revision);
      texture.pendingUpdateRegion = null;
      return;
    }
    this.host.stateCache.invalidate();
    const uploadFormat = textureUploadFormat(this.host.gl, texture);
    if (texture.dimension === "2d-array") {
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D_ARRAY, handle);
      const layerElements = (texture.width * texture.height * bytesPerPixel(texture.format)) / (texture.data ? texture.data.BYTES_PER_ELEMENT : 1);
      const layers = texture.data ? Math.max(1, Math.floor(texture.data.byteLength / (texture.width * texture.height * bytesPerPixel(texture.format)))) : 0;
      for (let layer = 0; layer < layers; layer += 1) {
        const layerData = texture.data ? texture.data.subarray(layer * layerElements, (layer + 1) * layerElements) : null;
        this.host.gl.texSubImage3D(
          this.host.gl.TEXTURE_2D_ARRAY,
          0,
          0,
          0,
          layer,
          texture.width,
          texture.height,
          1,
          uploadFormat.format,
          uploadFormat.type,
          layerData ? texturePixelUploadData(layerData as TexturePixelData, texture.format) : null
        );
      }
    } else if (texture.dynamic) {
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, handle);
      const region: TextureUpdateRegion | null = texture.pendingUpdateRegion;
      const x = region?.x ?? 0;
      const y = region?.y ?? 0;
      const width = region?.width ?? texture.width;
      const height = region?.height ?? texture.height;
      this.host.gl.texSubImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        x,
        y,
        width,
        height,
        uploadFormat.format,
        uploadFormat.type,
        texture.data ? texturePixelUploadData(texture.data, texture.format) : null
      );
    } else {
      // Non-dynamic legacy path: texImage2D whole-level re-upload (stub semantic).
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, handle);
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        uploadFormat.internalFormat,
        texture.width,
        texture.height,
        0,
        uploadFormat.format,
        uploadFormat.type,
        texture.data ? texturePixelUploadData(texture.data, texture.format) : null
      );
    }
    texture.pendingUpdateRegion = null;
    this.textureUploadRevisions.set(texture, texture.revision);
  }

  uploadCubeTexture(texture: Texture, handle: WebGLTexture): void {
    this.host.gl.bindTexture(this.host.gl.TEXTURE_CUBE_MAP, handle);
    const uploadFormat = textureUploadFormat(this.host.gl, texture);
    for (const face of texture.cubeFaces) {
      const uploadLevels = completeUploadLevels(face.mipLevels);
      for (const [levelIndex, level] of uploadLevels.entries()) {
        this.host.gl.texImage2D(
          cubeFaceTarget(this.host.gl, face.face),
          levelIndex,
          uploadFormat.internalFormat,
          level.width,
          level.height,
          0,
          uploadFormat.format,
          uploadFormat.type,
          texturePixelUploadData(level.data, texture.format)
        );
      }
    }
    const firstFaceLevels = completeUploadLevels(texture.cubeFaces[0]?.mipLevels ?? []);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_BASE_LEVEL, 0);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_MAX_LEVEL, Math.max(0, firstFaceLevels.length - 1));
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_CUBE_MAP, this.host.gl.TEXTURE_WRAP_R, this.host.gl.CLAMP_TO_EDGE);
  }

  uploadRgba8FallbackTexture(texture: Texture, fallbackLevels: readonly { readonly width: number; readonly height: number; readonly data: TexturePixelData }[]): void {
    const internalFormat = rgba8TextureInternalFormat(this.host.gl, texture);
    for (const [levelIndex, level] of fallbackLevels.entries()) {
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        levelIndex,
        internalFormat,
        level.width,
        level.height,
        0,
        this.host.gl.RGBA,
        this.host.gl.UNSIGNED_BYTE,
        texturePixelUploadData(level.data, "rgba8")
      );
    }
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_BASE_LEVEL, 0);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAX_LEVEL, fallbackLevels.length - 1);
  }

  releaseDisposedTextureHandles(): void {
    for (const [texture, handle] of [...this.textures]) {
      if (texture.disposed) {
        this.host.gl.deleteTexture(handle);
        this.textures.delete(texture);
        this.textureUploadModes.delete(texture);
        this.textureUploadRevisions.delete(texture);
        this.host.counters.releasedTextureHandles += 1;
      }
    }
  }
}

function completeUploadLevels<T extends { readonly width: number; readonly height: number }>(levels: readonly T[]): readonly T[] {
  const uploadLevels: T[] = [];
  for (const level of levels) {
    if (uploadLevels.length === 0) {
      uploadLevels.push(level);
      continue;
    }
    const previous = uploadLevels[uploadLevels.length - 1]!;
    const expectedWidth = Math.max(1, Math.floor(previous.width / 2));
    const expectedHeight = Math.max(1, Math.floor(previous.height / 2));
    if (level.width !== expectedWidth || level.height !== expectedHeight) {
      break;
    }
    uploadLevels.push(level);
  }
  return uploadLevels;
}

function texturePixelUploadData(data: TexturePixelData, format: Texture["format"]): ArrayBufferView {
  if (format === "rgba16f" && data instanceof Uint16Array) return data;
  if (format === "rgba32f" && data instanceof Float32Array) return data;
  if (format === "rgba8" && (data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return data;
  throw new RenderDeviceError("Texture pixel data type does not match texture format", "UNSUPPORTED_TEXTURE_FORMAT", { format });
}


