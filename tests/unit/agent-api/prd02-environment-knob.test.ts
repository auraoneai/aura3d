/**
 * prd02-environment-knob.test.ts — 4.0 Live Fix E3 stage-2a.
 *
 * Under A3D_QR_COMPILER the authored-environment bundle collapses its
 * five stacked preset scalars to ONE knob (intensity =
 * environmentMapIntensity = environmentMapSpecularIntensity = authored
 * intensity, procedural zeroed). Flag-off keeps the legacy scalar stack.
 * Authored ambient stays additive OUTSIDE the knob (F-02-01 / C-09):
 * environments.none() zeroes IBL but never the ambient term — pinned
 * here because no ambient-additivity assertion existed before.
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { AuraSceneSnapshot } from "@aura3d/engine";
import {
  createProductionRuntimeEnvironment,
  explicitEnvironmentResolution,
  prd02AmbientTerm
} from "../../../packages/engine/src/agent-api/compiler/environment";

const COMPILER_ON = resolveQrFlags({ options: { A3D_QR_COMPILER: true } });
const COMPILER_OFF = resolveQrFlags({ options: { A3D_QR_COMPILER: false } });

const snapshot = (nodes: readonly unknown[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 2, 5], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const studioEnv = { kind: "environment", environment: "studio", intensity: 2 };
const ambientLight = { kind: "light", light: "ambient", intensity: 0.7, color: "#ffffff" };

describe("authored environment IBL knob (E3-1)", () => {
  it("flag off: legacy preset scalar stack scales the authored intensity", () => {
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]), COMPILER_OFF);
    // Studio bundle scalars traced in wave-3: sampled 0.44/0.92,
    // procedural 0.5/0.86, base intensity 0.18.
    expect(lighting.environmentMapIntensity).toBeCloseTo(0.44 * 2);
    expect(lighting.environmentMapSpecularIntensity).toBeCloseTo(0.92 * 2);
    expect(lighting.intensity).toBeCloseTo(0.18 * 2);
    expect(lighting.proceduralMap?.intensity).toBeCloseTo(0.5 * 2);
    expect(lighting.proceduralMap?.specularIntensity).toBeCloseTo(0.86 * 2);
  });

  it("flag on: one knob — every sampled intensity equals the authored intensity, procedural zeroed", () => {
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]), COMPILER_ON);
    expect(lighting.intensity).toBe(2);
    expect(lighting.environmentMapIntensity).toBe(2);
    expect(lighting.environmentMapSpecularIntensity).toBe(2);
    expect(lighting.proceduralMap?.intensity).toBe(0);
    expect(lighting.proceduralMap?.specularIntensity).toBe(0);
  });

  it("no flags argument keeps the legacy stack (callers without app flags)", () => {
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]));
    expect(lighting.environmentMapIntensity).toBeCloseTo(0.44 * 2);
  });
});

describe("C-09 ambient additivity pin (F-02-01)", () => {
  it("authored ambient survives environments.none() while IBL zeroes", () => {
    const snap = snapshot([ambientLight]);
    const ambient = prd02AmbientTerm(snap);
    expect(ambient).not.toBeNull();
    expect(ambient?.intensity).toBeCloseTo(0.7);

    const resolution = explicitEnvironmentResolution(
      { kind: "environment", environment: "none" } as Parameters<typeof explicitEnvironmentResolution>[0],
      ambient
    );
    expect(resolution?.diffuseIntensity).toBe(0);
    expect(resolution?.specularIntensity).toBe(0);
    expect(resolution?.intensity).toBe(0);
    // The knob never touches the ambient term.
    expect(resolution?.ambient).toEqual(ambient);
  });

  it("no ambient light resolves a null ambient term", () => {
    expect(prd02AmbientTerm(snapshot([studioEnv]))).toBeNull();
  });
});
