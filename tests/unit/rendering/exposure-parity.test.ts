/**
 * exposure-parity.test.ts: beat-three.js PRD WP-Q.1 / contract 3.2.
 *
 * One rule: a directional light of intensity I on a Lambert surface of albedo
 * A produces the same linear output as three.js r185 (`A * I / PI`), with no
 * implicit environment added on top when the scene authors its own lights.
 *
 * Node CPU reference. The remote measurement of the same fixtures is
 * `tests/browser/exposure-calibration.spec.ts` (4.3.7 baseline: 2.0x to 13x
 * too bright on every direct-light pair because the scene-category studio
 * environment stacked on the authored lights).
 */
import { describe, expect, it } from "vitest";
import type { AuraSceneSnapshot } from "@aura3d/engine";
import { createProductionRuntimeEnvironment } from "../../../packages/engine/src/agent-api/compiler/environment";
import { COMMON_CHUNK_GLSL } from "../../../packages/rendering/src/program/chunks/common.glsl";
import { LIGHTS_LEGACY_CHUNK_GLSL } from "../../../packages/rendering/src/program/chunks/lights_legacy.glsl";
import { createProductionRuntimeCollectedLights } from "../../../packages/engine/src/agent-api/compiler/observations";
import { ambientToExitRadiance } from "../../../packages/rendering/src/LightUniforms";
import { EXPOSURE_CASES, THREE_DIELECTRIC_LOBE_ROUGH1, expectedLinear, srgbHexToLinear, threeLambertLinear, type ExposureCase } from "../../browser/exposure-reference";

const snapshot = (nodes: readonly unknown[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 4, 0], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

function lightNode(c: ExposureCase): unknown[] {
  if (c.light === "none") return [];
  // A hemisphere with sky == ground is uniform, so its value does not depend on the surface normal.
  const ground = c.light === "hemisphere" ? { groundColor: c.lightColor ?? "#ffffff" } : {};
  return [{ kind: "light", light: c.light, name: c.id, intensity: c.intensity, ...(c.lightColor ? { color: c.lightColor } : {}), ...ground, position: [0, 5, 0] }];
}

type Vec3 = readonly [number, number, number];

/** Head-on roughness-1 dielectric lobe (F0 0.04); the remote spec measures the real shader's lobe against the same constant. */
const dielectricLobe = THREE_DIELECTRIC_LOBE_ROUGH1;

/**
 * Linear output of a head-on Lambert plane as the engine computes it:
 * direct = A * (colour * I) / PI (the generated program's BRDF_Lambert times the
 * packed light radiance, both asserted below), plus the environment bundle the
 * scene compiles to (ambient exit radiance and the procedural hemisphere).
 */
function engineLinear(c: ExposureCase, implicitFill: boolean | undefined): Vec3 {
  const albedo = srgbHexToLinear(c.albedo);
  const env = createProductionRuntimeEnvironment(snapshot(lightNode(c)), undefined, implicitFill === undefined ? undefined : { implicitFill }).lighting;
  const lightColor = srgbHexToLinear(c.lightColor ?? "#ffffff");
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    let radiance = 0;
    if (c.light === "directional") radiance += lightColor[i]! * c.intensity / Math.PI;
    radiance += ambientToExitRadiance(env.color ?? [1, 1, 1], env.intensity ?? 0)[i]!;
    const specular = c.light === "directional" ? lightColor[i]! * c.intensity * dielectricLobe : 0;
    out[i] = albedo[i]! * radiance + specular;
  }
  return out;
}

