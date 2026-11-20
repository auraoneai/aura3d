import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDefaultShaderLibrary,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT
} from "../../../packages/rendering/src";

// 5.7.1 bug 2: the WebGL2 textured-PBR program floored clearcoat roughness at 0.18 (0.19 + normal widening with the
// clearcoat texture variant), so glTF coats authored below ~0.19 (Vesper GT paint: 0.05) rendered blurrier than on
// WebGPU. The coat lobes now resolve roughness like the WebGPU generated program and the WebGL2 physical path.

const COAT_ROUGHNESS = "float coatRoughness = clamp(max(clearcoatAuthoredRoughness, 0.0525 + clearcoatNormalWidening) + clearcoatGeometryRoughness, 0.0525, 1.0);";
const GEOMETRY_ROUGHNESS = "float clearcoatGeometryRoughness = min(sqrt(max(dot(clearcoatGeometryNormalDx, clearcoatGeometryNormalDx), dot(clearcoatGeometryNormalDy, clearcoatGeometryNormalDy))), 1.0);";

function compiled(variant?: string): string {
  const library = createDefaultShaderLibrary();
  return (variant ? library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, variant) : library.compileSource(DEFAULT_TEXTURED_PBR_SHADER_NAME)).fragment;
}

describe("5.7.1 WebGL2 clearcoat roughness floor", () => {
  it.each([
    ["base", undefined],
    ["clearcoat textures", DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT],
    ["sheen/anisotropy textures", DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT]
  ])("resolves the coat roughness with the 0.0525 floor and the geometric term (%s)", (_name, variant) => {
    const fragment = compiled(variant);
    expect(fragment).toContain("vec3 clearcoatGeometryNormalDx = dFdx(geometryNormal);");
    expect(fragment).toContain("vec3 clearcoatGeometryNormalDy = dFdy(geometryNormal);");
    expect(fragment).toContain(GEOMETRY_ROUGHNESS);
    expect(fragment).toContain(COAT_ROUGHNESS);
    // The coat lobes read the resolved roughness: direct GGX D/G, the environment Fresnel and the environment sample.
    expect(fragment).toContain("float coatRough = clamp(coatRoughness, 0.0525, 1.0);");
    expect(fragment).toContain("float clearcoatD = a3dDistributionGGX(nDotH, coatRough);");
    expect(fragment).toContain("float clearcoatG = a3dGeometrySmithGGXCorrelated(nDotV, nDotL, coatRough);");
    expect(fragment).toContain("vec3 clearcoatF = a3dFresnelSchlickRoughness(vec3(0.04), nDotV, clamp(coatRoughness, 0.0525, 1.0));");
    expect(fragment).toContain("a3dTexturedPbrEnvironmentSpecularInput(clearcoatNormalDirection, viewDirection, clearcoat > 0.0 ? coatRoughness : clamp(clearcoatRoughness, 0.18, 1.0))");
    const direct = fragment.slice(fragment.indexOf("vec3 a3dTexturedPbrExtensionDirectLight("), fragment.indexOf("vec3 a3dTexturedPbrExtensionEnvironmentLight("));
    expect(direct.length).toBeGreaterThan(0);
    expect(direct).not.toContain("a3dDistributionGGX(nDotH, clearcoatRough)");
    expect(fragment).not.toContain("a3dFresnelSchlickRoughness(vec3(0.04), nDotV, clamp(clearcoatRoughness, 0.18, 1.0))");
    // Uncoated surfaces keep their 5.7.0 inputs: anisotropy shape and the transmission specular estimate.
    expect(fragment).toContain("float clearcoatRough = clamp(clearcoatRoughness, 0.18, 1.0);");
    expect(fragment).toContain("a3dTexturedPbrAnisotropicDistribution(N, H, tangentFrame, clearcoatRough, anisotropy, anisotropyRotation)");
    expect(fragment).toContain("float coatLobeRoughness = clearcoat > 0.0 ? coatRoughness : clearcoatRoughness;");
    expect(fragment).toMatch(/a3dApplyAdvancedPbrLobes\(\s*texturedBase\.rgb,\s*clearcoat,\s*coatLobeRoughness,/);
  });

  it("keeps the normal-map widening only where a clearcoat normal texture exists", () => {
    const base = compiled();
    const textured = compiled(DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT);
    expect(base).toContain("float clearcoatNormalWidening = 0.0;");
    expect(base).not.toContain("clearcoatNormalWidening = (1.0 - clearcoatNormalBoost)");
    expect(textured).toContain("clearcoatNormalWidening = (1.0 - clearcoatNormalBoost) * 0.12 * clearcoatNormalTextureWeight;");
    expect(textured).toContain("clearcoatAuthoredRoughness = clamp(clearcoatAuthoredRoughness * clearcoatRoughnessSample, 0.0, 1.0);");
    // The pre-5.7.1 value is still computed for the non-coat lobes.
    expect(textured).toContain("clearcoatRoughness = max(clearcoatRoughness, 0.19 + (1.0 - clearcoatNormalBoost) * 0.12);");
  });

  it("matches the WebGPU generated program and the WebGL2 physical path", () => {
    const webgpu = readFileSync(new URL("../../../packages/rendering/src/webgpu/GeneratedPbrProgram.ts", import.meta.url), "utf8");
    expect(webgpu).toContain("let coatGeometryRoughness = min(sqrt(max(dot(coatNormalDx, coatNormalDx), dot(coatNormalDy, coatNormalDy))), 1.0);");
    expect(webgpu).toMatch(/let coatRoughness = clamp\(max\(material\.coat\.y.*, 0\.0525\) \+ coatGeometryRoughness, 0\.0525, 1\.0\);/);
    const physical = readFileSync(new URL("../../../packages/rendering/src/shaders/physical/bsdf_lobes_common.glsl.ts", import.meta.url), "utf8");
    expect(physical).toContain("return clamp(max(factor, 0.0525) + max(geometricRoughness, 0.0), 0.0525, 1.0);");
  });

  it("CPU mirror: an authored 0.05 coat now resolves near the WebGPU value instead of the 0.18 floor", () => {
    const resolve = (authored: number, geometry: number, widening = 0) =>
      Math.min(Math.max(Math.max(authored, 0.0525 + widening) + geometry, 0.0525), 1);
    const legacy = (authored: number) => Math.max(authored, 0.18);
    expect(legacy(0.05)).toBe(0.18);
    expect(resolve(0.05, 0)).toBeCloseTo(0.0525, 6);
    expect(resolve(0.05, 0.02)).toBeCloseTo(0.0725, 6);
    // Authored values above the old floor only gain the geometric term.
    expect(resolve(0.4, 0)).toBeCloseTo(0.4, 6);
    expect(resolve(0.4, 0.9)).toBe(1);
  });
});
