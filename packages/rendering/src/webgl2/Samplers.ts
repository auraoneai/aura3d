// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError } from "../RenderDevice";
import { Sampler } from "../Sampler";
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
  // Explicit, cube, array and volume storage allocates mipLevelCount even if
  // only some levels have CPU content. Source and ordinary flat textures may
  // instead generate the complete chain at upload time.
  if (texture.dimension !== "2d" || texture.mipLevels.length > 0 || texture.mipLevelCount > 1 || isCompressedTextureFormat(texture.format)) return texture.mipLevelCount;
  if (texture.source) return texture.generateMipmaps ? undefined : 1;
  return isFloatColorTextureFormat(texture.format) || !texture.generateMipmaps ? 1 : undefined;
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
  constructor(readonly host: WebGL2DeviceHost) {
    // The unit shadow below mirrors GL state, so it is forgotten whenever the GL state cache is. (`?.`: partial test hosts.)
    host.stateCache?.onInvalidate?.(() => this.resetUnitShadow());
  }

  /** Forget which unit is active and which texture each unit holds (they are re-issued on next use). */
  resetUnitShadow(): void {
    this.activeTextureUnitIndex = -1;
    this.textureUnitBindings.clear();
  }

  invalidateOnContextLoss(): void {
    this.resetUnitShadow();
    this.samplerObjectCache.clear();
    this.floatLinearSupported = undefined;
  }

  activeTextureUnitIndex = -1;

  readonly samplerObjectCache = new Map<string, WebGLSampler>();

  readonly textureSamplerParameterCache = new WeakMap<WebGLTexture, Map<GLenum, GLenum | number>>();

  /** Texture held by each (unit, target), keyed `unit * 0x10000 + target` (no per-call string key). */
  readonly textureUnitBindings = new Map<number, WebGLTexture>();
  private readonly fallbackCompareSamplers = new WeakMap<Sampler, Sampler>();
  private floatLinearSupported: boolean | undefined;

  uploadTextureUniform(location: WebGLUniformLocation, binding: TextureBinding, textureUnit: number, uniformType?: string): void {
    const validation = binding.validate();
    if (!validation.ok) {
      throw new RenderDeviceError("Texture binding validation failed", "INVALID_TEXTURE_BINDING", {
        diagnostics: validation.diagnostics,
        name: binding.name
      });
    }
    // Reflection can supply either a GLSL type name or a stringified GL enum.
    const declared = uniformType?.toLowerCase();
    const integerSampler = declared?.startsWith("isampler") || declared?.startsWith("usampler")
      || ["36298", "36299", "36300", "36303", "36306", "36307", "36308", "36311"].includes(declared ?? "");
    if (integerSampler) {
      throw new RenderDeviceError("Integer samplers require an integer texture format, which is not available", "UNSUPPORTED_TEXTURE_FORMAT", { name: binding.name, uniformType });
    }
    const declaredDimension = declared === "sampler2darray" || declared === "sampler2darrayshadow" || declared === "36289" || declared === "36292"
      ? "2d-array"
      : declared === "sampler3d" || declared === "35679"
        ? "3d"
      : declared === "samplercube" || declared === "samplercubeshadow" || declared === "35680" || declared === "36293"
        ? "cube"
        : declared === "sampler2dshadow" || declared === "sampler2d" || declared === "35682" || declared === "35678"
          ? "2d"
          : undefined;
    const dimension = declaredDimension ?? binding.expectedDimension ?? binding.texture?.dimension
      ?? (binding.name.toLowerCase().includes("cube") ? "cube" : "2d");
    if (binding.texture && binding.texture.dimension !== dimension) {
      throw new RenderDeviceError("Texture dimension does not match the declared sampler", "INVALID_TEXTURE_BINDING", {
        name: binding.name, expected: dimension, actual: binding.texture.dimension
      });
    }
    const shadow = declared === "sampler2dshadow" || declared === "samplercubeshadow" || declared === "sampler2darrayshadow"
      || declared === "35682" || declared === "36293" || declared === "36292";
    const plain = declared === "sampler2d" || declared === "samplercube" || declared === "sampler2darray" || declared === "sampler3d"
      || declared === "35678" || declared === "35680" || declared === "36289" || declared === "35679";
    const compare = binding.sampler.compare;
    if (binding.texture) {
      if ((shadow && (binding.texture.format !== "depth24" || compare === undefined))
        || (compare !== undefined && (binding.texture.format !== "depth24" || plain))) {
        throw new RenderDeviceError("Shadow samplers require a depth texture and matching comparison mode", "INVALID_TEXTURE_BINDING", { name: binding.name, uniformType });
      }
    } else if ((shadow || compare !== undefined) && (plain || dimension === "3d")) {
      throw new RenderDeviceError("Comparison samplers require a matching shadow sampler dimension", "INVALID_TEXTURE_BINDING", { name: binding.name, uniformType });
    }
    if (binding.texture && (binding.texture.format === "r32f" || binding.texture.format === "rgba32f")
      && (binding.sampler.magFilter !== "nearest" || (binding.sampler.minFilter !== "nearest" && binding.sampler.minFilter !== "nearest-mipmap-nearest"))) {
      this.floatLinearSupported ??= Boolean(this.host.gl.getExtension("OES_texture_float_linear"));
      if (!this.floatLinearSupported) {
        throw new RenderDeviceError("Linear filtering of 32-bit float textures requires OES_texture_float_linear", "UNSUPPORTED_TEXTURE_FORMAT", { name: binding.name, format: binding.texture.format });
      }
    }
    this.activateTextureUnit(textureUnit);
    const target = dimension === "cube" ? this.host.gl.TEXTURE_CUBE_MAP : dimension === "2d-array" ? this.host.gl.TEXTURE_2D_ARRAY : dimension === "3d" ? this.host.gl.TEXTURE_3D : this.host.gl.TEXTURE_2D;
    const registry = this.host.textureRegistry;
    const fallbackShadow = !binding.texture && (shadow || compare !== undefined);
    const effectiveSampler = fallbackShadow && compare === undefined ? this.fallbackCompareSampler(binding.sampler) : binding.sampler;
    const handle = binding.texture ? registry.getTextureHandle(binding.texture)
      : fallbackShadow ? registry.getFallbackDepthTextureHandle(dimension as "2d" | "cube" | "2d-array", effectiveSampler.compare!)
      : dimension === "cube" ? registry.getFallbackCubeTextureHandle()
      : dimension === "2d-array" ? registry.getFallbackArrayTextureHandle()
      : dimension === "3d" ? registry.getFallback3DTextureHandle()
      : registry.getFallbackTextureHandle();
    if (binding.texture) {
      const lowerName = binding.name.toLowerCase();
      if (lowerName.includes("environment")) this.host.counters.nativeEnvironmentBindings += 1;
      if (lowerName.includes("shadow")) this.host.counters.nativeShadowMapBindings += 1;
    }
    this.bindTextureForUnit(textureUnit, target, handle);
    const samplerHandle = this.getSamplerHandle(effectiveSampler, target, binding.texture ?? undefined, effectiveSampler.compare !== undefined);
    this.host.stateCache.bindSampler(textureUnit, samplerHandle, () => this.host.gl.bindSampler(textureUnit, samplerHandle));
    this.host.gl.uniform1i(location, textureUnit);
  }

  private fallbackCompareSampler(sampler: Sampler): Sampler {
    const cached = this.fallbackCompareSamplers.get(sampler);
    if (cached) return cached;
    const result = new Sampler({ minFilter: sampler.minFilter, magFilter: sampler.magFilter, addressU: sampler.addressU,
      addressV: sampler.addressV, addressW: sampler.addressW, maxAnisotropy: sampler.maxAnisotropy, mirror: sampler.mirror, compare: "less-equal" });
    this.fallbackCompareSamplers.set(sampler, result);
    return result;
  }

  activateTextureUnit(textureUnit: number): void {
    if (this.activeTextureUnitIndex === textureUnit) return;
    this.host.stateCache.activeTexture(textureUnit, () => this.host.gl.activeTexture(this.host.gl.TEXTURE0 + textureUnit));
    this.activeTextureUnitIndex = textureUnit;
  }

  bindTextureForUnit(textureUnit: number, target: GLenum, handle: WebGLTexture): void {
    const key = textureUnit * 0x10000 + target;
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

  getSamplerHandle(sampler: Sampler, target: GLenum, texture?: Texture, forceCompare = false): WebGLSampler {
    const c12 = prd02SamplerEnabled();
    const residentLevels = c12 ? textureResidentMipLevels(texture) : undefined;
    const key = this.samplerKey(sampler, target, c12, residentLevels, forceCompare);
    const cached = this.samplerObjectCache.get(key);
    if (cached) return cached;
    const handle = this.host.gl.createSampler();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL sampler", "WEBGL_ALLOCATION_FAILED");
    }
    // C-12 (flag on): compare samplers force LINEAR so hardware PCF applies.
    const compareOn = (c12 || forceCompare) && sampler.compare !== undefined;
    const effectiveMin = c12
      ? (compareOn ? "linear" : prd02EffectiveMinFilter(sampler, residentLevels))
      : sampler.minFilter;
    const effectiveMag = c12 && compareOn ? "linear" : sampler.magFilter;
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MIN_FILTER, minFilter(this.host.gl, effectiveMin));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MAG_FILTER, magFilter(this.host.gl, effectiveMag));
    const wrapSMode = c12 && sampler.mirror ? "mirror-repeat" : sampler.addressU;
    const wrapTMode = c12 && sampler.mirror ? "mirror-repeat" : sampler.addressV;
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_S, addressMode(this.host.gl, wrapSMode));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_T, addressMode(this.host.gl, wrapTMode));
    this.host.counters.samplerParameterUploadCount += 4;
    if (target === this.host.gl.TEXTURE_CUBE_MAP || target === this.host.gl.TEXTURE_2D_ARRAY || target === this.host.gl.TEXTURE_3D) {
      const wrapRMode = c12 && sampler.mirror ? "mirror-repeat" : (sampler.addressW ?? sampler.addressV);
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

  /**
   * Sampler keys per (sampler, target kind, C-12, single-resident-level): a `Sampler` is immutable, so the joined string is
   * built once instead of an array and a join for every texture of every draw of every frame.
   */
  private readonly samplerKeyMemo = new WeakMap<Sampler, string[]>();

  samplerKey(sampler: Sampler, target: GLenum, c12: boolean = prd02SamplerEnabled(), residentLevels?: number, forceCompare = false): string {
    const kind = target === this.host.gl.TEXTURE_CUBE_MAP ? 0 : target === this.host.gl.TEXTURE_2D_ARRAY ? 1 : target === this.host.gl.TEXTURE_3D ? 2 : 3;
    const slot = kind + (c12 ? 4 : 0) + (residentLevels === 1 ? 8 : 0) + (forceCompare && !c12 ? 16 : 0);
    let memo = this.samplerKeyMemo.get(sampler);
    if (memo === undefined) {
      memo = [];
      this.samplerKeyMemo.set(sampler, memo);
    }
    return memo[slot] ??= this.buildSamplerKey(sampler, target, c12, residentLevels, forceCompare);
  }

  private buildSamplerKey(sampler: Sampler, target: GLenum, c12: boolean, residentLevels?: number, forceCompare = false): string {
    const key = [
      sampler.minFilter,
      sampler.magFilter,
      sampler.addressU,
      sampler.addressV,
      sampler.maxAnisotropy,
      target === this.host.gl.TEXTURE_CUBE_MAP ? "cube" : target === this.host.gl.TEXTURE_2D_ARRAY ? "2d-array" : target === this.host.gl.TEXTURE_3D ? "3d" : "2d"
    ];
    if (c12) {
      key.push(sampler.compare ?? "-", sampler.addressW ?? "-", sampler.mirror ? "m" : "-", residentLevels === 1 ? "1l" : "-");
    } else {
      if (target !== this.host.gl.TEXTURE_2D) key.push(sampler.addressW ?? sampler.addressV);
      if (forceCompare && sampler.compare !== undefined) key.push(sampler.compare);
    }
    return key.join("|");
  }
}
