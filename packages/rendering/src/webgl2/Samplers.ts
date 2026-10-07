// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError } from "../RenderDevice";
import type { Sampler } from "../Sampler";
import type { Texture } from "../Texture";
import { isCompressedTextureFormat, isFloatColorTextureFormat } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { addressMode, magFilter, minFilter } from "./TextureFormats";
import { rendererQrFlags } from "../renderer/FrameGraph";

/** Mip levels the upload path will leave resident on the GPU (C-12 §semantics).
 * `undefined` = mips are generated at upload (never "exactly one level"). */
function textureResidentMipLevels(texture: Texture | undefined): number | undefined {
  if (!texture) return undefined;
  if (texture.dimension === "cube") {
    return texture.cubeFaces[0]?.mipLevels.length ?? 0;
  }
  if (texture.mipLevels.length > 0) return texture.mipLevels.length;
  if (texture.source) return undefined; // generateMipmap at upload
  if (isCompressedTextureFormat(texture.format)) return texture.textureLevels.length;
  // data/null-data 2D: float formats are pinned to level 0; the rest get
  // generateMipmap on upload.
  return isFloatColorTextureFormat(texture.format) ? 1 : undefined;
}

/** C-12: a texture with exactly one mip level downgrades `*-mipmap-*` to the
 * matching non-mip filter so it never samples an incomplete texture. */
function prd02EffectiveMinFilter(sampler: Sampler, residentLevels: number | undefined): Sampler["minFilter"] {
  if (residentLevels !== 1) return sampler.minFilter;
  switch (sampler.minFilter) {
    case "nearest-mipmap-nearest":
    case "nearest-mipmap-linear":
      return "nearest";
    case "linear-mipmap-nearest":
    case "linear-mipmap-linear":
      return "linear";
    default:
      return sampler.minFilter;
  }
}

function prd02SamplerEnabled(): boolean {
  return rendererQrFlags().on("A3D_QR_LIGHTING");
}

export class WebGL2SamplerRegistry {
  constructor(readonly host: WebGL2DeviceHost) {}

  activeTextureUnitIndex = -1;

  readonly samplerObjectCache = new Map<string, WebGLSampler>();

  readonly textureSamplerParameterCache = new WeakMap<WebGLTexture, Map<GLenum, GLenum | number>>();

  readonly textureUnitBindings = new Map<string, WebGLTexture>();

  uploadTextureUniform(location: WebGLUniformLocation, binding: TextureBinding, textureUnit: number, uniformType?: string): void {
    const validation = binding.validate();
    if (!validation.ok) {
      throw new RenderDeviceError("Texture binding validation failed", "INVALID_TEXTURE_BINDING", {
        diagnostics: validation.diagnostics,
        name: binding.name
      });
    }
    this.activateTextureUnit(textureUnit);
    // `uniformType` arrives either as the GLSL type name (static shader
    // reflection) or as a stringified GL enum (live getActiveUniform), e.g.
    // "36289" for SAMPLER_2D_ARRAY, "36292"/"36293" for array/cube shadow,
    // "36303"/"36311" for int/uint array samplers, "35682" for sampler2DShadow.
    const declared = uniformType?.toLowerCase();
    const dimension = declared === "sampler2darray" || declared === "isampler2darray" || declared === "usampler2darray" || declared === "36289" || declared === "36292" || declared === "36303" || declared === "36311"
      ? "2d-array"
      : declared === "samplercube" || declared === "isamplercube" || declared === "usamplercube" || declared === "samplercubeshadow" || declared === "35680" || declared === "36293"
        ? "cube"
        : declared === "sampler2dshadow" || declared === "sampler2d" || declared === "35682" || declared === "35678"
          ? "2d"
          : binding.texture?.dimension ?? (binding.name.toLowerCase().includes("cubemap") || binding.name.toLowerCase().includes("cube") ? "cube" : "2d");
    // lane 06 Q-01-3: sampler2DArray uniforms bind to TEXTURE_2D_ARRAY units.
    const target = dimension === "cube" ? this.host.gl.TEXTURE_CUBE_MAP : dimension === "2d-array" ? this.host.gl.TEXTURE_2D_ARRAY : this.host.gl.TEXTURE_2D;
    const handle = binding.texture ? this.host.textureRegistry.getTextureHandle(binding.texture) : dimension === "cube" ? this.host.textureRegistry.getFallbackCubeTextureHandle() : dimension === "2d-array" ? this.host.textureRegistry.getFallbackTextureHandle() : this.host.textureRegistry.getFallbackTextureHandle();
    if (binding.texture) {
      const lowerName = binding.name.toLowerCase();
      if (lowerName.includes("environment")) this.host.counters.nativeEnvironmentBindings += 1;
      if (lowerName.includes("shadow")) this.host.counters.nativeShadowMapBindings += 1;
    }
    this.bindTextureForUnit(textureUnit, target, handle);
    const samplerHandle = this.getSamplerHandle(binding.sampler, target, binding.texture ?? undefined);
    this.host.stateCache.bindSampler(textureUnit, samplerHandle, () => this.host.gl.bindSampler(textureUnit, samplerHandle));
    this.host.gl.uniform1i(location, textureUnit);
  }

