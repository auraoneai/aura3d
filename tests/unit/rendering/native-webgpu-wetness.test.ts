// S5-DEF-02: native WebGPU wetness (experimental). The generated WGSL PBR
// program applies the PRD-07 §6.8 wet-look response that WebGL2 applies via
// a3d_prd07_wetness. Source/CPU-reference checks only; no GPU execution.
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd07";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { shaderFeaturesFor, type ProgramFeatures, type ShaderFeature } from "../../../packages/rendering/src/contracts/program";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import {
  createGeneratedPbrProgram,
  GENERATED_PBR_MATERIAL_OFFSETS,
  packGeneratedPbrMaterialUniforms,
  type GeneratedPbrDescriptor
} from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { PRD07_WETNESS_CHUNK_GLSL, PRD07_WETNESS_APPLY_CHUNK_GLSL, applyWetnessMaterialCpu, setPrd07WetnessState } from "../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import { PRD07_WETNESS_WGSL, applyNativeWetnessMaterialCpu, nativeWetnessPuddleCpu } from "../../../packages/rendering/src/atmosphere/shaders/wetness.wgsl";
import { admitNativeDeferredFeatures } from "../../../packages/rendering/src/renderer/NativeDeferredAdmission";
import { PRD07_WETNESS_SHADER_FEATURE } from "../../../packages/rendering/src/atmosphere/Prd07ShaderFeatures";

const flags: QrFlags = { values: {}, on: () => true };
const lights = { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 } as const;

function descriptor(features: ProgramFeatures["features"], overrides: Partial<ProgramFeatures> = {}): GeneratedPbrDescriptor {
  const generated = generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit", lights, maps: {}, extensions: [], environment: "none", features, ...overrides
  }), { flags });
  expect(generated.descriptor).toBeDefined();
  return generated.descriptor!;
}

const glslSmoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

afterEach(() => setPrd07WetnessState({ wetness: 0, puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null }));

describe("native WebGPU wetness program", () => {
  it("selects the stock wetness feature and edits base color and roughness before lighting", () => {
    const wet = descriptor({ "prd07.wetness": true });
    expect(wet.activeFeatures).toContainEqual({ id: "prd07.wetness", value: true });
    expect(wet.defines.A3D_WETNESS).toBe(1);
    expect(wet.verifiedFeatures).toContain("prd07.wetness");
    const program = createGeneratedPbrProgram(wet);
    expect(program.wetness).toBe(true);
    expect(program.fragment).toContain(PRD07_WETNESS_WGSL);
    expect(program.fragment).toContain("let base = vec4f(a3dWetAlbedo(max(dryBase.rgb, vec3f(0.0)), 1.0), dryBase.a);");
    expect(program.fragment).toContain("let roughness = clamp(a3dWetRoughness(dryRoughness), 0.0525, 1.0);");
    expect(program.fragment.indexOf("a3dWetRoughness(dryRoughness)")).toBeLessThan(program.fragment.indexOf("let diffuseColor"));
    // No puddle-noise binding: the native response uses the neutral noise value.
    expect(program.resources.map(({ uniform }) => uniform as string)).not.toContain("u_puddleNoise");

    const dry = createGeneratedPbrProgram(descriptor({}));
    expect(dry.wetness).toBe(false);
    expect(dry.fragment).not.toContain("a3dWet");
    expect(dry.fragment).toContain("let base = material.baseColor");
  });

  it("fails closed on unverified or inconsistent wetness metadata", () => {
    const wet = descriptor({ "prd07.wetness": true });
    expect(() => createGeneratedPbrProgram({ ...wet, verifiedFeatures: [] })).toThrow(/unverified prd07.wetness/);
    const noDefine = { ...wet.defines }; delete (noDefine as Record<string, unknown>).A3D_WETNESS;
    expect(() => createGeneratedPbrProgram({ ...wet, defines: noDefine })).toThrow(/wetness define/);
    expect(() => createGeneratedPbrProgram({ ...wet, features: { ...wet.features, features: { ...wet.features.features, "prd07.wetness": false } } })).toThrow(/wetness metadata/);
    expect(() => createGeneratedPbrProgram({ ...wet, activeFeatures: wet.activeFeatures.map((item) => item.id === "prd07.wetness" ? { ...item, value: "on" } : item) })).toThrow(/wetness metadata/);
  });

  it("packs the four wetness scalars and refuses a caller puddle-noise texture", () => {
    const packed = packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
      ["u_wetness", 0.75], ["u_puddleThreshold", 0.25], ["u_rainRipples", 3], ["u_snowCover", 0.5],
      ["u_puddleNoise", new TextureBinding({ name: "u_puddleNoise", texture: null, required: false })]
    ]));
    const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
    expect([0, 1, 2, 3].map((index) => view.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.wetness! + index * 4, true))).toEqual([0.75, 0.25, 3, 0.5]);
    const defaults = packGeneratedPbrMaterialUniforms(new Map());
    const defaultView = new DataView(defaults.buffer, defaults.byteOffset, defaults.byteLength);
    expect(defaultView.getFloat32(GENERATED_PBR_MATERIAL_OFFSETS.wetness!, true)).toBe(0);
    const noise = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) });
    try {
      expect(() => packGeneratedPbrMaterialUniforms(new Map<string, UniformValue>([
        ["u_wetness", 0.5], ["u_puddleNoise", new TextureBinding({ name: "u_puddleNoise", texture: noise, required: false })]
      ]))).toThrow(/puddle-noise texture/);
    } finally { noise.dispose(); }
  });
});

