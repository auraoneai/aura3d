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
  prd02AmbientTerm,
  prd02ProbeBindIntensities
} from "../../../packages/engine/src/agent-api/compiler/environment";
import "../../../packages/rendering/src/lanes/prd02";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createExternalParityEnvironmentLighting } from "../../../packages/rendering/src/ExternalParityRenderPreset";
import { applyPrd02EnvironmentUniforms } from "../../../packages/rendering/src/ForwardPass";
import { collectEnvironmentLighting } from "../../../packages/rendering/src/renderer/Background";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { buildNeutralRoomLegacyProbe } from "../../../packages/rendering/src/environment/probeBuild";

const COMPILER_ON = resolveQrFlags({ options: { A3D_QR_COMPILER: true } });
const COMPILER_OFF = resolveQrFlags({ options: { A3D_QR_COMPILER: false } });
const CONJUNCTION_ON = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true } });
const LIGHTING_ONLY = resolveQrFlags({ options: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: true } });
const FLAGS_OFF = resolveQrFlags({ options: { A3D_QR_COMPILER: false, A3D_QR_LIGHTING: false } });

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

describe("E3 stage-2b step 1: PRD-02 IBL replaces the default indirect body", () => {
  const genFragment = (flags: typeof CONJUNCTION_ON, features: Record<string, boolean>) =>
    generateProgramImpl(
      normalizeProgramFeatures({
        pass: "forward",
        lighting: "lit",
        environment: "pmrem-cube",
        // hemisphere on: the default body would always-add procedural specular.
        lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: true },
        features
      } as never),
      { flags }
    );

  const DEFAULT_BODY_MARKERS = [
    "indirectDiffuse += a3dAmbientDiffuse(",
    "PI * a3dSampleEnvironment(N, 8.0)",
    "a3dProceduralSpecularRadiance(reflect(-V, N), material.roughness)"
  ];

  it("conjunction on: PRD-02 chunk symbols present, default body markers absent", () => {
    const program = genFragment(CONJUNCTION_ON, { "prd02.ibl": true });
    const { fragment } = program;
    expect(program.defines.A3D_PRD02_IBL).toBe(true);
    expect(fragment).toContain("uniform samplerCube u_envSpecular;");
    expect(fragment).toContain("a3dSH9Irradiance");
    expect(fragment).toContain("a3dIndirectDiffuseIrradiance(N)");
    expect(fragment).toContain("a3dEnvSpecularRadiance(N, V, material.roughness)");
    for (const marker of DEFAULT_BODY_MARKERS) expect(fragment).not.toContain(marker);
    // Lobe-IBL compatibility: exactly one a3dEnvIrradiance definition.
    expect(fragment.match(/vec3 a3dEnvIrradiance =/g)).toHaveLength(1);
  });

  it("conjunction off: program source is the legacy default body, PRD-02 absent", () => {
    const program = genFragment(LIGHTING_ONLY, { "prd02.ibl": true });
    const { fragment } = program;
    expect(program.defines.A3D_PRD02_IBL).toBeUndefined();
    for (const marker of DEFAULT_BODY_MARKERS) expect(fragment).toContain(marker);
    expect(fragment).not.toContain("a3dSH9Irradiance");
    expect(fragment).not.toContain("u_envSpecular");
  });

  it("conjunction on without the feature bit keeps the default body", () => {
    const { fragment } = genFragment(CONJUNCTION_ON, {});
    for (const marker of DEFAULT_BODY_MARKERS) expect(fragment).toContain(marker);
    expect(fragment).not.toContain("a3dSH9Irradiance");
  });
});