  activateTextureUnit(textureUnit: number): void {
    if (this.activeTextureUnitIndex === textureUnit) return;
    this.host.stateCache.activeTexture(textureUnit, () => this.host.gl.activeTexture(this.host.gl.TEXTURE0 + textureUnit));
    this.activeTextureUnitIndex = textureUnit;
  }

  bindTextureForUnit(textureUnit: number, target: GLenum, handle: WebGLTexture): void {
    const key = `${textureUnit}:${target}`;
    if (this.textureUnitBindings.get(key) === handle) return;
    this.host.stateCache.bindTexture(target, handle, () => this.host.gl.bindTexture(target, handle));
    this.textureUnitBindings.set(key, handle);
    this.host.counters.textureBindCount += 1;
  }

  setTextureParameterIfNeeded(handle: WebGLTexture, target: GLenum, parameter: GLenum, value: GLenum | number): void {
    let parameters = this.textureSamplerParameterCache.get(handle);
    if (!parameters) {
      parameters = new Map();
      this.textureSamplerParameterCache.set(handle, parameters);
    }
    if (parameters.get(parameter) === value) return;
    this.host.gl.texParameteri(target, parameter, value);
    parameters.set(parameter, value);
    this.host.counters.samplerParameterUploadCount += 1;
  }

  applySamplerAnisotropy(maxAnisotropy: number, target: GLenum = this.host.gl.TEXTURE_2D): void {
    if (maxAnisotropy <= 1) return;
    if (!this.host.anisotropicFilteringExtension) return;
    this.host.gl.texParameterf(
      target,
      this.host.anisotropicFilteringExtension.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(Math.max(1, maxAnisotropy), this.host.maxTextureAnisotropy)
    );
    this.host.counters.samplerAnisotropyUploadCount += 1;
  }

  getSamplerHandle(sampler: Sampler, target: GLenum, texture?: Texture): WebGLSampler {
    const c12 = prd02SamplerEnabled();
    const residentLevels = c12 ? textureResidentMipLevels(texture) : undefined;
    const key = this.samplerKey(sampler, target, c12, residentLevels);
    const cached = this.samplerObjectCache.get(key);
    if (cached) return cached;
    const handle = this.host.gl.createSampler();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL sampler", "WEBGL_ALLOCATION_FAILED");
    }
    // C-12 (flag on): compare samplers force LINEAR so hardware PCF applies.
    const compareOn = c12 && sampler.compare !== undefined;
    const effectiveMin = c12
      ? (compareOn ? "linear" : prd02EffectiveMinFilter(sampler, residentLevels))
      : sampler.minFilter;
    const effectiveMag = compareOn ? "linear" : sampler.magFilter;
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MIN_FILTER, minFilter(this.host.gl, effectiveMin));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MAG_FILTER, magFilter(this.host.gl, effectiveMag));
    const wrapSMode = c12 && sampler.mirror ? "mirror-repeat" : sampler.addressU;
    const wrapTMode = c12 && sampler.mirror ? "mirror-repeat" : sampler.addressV;
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_S, addressMode(this.host.gl, wrapSMode));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_T, addressMode(this.host.gl, wrapTMode));
    this.host.counters.samplerParameterUploadCount += 4;
    if (target === this.host.gl.TEXTURE_CUBE_MAP) {
      const wrapRMode = c12 && sampler.mirror ? "mirror-repeat" : (c12 ? (sampler.addressW ?? sampler.addressV) : sampler.addressV);
      this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_R, addressMode(this.host.gl, wrapRMode));
      this.host.counters.samplerParameterUploadCount += 1;
    }
    if (compareOn) {
      this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_COMPARE_MODE, this.host.gl.COMPARE_REF_TO_TEXTURE);
      this.host.gl.samplerParameteri(
        handle,
        this.host.gl.TEXTURE_COMPARE_FUNC,
        sampler.compare === "greater-equal" ? this.host.gl.GEQUAL : this.host.gl.LEQUAL
      );
      this.host.counters.samplerParameterUploadCount += 2;
    }
    if (sampler.maxAnisotropy > 1 && this.host.anisotropicFilteringExtension) {
      this.host.gl.samplerParameterf(
        handle,
        this.host.anisotropicFilteringExtension.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(Math.max(1, sampler.maxAnisotropy), this.host.maxTextureAnisotropy)
      );
      this.host.counters.samplerAnisotropyUploadCount += 1;
    }
    this.samplerObjectCache.set(key, handle);
    return handle;
  }

  samplerKey(sampler: Sampler, target: GLenum, c12: boolean = prd02SamplerEnabled(), residentLevels?: number): string {
    const key = [
      sampler.minFilter,
      sampler.magFilter,
      sampler.addressU,
      sampler.addressV,
      sampler.maxAnisotropy,
      target === this.host.gl.TEXTURE_CUBE_MAP ? "cube" : target === this.host.gl.TEXTURE_2D_ARRAY ? "2d-array" : "2d"
    ];
    if (c12) {
      key.push(sampler.compare ?? "-", sampler.addressW ?? "-", sampler.mirror ? "m" : "-", residentLevels === 1 ? "1l" : "-");
    }
    return key.join("|");
  }
}
