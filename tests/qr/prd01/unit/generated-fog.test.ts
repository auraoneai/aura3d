/**
 * Scenes 09/17/18 under A3D_QR_CORE (L4 promote 38164404771; flags-bisect
 * 38166856950 attributes it to core_generator): generated programs drew no fog.
 * fog_default declares u_fogColor / u_fogRange / u_fogDensity /
 * u_fogHeightFalloff, but ForwardPass never bound them, so the exp2 factor was
 * 1 - exp(0) = 0 and distant surfaces kept their own colour.
 */

import { describe, expect, it } from "vitest";
import { applyGeneratedFogUniforms, forwardPassFeatureAxes, generatedFogUniformValues } from "../../../../packages/rendering/src/ForwardPass";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";

const shaderWith = (...names: string[]) => ({ reflection: { uniforms: new Map(names.map((n) => [n, {}])) } }) as never;
const FOG_UNIFORMS = ["u_fogColor", "u_fogRange", "u_fogDensity", "u_fogHeightFalloff"];

// Scene 18-game-scene fog through the engine bridge: exponential-squared, linear #8fa3b8.
const sceneFog = {
  mode: "exponential-squared" as const,
  color: [0.2747, 0.3613, 0.4793] as const,
  near: 0.1,
  far: 200,
  density: 0.03,
  maxOpacity: 0.8
};

/** CPU mirror of fog_default's exp2 branch. */
function exp2Factor(density: number, depth: number): number {
  const d = density * depth;
  return Math.min(1, Math.max(0, 1 - Math.exp(-d * d)));
}

describe("generated-program fog (core_generator)", () => {
  it("the generator declares the fog_default uniforms and calls a3dApplyFog whenever the frame has fog", () => {
    const axes = forwardPassFeatureAxes({ environmentFog: sceneFog } as never, false);
    expect(axes.fog).toBe("exp2");
    const fragment = generateProgramImpl(normalizeProgramFeatures({ ...axes, lighting: "pbr" } as never)).fragment;
    for (const name of FOG_UNIFORMS) expect(fragment).toContain(name);
    expect(fragment).toContain("a3dApplyFog(a3dColor");
  });

  it("binds every fog_default uniform from the frame fog (none left at 0)", () => {
    const uniforms = new Map<string, unknown>();
    applyGeneratedFogUniforms(sceneFog as never, shaderWith(...FOG_UNIFORMS), uniforms as never);
    expect(uniforms.get("u_fogColor")).toEqual([...sceneFog.color]);
    expect(uniforms.get("u_fogRange")).toEqual([0.1, 200]);
    expect(uniforms.get("u_fogDensity")).toBe(0.03);
    expect(uniforms.get("u_fogHeightFalloff")).toBe(0);
    // At 30 m the scene's exp2 fog is > 50 % (three.js FogExp2); unbound it was 0.
    expect(exp2Factor(uniforms.get("u_fogDensity") as number, 30)).toBeGreaterThan(0.5);
    expect(exp2Factor(0, 30)).toBe(0);
  });

  it("binds an exp2 program whose reflection omits the inactive u_fogRange (active uniforms only)", () => {
    const uniforms = new Map<string, unknown>();
    applyGeneratedFogUniforms(sceneFog as never, shaderWith("u_fogColor", "u_fogDensity"), uniforms as never);
    expect(uniforms.get("u_fogDensity")).toBe(0.03);
    expect(uniforms.get("u_fogColor")).toEqual([...sceneFog.color]);
    expect(uniforms.has("u_fogRange")).toBe(false);
    const linear = new Map<string, unknown>();
    applyGeneratedFogUniforms({ ...sceneFog, mode: "linear", near: 5, far: 60 } as never, shaderWith("u_fogColor", "u_fogRange"), linear as never);
    expect(linear.get("u_fogRange")).toEqual([5, 60]);
  });

  it("keeps a u_fogColor lane 07's PRD-07 fog chunk already set (#880 shared uniform)", () => {
    const uniforms = new Map<string, unknown>([["u_fogColor", [1, 0, 0]]]);
    applyGeneratedFogUniforms(sceneFog as never, shaderWith(...FOG_UNIFORMS), uniforms as never);
    expect(uniforms.get("u_fogColor")).toEqual([1, 0, 0]);
    expect(uniforms.get("u_fogDensity")).toBe(0.03);
  });

  it("is a no-op for programs without fog_default (legacy programs, fog-free frames)", () => {
    const legacy = new Map<string, unknown>();
    applyGeneratedFogUniforms(sceneFog as never, shaderWith("u_environmentFogColor", "u_fogColor"), legacy as never);
    expect(legacy.size).toBe(0);
    const noFog = new Map<string, unknown>();
    applyGeneratedFogUniforms(undefined, shaderWith(...FOG_UNIFORMS), noFog as never);
    applyGeneratedFogUniforms(false, shaderWith(...FOG_UNIFORMS), noFog as never);
    expect(noFog.size).toBe(0);
    expect(generatedFogUniformValues(undefined)).toBeUndefined();
  });

  it("linear fog maps near/far into u_fogRange", () => {
    const uniforms = new Map<string, unknown>();
    applyGeneratedFogUniforms({ ...sceneFog, mode: "linear", near: 5, far: 60 } as never, shaderWith(...FOG_UNIFORMS), uniforms as never);
    expect(uniforms.get("u_fogRange")).toEqual([5, 60]);
  });
});
