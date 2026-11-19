import { describe, expect, it } from "vitest";
import { WebGL2SamplerRegistry } from "../../../packages/rendering/src/webgl2/Samplers";

const GL = { TEXTURE_2D: 0x0de1, TEXTURE_CUBE_MAP: 0x8513, TEXTURE_2D_ARRAY: 0x8c1a, TEXTURE_3D: 0x806f };

function setup() {
  const binds: Array<[number, number]> = [];
  const units: number[] = [];
  const counters = { nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0 };
  const host = {
    counters,
    gl: { ...GL, uniform1i: (_l: unknown, unit: number) => units.push(unit), bindSampler() {}, getExtension: () => null },
    stateCache: { onInvalidate() {}, bindSampler: (_u: number, _s: unknown, apply: () => void) => apply() },
    textureRegistry: { getTextureHandle: () => ({}), getFallbackTextureHandle: () => ({}), getFallbackCubeTextureHandle: () => ({}) }
  };
  const registry = new WebGL2SamplerRegistry(host as never);
  Object.assign(registry, {
    activateTextureUnit() {},
    bindTextureForUnit: (unit: number, target: number) => binds.push([unit, target]),
    getSamplerHandle: () => ({})
  });
  return { registry, binds, units, counters };
}

const binding = (name: string, texture: object | null, sampler: object = {}) => ({
  name, texture, sampler, validate: () => ({ ok: true, diagnostics: [], warnings: [] })
});

describe("reflected sampler type handling", () => {
  it("binds the declared dimension and counts environment and shadow names case-insensitively", () => {
    const { registry, binds, units, counters } = setup();
    const cube = { dimension: "cube", format: "rgba8" };
    const flat = { dimension: "2d", format: "rgba8" };
    for (let draw = 0; draw < 3; draw += 1) {
      registry.uploadTextureUniform({}, binding("u_EnvironmentMap", cube) as never, 0, "samplerCube");
      registry.uploadTextureUniform({}, binding("u_ShadowTint", flat) as never, 1, "35678");
      registry.uploadTextureUniform({}, binding("u_albedo", flat) as never, 2, "SAMPLER2D", false);
    }
    expect(binds.slice(0, 3)).toEqual([[0, GL.TEXTURE_CUBE_MAP], [1, GL.TEXTURE_2D], [2, GL.TEXTURE_2D]]);
    expect(binds).toHaveLength(9);
    expect(units).toEqual([0, 1, 0, 1, 0, 1]);
    expect(counters).toEqual({ nativeEnvironmentBindings: 3, nativeShadowMapBindings: 3 });
  });

  it("keeps rejecting integer, mismatched and non-depth shadow samplers on every call", () => {
    const { registry } = setup();
    const flat = { dimension: "2d", format: "rgba8" };
    for (let draw = 0; draw < 2; draw += 1) {
      expect(() => registry.uploadTextureUniform({}, binding("u_ids", flat) as never, 0, "isampler2D"))
        .toThrow(expect.objectContaining({ code: "UNSUPPORTED_TEXTURE_FORMAT" }));
      expect(() => registry.uploadTextureUniform({}, binding("u_ids", flat) as never, 0, "36306"))
        .toThrow(expect.objectContaining({ code: "UNSUPPORTED_TEXTURE_FORMAT" }));
      expect(() => registry.uploadTextureUniform({}, binding("u_sky", flat) as never, 0, "samplerCube"))
        .toThrow(expect.objectContaining({ code: "INVALID_TEXTURE_BINDING" }));
      expect(() => registry.uploadTextureUniform({}, binding("u_depth", flat) as never, 0, "sampler2DShadow"))
        .toThrow(expect.objectContaining({ code: "INVALID_TEXTURE_BINDING" }));
    }
  });
});