describe("native wetness parity with the GLSL response", () => {
  it("uses the same constants as the GLSL chunk", () => {
    for (const [glsl, wgsl] of [["0.55", "A3D_WET_DARKEN: f32 = 0.55"], ["0.06", "A3D_WET_PUDDLE_ROUGHNESS: f32 = 0.06"],
      ["vec3(0.95, 0.96, 1.0)", "vec3f(0.95, 0.96, 1.0)"], ["mix(r, 0.9,", "A3D_SNOW_ROUGHNESS: f32 = 0.9"]] as const) {
      expect(PRD07_WETNESS_CHUNK_GLSL).toContain(glsl);
      expect(PRD07_WETNESS_WGSL).toContain(wgsl);
    }
    // The GLSL apply chunk passes porosity 1 and clamps roughness to [0.0525, 1].
    expect(PRD07_WETNESS_APPLY_CHUNK_GLSL).toContain("a3dWetnessAlbedo(material.baseColor, 1.0)");
    expect(PRD07_WETNESS_APPLY_CHUNK_GLSL).toContain("0.0525, 1.0)");
  });

  it("matches the GLSL CPU mirror with the WebGL2 white fallback noise texel", () => {
    // WebGL2 samples its 1x1 white fallback when u_puddleNoise is unbound, so
    // puddle = smoothstep(threshold, 1, 1) * wet = wet for threshold < 1.
    for (const wet of [0, 0.2, 0.5, 0.93, 1]) {
      for (const threshold of [0, 0.3, 0.62, 0.99]) {
        for (const snow of [0, 0.4, 1]) {
          for (const roughness of [0.0525, 0.3, 0.8, 1]) {
            const albedo = [0.2, 0.55, 0.9] as const;
            const puddle = glslSmoothstep(threshold, 1, 1) * wet;
            const glsl = applyWetnessMaterialCpu(albedo, roughness, wet, 1, puddle, snow);
            const native = applyNativeWetnessMaterialCpu(albedo, roughness, { wetness: wet, puddleThreshold: threshold, snowCover: snow });
            for (let index = 0; index < 3; index += 1) expect(native.albedo[index]).toBeCloseTo(glsl.albedo[index]!, 12);
            expect(native.roughness).toBeCloseTo(Math.min(1, Math.max(0.0525, glsl.roughness)), 12);
          }
        }
      }
    }
    // Wet surfaces get darker and smoother; snow whitens and roughens.
    const wet = applyNativeWetnessMaterialCpu([0.5, 0.5, 0.5], 0.8, { wetness: 1, puddleThreshold: 0.62, snowCover: 0 });
    expect(wet.albedo[0]).toBeCloseTo(0.275, 12);
    expect(wet.roughness).toBeCloseTo(0.06, 12);
  });

  it("matches GLSL smoothstep for sub-unit noise values", () => {
    for (const noise of [0, 0.3, 0.62, 0.8, 0.999]) {
      for (const threshold of [0, 0.5, 0.62]) {
        expect(nativeWetnessPuddleCpu(noise, threshold, 0.7)).toBeCloseTo(glslSmoothstep(threshold, 1, noise) * 0.7, 12);
      }
    }
    // Noise at the upper edge is inside the puddle, including threshold 1.
    expect(nativeWetnessPuddleCpu(1, 1, 0.7)).toBe(0.7);
  });
});

describe("native deferred wetness admission", () => {
  it("admits only the unchanged stock wetness feature", () => {
    const features = shaderFeaturesFor(flags);
    const selected = { "prd02.ibl": true, "prd07.wetness": true } as const;
    expect(admitNativeDeferredFeatures(selected, features, [], [])).toMatchObject({ ibl: true, wetness: true });
    expect(admitNativeDeferredFeatures({ "prd02.ibl": true }, features, [], []).wetness).toBeUndefined();
    const copy: ShaderFeature = { ...PRD07_WETNESS_SHADER_FEATURE };
    const replaced = features.map((feature) => feature === PRD07_WETNESS_SHADER_FEATURE ? copy : feature);
    expect(admitNativeDeferredFeatures(selected, replaced, [], []).reason).toMatch(/prd07.wetness requires the full forward renderer/);
    expect(admitNativeDeferredFeatures({ ...selected, "prd07.wetness": "on" }, features, [], []).reason).toMatch(/prd07.wetness/);
  });
});