describe("exposure parity with three.js r185 light units (Q1)", () => {
  it("pins the shader constants the CPU reference relies on", () => {
    expect(COMMON_CHUNK_GLSL).toContain("vec3 BRDF_Lambert(vec3 diffuseColor) { return RECIPROCAL_PI * diffuseColor; }");
    // Directional radiance is colour * intensity with no PI multiplier (three r155+ units).
    expect(LIGHTS_LEGACY_CHUNK_GLSL).toContain("return colorIntensity.rgb * colorIntensity.a;");
    expect(ambientToExitRadiance([1, 1, 1], Math.PI)).toEqual([1, 1, 1]);
  });

  // Single-light fixtures only; the combined fill + sun cases are measured by the remote spec.
  const fixtures = EXPOSURE_CASES.filter((c) => c.light === "directional" || c.light === "ambient" || c.light === "hemisphere");
  it("has five or more light/albedo pairs", () => {
    expect(fixtures.filter((c) => c.light === "directional").length).toBeGreaterThanOrEqual(5);
  });

  for (const c of fixtures) {
    it(`${c.id}: authored lights land within 3% of three (mean luma and each channel)`, () => {
      const got = engineLinear(c, false);
      const want = expectedLinear(c);
      const luma = (v: Vec3): number => v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      expect(Math.abs(luma(got) / luma(want) - 1)).toBeLessThanOrEqual(0.03);
      for (let i = 0; i < 3; i += 1) expect(Math.abs(got[i]! / Math.max(want[i]!, 1e-9) - 1)).toBeLessThanOrEqual(0.03);
    });
  }

  it("a hemisphere light lights a horizontal-normal surface with mean(sky, ground) * I / PI", () => {
    const nodes = [{ kind: "light", light: "hemisphere", name: "h", intensity: 1.3, color: "#dce8f2", groundColor: "#4d6358", position: [0, 1, 0] }];
    const env = createProductionRuntimeEnvironment(snapshot(nodes), undefined, { implicitFill: false }).lighting;
    const a = srgbHexToLinear("#808080");
    const sky = srgbHexToLinear("#dce8f2");
    const ground = srgbHexToLinear("#4d6358");
    const exit = ambientToExitRadiance(env.color, env.intensity);
    for (let i = 0; i < 3; i += 1) expect(a[i]! * exit[i]!).toBeCloseTo(a[i]! * ((sky[i]! + ground[i]!) / 2) * 1.3 / Math.PI, 6);
    expect(Math.max(...env.color), "renderer validates the environment colour into [0, 1]").toBeLessThanOrEqual(1);
  });

  it("the legacy path (implicitFill left unset) keeps the scene-category fill, so flag-off goldens stay byte-equal", () => {
    const c = EXPOSURE_CASES.find((x) => x.id === "dir-1-grey")!;
    const env = createProductionRuntimeEnvironment(snapshot(lightNode(c))).lighting;
    expect((env.environmentMapIntensity ?? 0) > 0 || env.proceduralMap !== undefined).toBe(true);
    const explicit = createProductionRuntimeEnvironment(snapshot(lightNode(c)), undefined, { implicitFill: false }).lighting;
    expect(explicit.environmentMapIntensity).toBe(0);
    expect(explicit.environmentMapSpecularIntensity).toBe(0);
    expect(explicit.proceduralMap).toBeUndefined();
  });

  it("an authored environment node restores the studio fill (the one-line override)", () => {
    const c = EXPOSURE_CASES.find((x) => x.id === "dir-1-grey")!;
    const env = createProductionRuntimeEnvironment(
      snapshot([...lightNode(c), { kind: "environment", environment: "studio", intensity: 1 }]),
      undefined,
      { implicitFill: false }
    );
    expect(env.preset).toBe("studio");
    expect((env.lighting.environmentMapIntensity ?? 0) > 0 || env.lighting.proceduralMap !== undefined).toBe(true);
  });

  it("a scene with no lights keeps the category environment (three would render black; Aura3D still shows the scene)", () => {
    const env = createProductionRuntimeEnvironment(snapshot([]), undefined, { implicitFill: false });
    expect(env.preset).not.toBe("authored-lights");
  });

  it("ambient-only scenes are unchanged by the new rule", () => {
    const c = EXPOSURE_CASES.find((x) => x.id === "amb-1-grey")!;
    const a = createProductionRuntimeEnvironment(snapshot(lightNode(c)), undefined, { implicitFill: false }).lighting;
    const b = createProductionRuntimeEnvironment(snapshot(lightNode(c))).lighting;
    expect(a.intensity).toBe(b.intensity);
    expect(a.color).toEqual(b.color);
    expect(threeLambertLinear("#808080", 1)[0]).toBeGreaterThan(0);
  });

  it("a hemisphere light is environment irradiance, never a direct light (it used to become a rect spot proxy)", () => {
    const hemi = { kind: "light", light: "hemisphere", name: "h", intensity: 1.3, position: [0, 1, 0] };
    const sun = { kind: "light", light: "directional", name: "sun", intensity: 2.2, position: [6, 12, 4] };
    const flags = { on: (name: string) => name === "A3D_QR_LIGHTING" };
    const legacy = createProductionRuntimeCollectedLights(snapshot([hemi, sun]), flags);
    const fixed = createProductionRuntimeCollectedLights(snapshot([hemi, sun]), flags, { hemisphereAsEnvironment: true });
    expect(legacy.length).toBe(2);
    expect(fixed.map((light) => light.kind)).toEqual(["directional"]);
    expect(createProductionRuntimeCollectedLights(snapshot([hemi]), flags, { hemisphereAsEnvironment: true })).toEqual([]);
  });
});
