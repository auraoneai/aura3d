import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("wow neon city car material stability", () => {
  it("keeps the delayed HDR environment from reintroducing white car speckle", () => {
    const wowSource = readFileSync("apps/wow-neon-city/src/main.ts", "utf8");
    const v8Source = readFileSync("packages/engine/src/v8/index.ts", "utf8");
    const carProfileSource = readFileSync("packages/assets/src/CarConceptMaterialStability.ts", "utf8");
    const pmremSource = readFileSync("packages/rendering/src/v6/environment/PMREMGenerator.ts", "utf8");
    const materialSource = readFileSync("packages/rendering/src/TexturedPBRMaterial.ts", "utf8");
    const shaderSource = readFileSync("packages/rendering/src/ShaderLibrary.ts", "utf8");

    expect(wowSource).toContain("clearcoatBoost: 0");
    expect(wowSource).not.toContain("clearcoatBoost: 0.28");

    expect(v8Source).toContain("environmentMapSpecularIntensity: carConcept ? Math.min(environmentMapSpecularIntensity, 0.012)");
    expect(v8Source).toContain("Math.min(base.proceduralMap.specularIntensity * exposure, 0.01)");
    expect(v8Source).toContain("applyCarConceptMaterialStability(material, {");
    expect(v8Source).toContain('profile: "cinematic"');
    expect(v8Source).toContain('carConceptMaterialRenderStateOverrides("v8-flagship")');
    expect(carProfileSource).toContain('material.setParameter("u_normalTextureEnabled", 0);');
    expect(carProfileSource).toContain('material.setParameter("u_specularTextureEnabled", 0);');
    expect(carProfileSource).toContain('material.setParameter("u_specularColorTextureEnabled", 0);');
    expect(carProfileSource).toContain('material.setParameter("u_clearcoatFactor", 0);');
    expect(carProfileSource).toContain('material.setParameter("u_materialEnvironmentSpecularScale", 0.001);');
    expect(carProfileSource).toContain('carConceptMaterialRenderStateOverrides');

    expect(materialSource).toContain("u_clearcoatNormalTextureEnabled: options.clearcoatNormalTexture ? 1 : 0");
    expect(materialSource).toContain("u_specularTextureEnabled: options.specularTexture ? 1 : 0");
    expect(materialSource).toContain("u_iridescenceTextureEnabled: options.iridescenceTexture ? 1 : 0");
    expect(pmremSource).toContain("function sampleEquirectTexel");
    expect(pmremSource).toContain("return mixRgb(top, bottom, ty);");
    expect(shaderSource).toContain("float faceOn = smoothstep(0.2, 0.72, clamp(nDotV, 0.0, 1.0));");
    expect(shaderSource).toContain("float edgeCap = mix(0.035, 0.86, faceOn) * roughEnergy;");
    expect(shaderSource).toContain("float edgeScale = mix(0.045, 0.78, faceOn);");
    expect(shaderSource).toContain("float grazingSpecularGate = smoothstep(0.12, 0.58, nDotV);");
    expect(shaderSource).toContain("uniform float u_clearcoatNormalTextureEnabled;");
    expect(shaderSource).toContain("0.26 * clearcoatNormalTextureWeight");
    expect(shaderSource).toContain("step(0.5, u_specularTextureEnabled)");
    expect(shaderSource).toContain("step(0.5, u_iridescenceTextureEnabled)");
  });
});
