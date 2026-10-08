// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError } from "../RenderDevice";
import type { TextureMagFilter, TextureMinFilter } from "../Sampler";
import { Texture, type TextureCompressedFormat, type TextureCubeFace } from "../Texture";

export function cubeFaceTarget(gl: WebGL2RenderingContext, face: TextureCubeFace): GLenum {
    switch (face) {
      case "px": return gl.TEXTURE_CUBE_MAP_POSITIVE_X;
      case "nx": return gl.TEXTURE_CUBE_MAP_NEGATIVE_X;
      case "py": return gl.TEXTURE_CUBE_MAP_POSITIVE_Y;
      case "ny": return gl.TEXTURE_CUBE_MAP_NEGATIVE_Y;
      case "pz": return gl.TEXTURE_CUBE_MAP_POSITIVE_Z;
      case "nz": return gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
    }
  }

export function rgba8TextureInternalFormat(gl: WebGL2RenderingContext, texture: Texture): GLenum {
    return texture.colorSpace === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA;
  }

export function textureUploadFormat(gl: WebGL2RenderingContext, texture: Texture): { readonly internalFormat: GLenum; readonly format: GLenum; readonly type: GLenum } {
    if (texture.format === "rgba8") {
      return { internalFormat: rgba8TextureInternalFormat(gl, texture), format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    }
    if (texture.colorSpace === "srgb") {
      throw new RenderDeviceError("Floating-point texture uploads must use linear colorSpace", "UNSUPPORTED_TEXTURE_FORMAT", {
        label: texture.label,
        format: texture.format,
        colorSpace: texture.colorSpace
      });
    }
    if (texture.format === "rgba16f") {
      return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    }
    if (texture.format === "rgba32f") {
      return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT };
    }
    throw new RenderDeviceError("Unsupported texture upload format", "UNSUPPORTED_TEXTURE_FORMAT", {
      label: texture.label,
      format: texture.format
    });
  }

/**
 * Internalformat for `texStorage2D`/`texStorage3D` — the storage APIs require
 * a *sized* internalformat, so linear `rgba8` must resolve to `RGBA8` (the
 * `texImage2D` path keeps the unsized `RGBA` accepted by the spec).
 */
export function textureStorageInternalFormat(gl: WebGL2RenderingContext, texture: Texture): GLenum {
  if (texture.format === "rgba8") {
    return texture.colorSpace === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA8;
  }
  return textureUploadFormat(gl, texture).internalFormat;
}

export function resolveRenderTargetFormat(gl: WebGL2RenderingContext, format: "rgba8" | "rgba16f" | "rgba32f"): { readonly internalFormat: GLenum; readonly type: GLenum } {
    if (format === "rgba8") {
      return { internalFormat: gl.RGBA, type: gl.UNSIGNED_BYTE };
    }
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new RenderDeviceError("Floating-point color render targets require EXT_color_buffer_float", "HDR_RENDER_TARGET_UNSUPPORTED", { format });
    }
    if (format === "rgba16f") {
      return { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT };
    }
    return { internalFormat: gl.RGBA32F, type: gl.FLOAT };
  }

