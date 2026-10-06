// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { RenderDeviceError } from "../RenderDevice";
import type { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import type { WebGL2DeviceHost } from "./DeviceHost";
import { addressMode, magFilter, minFilter } from "./TextureFormats";

export class WebGL2SamplerRegistry {
  constructor(readonly host: WebGL2DeviceHost) {}

  activeTextureUnitIndex = -1;

  readonly samplerObjectCache = new Map<string, WebGLSampler>();

  readonly textureSamplerParameterCache = new WeakMap<WebGLTexture, Map<GLenum, GLenum | number>>();

  readonly textureUnitBindings = new Map<string, WebGLTexture>();

  uploadTextureUniform(location: WebGLUniformLocation, binding: TextureBinding, textureUnit: number): void {
    const validation = binding.validate();
    if (!validation.ok) {
      throw new RenderDeviceError("Texture binding validation failed", "INVALID_TEXTURE_BINDING", {
        diagnostics: validation.diagnostics,
        name: binding.name
      });
    }
    this.activateTextureUnit(textureUnit);
    const dimension = binding.texture?.dimension ?? (binding.name.toLowerCase().includes("cubemap") || binding.name.toLowerCase().includes("cube") ? "cube" : "2d");
    const target = dimension === "cube" ? this.host.gl.TEXTURE_CUBE_MAP : this.host.gl.TEXTURE_2D;
    const handle = binding.texture ? this.host.textureRegistry.getTextureHandle(binding.texture) : dimension === "cube" ? this.host.textureRegistry.getFallbackCubeTextureHandle() : this.host.textureRegistry.getFallbackTextureHandle();
    if (binding.texture) {
      const lowerName = binding.name.toLowerCase();
      if (lowerName.includes("environment")) this.host.counters.nativeEnvironmentBindings += 1;
      if (lowerName.includes("shadow")) this.host.counters.nativeShadowMapBindings += 1;
    }
    this.bindTextureForUnit(textureUnit, target, handle);
    const samplerHandle = this.getSamplerHandle(binding.sampler, target);
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

  getSamplerHandle(sampler: Sampler, target: GLenum): WebGLSampler {
    const key = this.samplerKey(sampler, target);
    const cached = this.samplerObjectCache.get(key);
    if (cached) return cached;
    const handle = this.host.gl.createSampler();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL sampler", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MIN_FILTER, minFilter(this.host.gl, sampler.minFilter));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_MAG_FILTER, magFilter(this.host.gl, sampler.magFilter));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_S, addressMode(this.host.gl, sampler.addressU));
    this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_T, addressMode(this.host.gl, sampler.addressV));
    this.host.counters.samplerParameterUploadCount += 4;
    if (target === this.host.gl.TEXTURE_CUBE_MAP) {
      this.host.gl.samplerParameteri(handle, this.host.gl.TEXTURE_WRAP_R, addressMode(this.host.gl, sampler.addressV));
      this.host.counters.samplerParameterUploadCount += 1;
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

  samplerKey(sampler: Sampler, target: GLenum): string {
    return [
      sampler.minFilter,
      sampler.magFilter,
      sampler.addressU,
      sampler.addressV,
      sampler.maxAnisotropy,
      target === this.host.gl.TEXTURE_CUBE_MAP ? "cube" : "2d"
    ].join("|");
  }
}