describe("E3 stage-2b step 2: half-float parity preset under the conjunction", () => {
  it("flag on: rgba16f/linear texture with explicit half mips; flag off: legacy RGBA8/sRGB", () => {
    const on = createExternalParityEnvironmentLighting("studio", CONJUNCTION_ON);
    const onTexture = on.lighting.environmentMapTexture?.texture;
    expect(on.resources.textureEncoding).toBe("rgba16f");
    expect(on.resources.outputColorSpace).toBe("linear");
    expect(on.lighting.environmentMapEncoding).toBe("linear");
    expect(onTexture?.format).toBe("rgba16f");
    expect(onTexture?.colorSpace).toBe("linear");
    expect(onTexture?.mipLevels.length).toBeGreaterThanOrEqual(4);
    expect(onTexture?.mipLevels[0]?.data).toBeInstanceOf(Uint16Array);

    const off = createExternalParityEnvironmentLighting("studio", FLAGS_OFF);
    const offTexture = off.lighting.environmentMapTexture?.texture;
    expect(off).not.toBe(on);
    expect(off.resources.textureEncoding).toBe("rgba8-srgb");
    expect(off.resources.outputColorSpace).toBe("srgb");
    expect(off.lighting.environmentMapEncoding).toBeUndefined();
    expect(offTexture?.format).toBe("rgba8");
    expect(offTexture?.colorSpace).toBe("srgb");
    expect(offTexture?.mipLevels[0]?.data).toBeInstanceOf(Uint8Array);

    // The two modes coexist in the cache (no order-dependent poisoning).
    expect(createExternalParityEnvironmentLighting("studio", FLAGS_OFF)).toBe(off);
    expect(createExternalParityEnvironmentLighting("studio", CONJUNCTION_ON)).toBe(on);
  });
});

describe("E3 stage-2b step 3: the knob survives the C-09 probe bind", () => {
  const explicitResolution = { kind: "explicit" as const, diffuseIntensity: 9, specularIntensity: 8 };

  it("conjunction + explicit resolution: both bound intensities equal the knob", () => {
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]), CONJUNCTION_ON);
    expect(prd02ProbeBindIntensities(lighting, explicitResolution, true)).toEqual({
      diffuseIntensity: 2,
      specularIntensity: 2
    });
  });

  it("conjunction off or neutral-room: resolution intensities are kept verbatim", () => {
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]), CONJUNCTION_ON);
    expect(prd02ProbeBindIntensities(lighting, explicitResolution, false)).toEqual({
      diffuseIntensity: 9,
      specularIntensity: 8
    });
    expect(
      prd02ProbeBindIntensities(lighting, { kind: "neutral-room" as const, diffuseIntensity: 1, specularIntensity: 1 }, true)
    ).toEqual({ diffuseIntensity: 1, specularIntensity: 1 });
  });

  it("bound knob reaches the renderer lighting, with the probe attached only under the conjunction", () => {
    const probe = buildNeutralRoomLegacyProbe();
    const { lighting } = createProductionRuntimeEnvironment(snapshot([studioEnv]), CONJUNCTION_ON);
    const bound = prd02ProbeBindIntensities(lighting, explicitResolution, true);
    try {
      setRendererQrFlags(CONJUNCTION_ON);
      const on = collectEnvironmentLighting({
        environmentProbe: probe,
        environmentProbeDiffuseIntensity: bound.diffuseIntensity,
        environmentProbeSpecularIntensity: bound.specularIntensity
      } as never);
      expect(on?.environmentMapIntensity).toBe(2);
      expect(on?.environmentMapSpecularIntensity).toBe(2);
      expect(on?.environmentProbe).toBe(probe);

      setRendererQrFlags(LIGHTING_ONLY);
      const off = collectEnvironmentLighting({ environmentProbe: probe } as never);
      expect(off?.environmentProbe).toBeUndefined();
    } finally {
      setRendererQrFlags(FLAGS_OFF);
    }
  });

  it("the pack multiplies the knob once by the per-material envMapIntensity", () => {
    const probe = buildNeutralRoomLegacyProbe();
    const uniforms = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(
      {
        color: [1, 1, 1],
        intensity: 0,
        environmentProbe: probe,
        environmentMapIntensity: 2,
        environmentMapSpecularIntensity: 2,
        environmentMapMipCount: probe.mipCount
      } as never,
      { label: "t" } as never,
      { getParameter: (name: string) => (name === "u_materialEnvironmentIntensity" ? 0.5 : undefined) } as never,
      uniforms as never
    );
    expect(uniforms.get("u_envDiffuseIntensity")).toBe(1);
    expect(uniforms.get("u_envSpecularIntensity")).toBe(1);
    expect(uniforms.get("u_envMipCount")).toBe(probe.mipCount);
    expect((uniforms.get("u_envSH") as Float32Array).length).toBe(28);
    expect(uniforms.has("u_envSpecular")).toBe(true);
    expect(uniforms.has("u_envDfgLut")).toBe(true);
  });
});