export function resolveCompressedTextureFormat(gl: WebGL2RenderingContext, format: TextureCompressedFormat): { readonly internalFormat: GLenum } | null {
    switch (format) {
      case "bc1-rgba-unorm": {
        const extension = gl.getExtension("WEBGL_compressed_texture_s3tc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_S3TC_DXT1_EXT } : null;
      }
      case "bc3-rgba-unorm": {
        const extension = gl.getExtension("WEBGL_compressed_texture_s3tc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_S3TC_DXT5_EXT } : null;
      }
      case "etc2-rgba8unorm":
        return { internalFormat: 0x9278 };
      case "astc-4x4-rgba-unorm": {
        const extension = gl.getExtension("WEBGL_compressed_texture_astc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_ASTC_4x4_KHR } : null;
      }
      default:
        throw new Error(`UNSUPPORTED_COMPRESSED_FORMAT:${format}`);
    }
  }

// ---------------------------------------------------------------------------
// C-16 real implementation (PRD-05 Phase 1) — `resolveCompressedTextureFormatSlot`
// provider. Adds the bc7/etc2-rgb8unorm members plus the sRGB internal-format
// variants (sRGB × the DXT/ASTC/BPTC extension's sRGB constants); flag-off the
// slot keeps serving the () => null stub so `resolveCompressedTextureFormat`
// above is untouched.
// ---------------------------------------------------------------------------

const GL_COMPRESSED_RGB8_ETC2 = 0x9274;
const GL_COMPRESSED_SRGB8_ETC2 = 0x9275;
const GL_COMPRESSED_RGBA8_ETC2_EAC = 0x9278;
const GL_COMPRESSED_SRGB8_ALPHA8_ETC2_EAC = 0x9279;

/**
 * C-16 real: map a `TextureCompressedFormat` + colour space to a WebGL2
 * internal-format enum, `null` when the backing extension is absent.
 *   bc1/bc3 → WEBGL_compressed_texture_s3tc (sRGB needs _s3tc_srgb too)
 *   bc7     → EXT_texture_compression_bptc
 *   astc    → WEBGL_compressed_texture_astc
 *   etc2    → core WebGL2 (the WEBGL_compressed_texture_etc gate only matters
 *             on non-core contexts; on WebGL2 the formats are guaranteed)
 */
export function resolveCompressedTextureFormatReal(
  format: TextureCompressedFormat,
  colorSpace: "srgb" | "linear",
  gl: WebGL2RenderingContext
): number | null {
  const srgb = colorSpace === "srgb";
  switch (format) {
    case "bc1-rgba-unorm": {
      const s3tc = gl.getExtension("WEBGL_compressed_texture_s3tc");
      if (!s3tc) return null;
      if (srgb) {
        const s3tcSrgb = gl.getExtension("WEBGL_compressed_texture_s3tc_srgb");
        return s3tcSrgb ? s3tcSrgb.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT : null;
      }
      return s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT;
    }
    case "bc3-rgba-unorm": {
      const s3tc = gl.getExtension("WEBGL_compressed_texture_s3tc");
      if (!s3tc) return null;
      if (srgb) {
        const s3tcSrgb = gl.getExtension("WEBGL_compressed_texture_s3tc_srgb");
        return s3tcSrgb ? s3tcSrgb.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT : null;
      }
      return s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;
    }
    case "bc7-rgba-unorm": {
      const bptc = gl.getExtension("EXT_texture_compression_bptc");
      if (!bptc) return null;
      return srgb ? bptc.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT : bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT;
    }
    case "astc-4x4-rgba-unorm": {
      const astc = gl.getExtension("WEBGL_compressed_texture_astc");
      if (!astc) return null;
      return srgb ? astc.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR : astc.COMPRESSED_RGBA_ASTC_4x4_KHR;
    }
    case "etc2-rgba8unorm":
      return srgb ? GL_COMPRESSED_SRGB8_ALPHA8_ETC2_EAC : GL_COMPRESSED_RGBA8_ETC2_EAC;
    case "etc2-rgb8unorm":
      return srgb ? GL_COMPRESSED_SRGB8_ETC2 : GL_COMPRESSED_RGB8_ETC2;
    default:
      throw new Error(`UNSUPPORTED_COMPRESSED_FORMAT:${String(format)}`);
  }
}

/**
 * C-16 §7.4 probe: which compressed-texture families this context can consume.
 * `etc2` is a WebGL2-core guarantee; the other four map 1:1 onto their
 * WebGL extension objects (S3TC sRGB lives in its own extension).
 */
export function probeCompressedTextureCapabilities(gl: WebGL2RenderingContext): {
  readonly astc: boolean;
  readonly bptc: boolean;
  readonly etc2: boolean;
  readonly s3tc: boolean;
  readonly s3tcSrgb: boolean;
} {
  return {
    astc: gl.getExtension("WEBGL_compressed_texture_astc") !== null,
    bptc: gl.getExtension("EXT_texture_compression_bptc") !== null,
    etc2: true,
    s3tc: gl.getExtension("WEBGL_compressed_texture_s3tc") !== null,
    s3tcSrgb: gl.getExtension("WEBGL_compressed_texture_s3tc_srgb") !== null
  };
}

export function magFilter(gl: WebGL2RenderingContext, filter: TextureMagFilter): GLenum {
    return filter === "nearest" ? gl.NEAREST : gl.LINEAR;
  }

export function minFilter(gl: WebGL2RenderingContext, filter: TextureMinFilter): GLenum {
    switch (filter) {
      case "nearest":
        return gl.NEAREST;
      case "linear":
        return gl.LINEAR;
      case "nearest-mipmap-nearest":
        return gl.NEAREST_MIPMAP_NEAREST;
      case "linear-mipmap-nearest":
        return gl.LINEAR_MIPMAP_NEAREST;
      case "nearest-mipmap-linear":
        return gl.NEAREST_MIPMAP_LINEAR;
      case "linear-mipmap-linear":
        return gl.LINEAR_MIPMAP_LINEAR;
    }
  }

export function addressMode(gl: WebGL2RenderingContext, mode: "clamp-to-edge" | "repeat" | "mirror-repeat"): GLenum {
    if (mode === "repeat") return gl.REPEAT;
    if (mode === "mirror-repeat") return gl.MIRRORED_REPEAT;
    return gl.CLAMP_TO_EDGE;
  }
