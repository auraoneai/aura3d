import { describe, expect, it } from "vitest";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { shaderChunk, shaderFeaturesFor, type ShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { depthVariantFeaturesFor } from "../../../packages/rendering/src/contracts/shadows";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { DrawDataTexture, drawDataBindingFor } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { isOriginalBatchedDrawDepthFeature, isOriginalBatchedDrawFeature, registerBatchedDrawShader } from "../../../packages/rendering/src/batching/shaders/ParityBatchDraw";
import { selectShaderFeatureBits } from "../../../packages/rendering/src/program/FeatureSelect";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { withCombinedDrawCarrier } from "../../../packages/rendering/src/batching/CombinedDrawCarrier";
import { registerPrd11DrawIdShader } from "../../../packages/rendering/src/batching/shaders/drawId.glsl";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";

describe("original parity batch shader registration", () => {
  it("registers the original forward and depth features and keeps public markers on the uniform loop", () => {
    registerBatchedDrawShader();
    registerBatchedDrawShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
    const forward = shaderFeaturesFor(flags).filter((feature) => feature.id === "parity.batchDraw");
    const depth = depthVariantFeaturesFor(flags).filter((feature) => feature.id === "parity.batchDraw.depth");
    expect(forward).toHaveLength(1);
    expect(depth).toHaveLength(1);
    expect(isOriginalBatchedDrawFeature(forward[0]!)).toBe(true);
    expect(isOriginalBatchedDrawDepthFeature(depth[0]!)).toBe(true);
    expect(depth[0]!.passes).toEqual(["depth", "distance"]);
    expect(Object.isFrozen(depth[0]!.passes)).toBe(true);
    for (const name of ["a3d_l5_batch_draw_pars", "a3d_l5_batch_draw_world", "a3d_l5_batch_draw_frag"]) {
      expect(Object.isFrozen(shaderChunk(name))).toBe(true);
    }

    const data = new DrawDataTexture(1);
    try {
      const texture = data.upload();
      const item = { multiDraw: { mode: "multi-draw", drawIndex: 0, drawData: texture } } as unknown as RenderItem;
      const input = { item, pass: "forward" as const, flags, tier: QUALITY_TIERS.high };
      expect(forward[0]!.select(input)).toBe("multi-draw");
      expect(forward[0]!.select({ ...input, pass: "depth" })).toBeUndefined();
      const bits = selectShaderFeatureBits(input);
      expect(bits["parity.batchDraw"]).toBe("loop");
      const program = generateProgramImpl(normalizeProgramFeatures({ pass: "forward", lighting: "lit", features: bits }), { flags });
      expect(program.defines.A3D_L5_FORWARD).toBe(true);
      expect(program.defines.A3D_L5_MULTI_DRAW).toBeUndefined();
      expect(program.vertex).toContain("uniform highp int u_drawId;");
      expect(program.vertex).toContain("instanceMatrix = a3dL5Model;");
      const uniforms = new Map<string, unknown>();
      forward[0]!.bindUniforms!("loop", item, (name, value) => uniforms.set(name, value));
      expect(uniforms.get("u_drawId")).toBe(0);
      expect(uniforms.get("u_a3dDrawData")).toBe(drawDataBindingFor(texture));
    } finally { data.dispose(); }
  });

  it("rejects replacements, proxies, and in-place changes without trusting their public names", () => {
    registerBatchedDrawShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
    const original = shaderFeaturesFor(flags).find((feature) => feature.id === "parity.batchDraw")!;
    expect(isOriginalBatchedDrawFeature({ ...original })).toBe(false);
    let traps = 0;
    const proxy = new Proxy(original, { get() { traps += 1; throw new Error("identity guard inspected a proxy"); } });
    expect(isOriginalBatchedDrawFeature(proxy)).toBe(false);
    expect(traps).toBe(0);

    const selectDescriptor = Object.getOwnPropertyDescriptor(original, "select")!;
    try {
      Object.defineProperty(original, "select", { ...selectDescriptor, value: () => "loop" });
      expect(isOriginalBatchedDrawFeature(original)).toBe(false);
    } finally { Object.defineProperty(original, "select", selectDescriptor); }
    expect(isOriginalBatchedDrawFeature(original)).toBe(true);

    const hooks = original.hooks as ShaderFeature["hooks"] & string[];
    hooks.push("vertex:end");
    try { expect(isOriginalBatchedDrawFeature(original)).toBe(false); }
    finally { hooks.pop(); }
    expect(isOriginalBatchedDrawFeature(original)).toBe(true);
  });

  it("selects exactly one original native shader feature only within the private carrier scope", () => {
    registerBatchedDrawShader();
    registerPrd11DrawIdShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true, A3D_QR_TIERS_BATCHING: true });
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), rows = new DrawDataTexture(2);
    try {
      const source: RenderItem = { geometry, material };
      withCombinedDrawCarrier(source, rows.upload(), (item) => {
        const input = { item, pass: "forward" as const, flags, tier: QUALITY_TIERS.high };
        const bits = selectShaderFeatureBits(input);
        expect(bits["parity.batchDraw"]).toBe("multi-draw");
        expect(bits["prd11.drawId"]).toBeUndefined();
        const program = generateProgramImpl(normalizeProgramFeatures({ pass: "forward", lighting: "unlit", features: bits }), { flags });
        expect(program.defines.A3D_L5_MULTI_DRAW).toBe(true);
        expect(program.vertex).toContain("#extension GL_ANGLE_multi_draw : warn");
        expect(program.vertex).toContain("#define a3d_l5_draw_index gl_DrawID");
        expect(selectShaderFeatureBits({ ...input, item: { ...item } })["parity.batchDraw"]).toBe("loop");
      });
    } finally { rows.dispose(); material.dispose(); geometry.dispose(); }
  });

  it("reconstructs tinted PBR diffuse and dielectric/metallic specular from the final base color", () => {
    registerBatchedDrawShader();
    const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
    const program = generateProgramImpl(normalizeProgramFeatures({
      pass: "forward", lighting: "lit", features: { "parity.batchDraw": "loop" }
    }), { flags });
    const shader = program.fragment;
    expect(shader).toContain("material.baseColor = max(a3dBaseColor.rgb, vec3(0.0));");
    expect(shader).toContain("material.diffuseContribution = a3dL5ClampedColor * (1.0 - material.metallic);");
    expect(shader).toContain("material.specularColorBlended = mix(material.specularColor, a3dL5ClampedColor, material.metallic);");
    expect(shader).not.toContain("material.specularColorBlended *= v_a3dL5DrawColor.rgb;");
    expect(shader.indexOf("a3dBaseColor *= v_a3dL5DrawColor;")).toBeLessThan(shader.indexOf("float a3dAlpha = a3dBaseColor.a;"));

    // Independent scalar examples: dielectric F0 stays 0.04 under tint,
    // whereas a fully metallic surface follows the tinted base. Clamp happens
    // after the tint, including an HDR base value greater than one.
    const shade = (base: number, tint: number, metallic: number) => {
      const finalBase = Math.min(1, Math.max(0, base * tint));
      return { diffuse: finalBase * (1 - metallic), specular: 0.04 * (1 - metallic) + finalBase * metallic };
    };
    expect(shade(0.8, 0.25, 0)).toEqual({ diffuse: 0.2, specular: 0.04 });
    expect(shade(0.8, 0.25, 1)).toEqual({ diffuse: 0, specular: 0.2 });
    expect(shade(0.8, 0.25, 0.25).specular).toBeCloseTo(0.08, 12);
    expect(shade(4, 0.5, 0.5)).toEqual({ diffuse: 0.5, specular: 0.52 });
  });
});
