import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCarConceptMaterialStability,
  carConceptMaterialVisualRole
} from "../../../packages/assets/src/CarConceptMaterialStability";

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
    expect(shaderSource).toContain("float faceOnSpecularGate = smoothstep(0.1, 0.42, nDotV);");
    expect(shaderSource).toContain("float materialFiniteSpecularScale = sqrt(materialEnvironmentSpecularScale);");
    expect(shaderSource).toContain("float proceduralSpecularScale = materialFiniteSpecularScale * mix(0.34, 1.0, faceOnSpecularGate);");
    expect(shaderSource).toContain("float sampledSpecularScale = materialEnvironmentSpecularScale * mix(0.18, 1.0, faceOnSpecularGate);");
    expect(shaderSource).toContain("float directExtensionSpecularScale = sqrt(clamp(u_materialEnvironmentSpecularScale, 0.0, 1.0)) * directExtensionGrazingGate;");
    expect(shaderSource).not.toContain("max(materialEnvironmentSpecularScale, 0.38)");
    expect(shaderSource).not.toContain("max(clamp(u_materialEnvironmentSpecularScale, 0.0, 1.0), 0.42)");
    expect(shaderSource).toContain("uniform float u_clearcoatNormalTextureEnabled;");
    expect(shaderSource).toContain("0.26 * clearcoatNormalTextureWeight");
    expect(shaderSource).toContain("step(0.5, u_specularTextureEnabled)");
    expect(shaderSource).toContain("step(0.5, u_iridescenceTextureEnabled)");
  });

  it("classifies visible car shell, lens, trim, and ambiguous material roles safely", () => {
    const cases = [
      [{ nodeName: "BodyRoofPanel", materialKey: "Paint 2 Carmine", sourceMaterialName: "Paint 2 Carmine" }, "roof-panel"],
      [{ nodeName: "BodyWindshield", materialKey: "Glass", sourceMaterialName: "Glass" }, "glass"],
      [{ nodeName: "BodyDoorLWindow", materialKey: "Glass", sourceMaterialName: "Glass" }, "glass"],
      [{ nodeName: "BodyCanopy", materialKey: "Glass", sourceMaterialName: "Glass" }, "glass"],
      [{ nodeName: "BodyHeadlights", materialKey: "Headlight", sourceMaterialName: "Headlight" }, "light-lens"],
      [{ nodeName: "BodyTaillights", materialKey: "Brakelight", sourceMaterialName: "Brakelight" }, "light-lens"],
      [{ nodeName: "BodyTurnsignalsRear", materialKey: "Signallight", sourceMaterialName: "Signallight" }, "light-lens"],
      [{ nodeName: "License Plate", materialKey: "License", sourceMaterialName: "License" }, "license-plate"],
      [{ nodeName: "UpperShell", materialKey: "Paint 2 Carmine", sourceMaterialName: "Paint 2 Carmine" }, "roof-panel"],
      [{ nodeName: "BodyPanelsColor2", materialKey: "Paint 2 Carmine", sourceMaterialName: "Paint 2 Carmine" }, "body-secondary-paint"],
      [{ nodeName: "FrontWheelArchL", materialKey: "Paint 2 Carmine", sourceMaterialName: "Paint 2 Carmine" }, "side-panel"],
      [{ nodeName: "BodyPillars", materialKey: "Paint 1 Carmine", sourceMaterialName: "Paint 1 Carmine" }, "pillar-trim"],
      [{ nodeName: "BodyWindshieldGasket", materialKey: "material-2", sourceMaterialName: "material-2" }, "dark-trim"],
      [{ nodeName: "BodyWindshieldWipers", materialKey: "Material 2", sourceMaterialName: "Material 2" }, "dark-trim"],
      [{ nodeName: "InteriorSteeringBase", materialKey: "material-2", sourceMaterialName: "material-2" }, "interior"],
      [{ nodeName: "mesh-85-primitive-0", materialKey: "Panel Sides", sourceMaterialName: "Panel Sides" }, "side-panel"]
    ] as const;

    for (const [context, role] of cases) {
      expect(carConceptMaterialVisualRole(context)).toBe(role);
    }
  });

  it("finalizes classified Product renderables without leaking GLB physical material state", () => {
    const headlight = createMaterial("Headlight");
    headlight.setParameter("u_transmissionFactor", 1);
    headlight.setParameter("u_clearcoatFactor", 0.8);
    headlight.setParameter("u_iridescenceFactor", 0.5);
    headlight.setParameter("u_emissiveStrength", 10);
    headlight.setParameter("u_emissiveColor", [0.54, 0.74, 1]);

    applyCarConceptMaterialStability(headlight as never, {
      nodeName: "BodyHeadlights",
      materialKey: "Headlight",
      sourceMaterialName: "Headlight",
      profile: "gallery"
    });

    expect(headlight.parameters.get("u_baseColor")).toEqual([0.022, 0.024, 0.024, 1]);
    expect(headlight.parameters.get("u_transmissionFactor")).toBe(0);
    expect(headlight.parameters.get("u_clearcoatFactor")).toBe(0.04);
    expect(headlight.parameters.get("u_iridescenceFactor")).toBe(0);
    expect(headlight.parameters.get("u_emissiveStrength")).toBe(0);
    expect(headlight.parameters.get("u_emissiveColor")).toEqual([0, 0, 0]);
    expect(headlight.parameters.get("u_opacity")).toBe(1);
    expect(headlight.parameters.get("u_transparent")).toBe(0);
  });
});

function createMaterial(name: string) {
  return {
    name,
    parameters: new Map<string, unknown>(),
    setParameter(parameterName: string, value: unknown): void {
      this.parameters.set(parameterName, value);
    },
    getParameter(parameterName: string): unknown {
      return this.parameters.get(parameterName);
    }
  };
}
