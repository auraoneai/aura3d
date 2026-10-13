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
import { createHash } from "node:crypto";
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
import { applyEnvironmentLightingUniforms, applyPrd02EnvironmentUniforms, prd02IblEnvironmentAvailable } from "../../../packages/rendering/src/ForwardPass";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { collectEnvironmentLighting, DEFAULT_RENDERER_ENVIRONMENT_LIGHTING } from "../../../packages/rendering/src/renderer/Background";
import { DEFAULT_PBR_ENVIRONMENT_INTENSITY } from "../../../packages/rendering/src/PBRLightingDefaults";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { buildNeutralRoomLegacyProbe } from "../../../packages/rendering/src/environment/probeBuild";
import { Texture } from "../../../packages/rendering/src/Texture";

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

describe("E3 stage-2b PR review fixes: item cube, cube-only gate, instance multiplier", () => {
  // Cheap pack/gate fixtures: the pack reads only specularCube/mipCount/sh9
  // (EnvUniforms Pick) and the gate only texture dimension + sh9 length, so
  // a 2px cube + known SH9 exercises the seam without a room-probe build.
  const makeCubeTexture = (label: string) =>
    new Texture({
      width: 2,
      height: 2,
      format: "rgba16f",
      label,
      cubeFaces: (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face) => ({
        face,
        mipLevels: [
          { width: 2, height: 2, data: new Uint16Array(16) },
          { width: 1, height: 1, data: new Uint16Array(4) }
        ]
      }))
    });
  const makeProbe = (label: string, shSeed = 1) => {
    const sh9 = new Float32Array(27);
    sh9[0] = shSeed;
    sh9[1] = shSeed * 2;
    sh9[2] = shSeed * 3;
    return { specularCube: makeCubeTexture(label), mipCount: 2, sh9 };
  };

  it("per-item reflection cube wins for u_envSpecular while scene probe SH is retained", () => {
    const sceneProbe = makeProbe("scene-cube");
    const itemProbe = makeProbe("item-cube", 7);
    expect(itemProbe.specularCube).not.toBe(sceneProbe.specularCube);
    const env = {
      color: [1, 1, 1],
      intensity: 0,
      environmentProbe: sceneProbe,
      environmentCubeMapTexture: new TextureBinding({
        name: "u_environmentCubeMapTexture",
        texture: sceneProbe.specularCube,
        required: false
      }),
      environmentMapIntensity: 1,
      environmentMapSpecularIntensity: 1,
      environmentMapMipCount: sceneProbe.mipCount
    };
    const material = { getParameter: () => 1 } as never;

    const baseline = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(env as never, { label: "t" } as never, material, baseline as never);
    expect((baseline.get("u_envSpecular") as TextureBinding).texture).toBe(sceneProbe.specularCube);

    const uniforms = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(
      env as never,
      {
        label: "t",
        environmentCube: new TextureBinding({
          name: "u_environmentCubeMapTexture",
          texture: itemProbe.specularCube,
          required: false
        }),
        environmentCubeMip: 5
      } as never,
      material,
      uniforms as never
    );
    expect((uniforms.get("u_envSpecular") as TextureBinding).texture).toBe(itemProbe.specularCube);
    expect(uniforms.get("u_envMipCount")).toBe(5);
    // Diffuse SH still comes from the scene (SH-bearing) probe.
    expect(Array.from(uniforms.get("u_envSH") as Float32Array)).toEqual(
      Array.from(baseline.get("u_envSH") as Float32Array)
    );
  });

  it("cube-only environments do not select prd02.ibl (no SH -> default body fallback)", () => {
    const probe = makeProbe("gate-cube");
    const cube = new TextureBinding({
      name: "u_environmentCubeMapTexture",
      texture: probe.specularCube,
      required: false
    });
    const bareItem = { label: "t" } as never;
    const itemCubeItem = { label: "t", environmentCube: cube, environmentCubeMip: probe.mipCount } as never;

    // Scene cube binding only, no SH-bearing probe.
    expect(
      prd02IblEnvironmentAvailable(
        { color: [1, 1, 1], intensity: 0, environmentCubeMapTexture: cube } as never,
        bareItem
      )
    ).toBe(false);
    // Per-item cube only, no SH-bearing probe.
    expect(
      prd02IblEnvironmentAvailable({ color: [1, 1, 1], intensity: 0 } as never, itemCubeItem)
    ).toBe(false);
    // Probe object without a real 27-float SH9 is not SH-bearing.
    expect(
      prd02IblEnvironmentAvailable(
        {
          color: [1, 1, 1],
          intensity: 0,
          environmentProbe: { specularCube: probe.specularCube, mipCount: probe.mipCount, sh9: new Float32Array(0) }
        } as never,
        bareItem
      )
    ).toBe(false);
    // Real SH-bearing probe selects, with or without a per-item cube.
    const withProbe = { color: [1, 1, 1], intensity: 0, environmentProbe: probe } as never;
    expect(prd02IblEnvironmentAvailable(withProbe, bareItem)).toBe(true);
    expect(prd02IblEnvironmentAvailable(withProbe, itemCubeItem)).toBe(true);
  });

  it("MaterialInstance override of u_materialEnvironmentIntensity drives the pack multiplier", () => {
    const probe = makeProbe("instance-cube");
    const base = new PBRMaterial({ envMapIntensity: 1 });
    const instance = new MaterialInstance(base);
    instance.setOverride("u_materialEnvironmentIntensity", 0.25);
    const env = {
      color: [1, 1, 1],
      intensity: 0,
      environmentProbe: probe,
      environmentMapIntensity: 2,
      environmentMapSpecularIntensity: 2,
      environmentMapMipCount: probe.mipCount
    };

    // Production packet seam: bindGenerated has already written the
    // instance-effective value into the packet (MaterialBinding uses
    // materialLike.getParameters()); the pack must not overwrite it with
    // the base value even when handed the base material.
    const packet = new Map<string, unknown>();
    packet.set("u_materialEnvironmentIntensity", instance.getParameters().get("u_materialEnvironmentIntensity"));
    applyPrd02EnvironmentUniforms(env as never, { label: "t" } as never, base, packet as never);
    expect(packet.get("u_envDiffuseIntensity")).toBe(0.5);
    expect(packet.get("u_envSpecularIntensity")).toBe(0.5);

    // Direct seam: the instance itself resolves override-first.
    const direct = new Map<string, unknown>();
    applyPrd02EnvironmentUniforms(env as never, { label: "t" } as never, instance, direct as never);
    expect(direct.get("u_envDiffuseIntensity")).toBe(0.5);
    expect(direct.get("u_envSpecularIntensity")).toBe(0.5);
  });
});

describe("E3 step 4: generated procedural-specular-always deleted on the conjunction path", () => {
  const genFragment = (flags: typeof CONJUNCTION_ON, features: Record<string, boolean>) =>
    generateProgramImpl(
      normalizeProgramFeatures({
        pass: "forward",
        lighting: "lit",
        environment: "pmrem-cube",
        lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: true },
        features
      } as never),
      { flags }
    );
  const sha = (source: string) => createHash("sha256").update(source).digest("hex");
  const PROC_SPEC_LINE =
    "  indirectSpecular += a3dIndirectSpecular(a3dProceduralSpecularRadiance(reflect(-V, N), material.roughness), a3dProcIrradiance, V, N, material);";
  // Every stacked body term from the stage-2b trace §1 (generated family):
  // ambient 1/pi, π-scaled sampled diffuse+specular, procedural specular.
  // The sampled diffuse is pinned by its `PI * a3dSampleEnvironment` source
  // line: the PRD-02 call body reuses the same `a3dIndirectDiffuse(...)`
  // sink line with SH irradiance, so that line alone does not discriminate.
  const LEGACY_STACKED_MARKERS = [
    "indirectDiffuse += a3dAmbientDiffuse(",
    "PI * a3dSampleEnvironment(N, 8.0)",
    "indirectSpecular += a3dIndirectSpecular(a3dSampleEnvironment(a3dReflect, a3dRoughLod), a3dEnvIrradiance, V, N, material);",
    PROC_SPEC_LINE.trim()
  ];

  it("conjunction + prd02.ibl: no legacy stacked marker survives in the source", () => {
    const { fragment } = genFragment(CONJUNCTION_ON, { "prd02.ibl": true });
    for (const marker of LEGACY_STACKED_MARKERS) expect(fragment).not.toContain(marker);
  });

  it("conjunction without prd02.ibl: procedural specular is unsampled-only, never always-add", () => {
    const { fragment } = genFragment(CONJUNCTION_ON, {});
    expect(fragment).toContain(`#ifndef A3D_ENV_SAMPLE\n${PROC_SPEC_LINE}\n#endif`);
  });

  it("conjunction off: fragment source is byte-identical across off modes (sha256)", () => {
    for (const features of [{}, { "prd02.ibl": true }] as Record<string, boolean>[]) {
      const lightingOnly = genFragment(LIGHTING_ONLY, features);
      const flagsOff = genFragment(FLAGS_OFF, features);
      expect(sha(lightingOnly.fragment)).toBe(sha(flagsOff.fragment));
      expect(sha(lightingOnly.vertex)).toBe(sha(flagsOff.vertex));
      // Legacy always-add line present, unguarded, exactly as before step 4.
      expect(lightingOnly.fragment).toContain(PROC_SPEC_LINE);
      expect(lightingOnly.fragment).not.toContain(`#ifndef A3D_ENV_SAMPLE\n${PROC_SPEC_LINE}`);
    }
  });
});

describe("E3 step 4: frozen-family stacked terms suppressed at the bind layer", () => {
  const FROZEN_UNIFORMS = [
    "u_environmentColor", "u_environmentIntensity",
    "u_environmentSkyColor", "u_environmentHorizonColor", "u_environmentGroundColor",
    "u_environmentSpecularColor", "u_environmentMapIntensity", "u_environmentSpecularIntensity",
    "u_environmentMapTexture", "u_environmentMapTextureEnabled", "u_environmentMapTextureIntensity",
    "u_environmentMapTextureSpecularIntensity", "u_environmentMapTextureRotation", "u_environmentMapTextureMipCount",
    "u_environmentMapTextureEncoding", "u_environmentBrdfLutTexture", "u_environmentBrdfLutEnabled"
  ];
  const frozenShader = { reflection: { uniforms: new Set(FROZEN_UNIFORMS) } } as never;
  const item = { label: "t" } as never;
  const sampledTexture = () =>
    new TextureBinding({
      name: "u_environmentMapTexture",
      texture: new Texture({ label: "step4-sampled", width: 2, height: 1 }),
      required: true
    });
  const bundleEnv = (overrides: Record<string, unknown> = {}) => ({
    color: [0.5, 0.5, 0.5],
    intensity: 0.36,
    proceduralMap: {
      skyColor: [0.6, 0.7, 0.9], horizonColor: [0.9, 0.8, 0.6],
      groundColor: [0.1, 0.1, 0.1], specularColor: [1, 1, 1],
      intensity: 0.5, specularIntensity: 0.86
    },
    environmentMapTexture: sampledTexture(),
    environmentMapIntensity: 2,
    environmentMapSpecularIntensity: 2,
    environmentMapMipCount: 4,
    ...overrides
  });

  it("frozen conjunction: ambient+procedural zeroed, sampled knob kept as the single term", () => {
    const uniforms = new Map<string, unknown>();
    applyEnvironmentLightingUniforms(bundleEnv() as never, item, frozenShader, uniforms as never, { conjunction: true, generated: false });
    expect(uniforms.get("u_environmentIntensity")).toBe(0);
    expect(uniforms.get("u_environmentMapIntensity")).toBe(0);
    expect(uniforms.get("u_environmentSpecularIntensity")).toBe(0);
    expect(uniforms.get("u_environmentMapTextureIntensity")).toBe(2);
    expect(uniforms.get("u_environmentMapTextureSpecularIntensity")).toBe(2);
  });

  it("frozen conjunction, probe path: authored ambient in `intensity` is preserved (F-02-01)", () => {
    const uniforms = new Map<string, unknown>();
    applyEnvironmentLightingUniforms(
      bundleEnv({ intensity: 0.7, proceduralMap: undefined, environmentProbe: { sh9: new Float32Array(27) } }) as never,
      item, frozenShader, uniforms as never, { conjunction: true, generated: false }
    );
    expect(uniforms.get("u_environmentIntensity")).toBe(0.7);
    expect(uniforms.get("u_environmentMapTextureIntensity")).toBe(2);
  });

  it("frozen conjunction, no sampled term: ambient stays as the sole diffuse term", () => {
    const uniforms = new Map<string, unknown>();
    applyEnvironmentLightingUniforms(
      { color: [1, 1, 1], intensity: 0.7, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 } as never,
      item, frozenShader, uniforms as never, { conjunction: true, generated: false }
    );
    expect(uniforms.get("u_environmentIntensity")).toBe(0.7);
  });

  it("frozen conjunction: absent sampled intensities bind 0, never the legacy 1 / 0.5 defaults", () => {
    const env = bundleEnv();
    delete (env as Record<string, unknown>).environmentMapIntensity;
    delete (env as Record<string, unknown>).environmentMapSpecularIntensity;
    const uniforms = new Map<string, unknown>();
    applyEnvironmentLightingUniforms(env as never, item, frozenShader, uniforms as never, { conjunction: true, generated: false });
    expect(uniforms.get("u_environmentMapTextureIntensity")).toBe(0);
    expect(uniforms.get("u_environmentMapTextureSpecularIntensity")).toBe(0);
  });

  it("conjunction off: frozen packet is the legacy stack, byte-for-byte at the uniform level", () => {
    const env = bundleEnv();
    delete (env as Record<string, unknown>).environmentMapIntensity;
    delete (env as Record<string, unknown>).environmentMapSpecularIntensity;
    const uniforms = new Map<string, unknown>();
    applyEnvironmentLightingUniforms(env as never, item, frozenShader, uniforms as never, { conjunction: false, generated: false });
    expect(uniforms.get("u_environmentIntensity")).toBe(0.36);
    expect(uniforms.get("u_environmentMapIntensity")).toBe(0.5);
    expect(uniforms.get("u_environmentSpecularIntensity")).toBe(0.86);
    expect(uniforms.get("u_environmentMapTextureIntensity")).toBe(1);
    expect(uniforms.get("u_environmentMapTextureSpecularIntensity")).toBe(0.5);
  });
});

describe("E3 step 4: category fallback and renderer default on the conjunction path", () => {
  const sunOnly = { kind: "light", light: "directional", intensity: 3, color: "#ffffff" };

  it("category fallback under the conjunction collapses to the single knob, procedural zeroed", () => {
    const { lighting, intensity } = createProductionRuntimeEnvironment(snapshot([sunOnly]), CONJUNCTION_ON);
    expect(intensity).toBeCloseTo(0.44);
    expect(lighting.intensity).toBeCloseTo(0.44);
    expect(lighting.environmentMapIntensity).toBeCloseTo(0.44);
    expect(lighting.environmentMapSpecularIntensity).toBeCloseTo(0.44);
    expect(lighting.proceduralMap?.intensity).toBe(0);
    expect(lighting.proceduralMap?.specularIntensity).toBe(0);
  });

  it("category fallback conjunction-off (incl. COMPILER-only) keeps the legacy preset stack", () => {
    const COMPILER_ONLY = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: false } });
    for (const flags of [FLAGS_OFF, LIGHTING_ONLY, COMPILER_ONLY]) {
      const { lighting } = createProductionRuntimeEnvironment(snapshot([sunOnly]), flags);
      expect(lighting.intensity).toBeCloseTo(0.18);
      expect(lighting.environmentMapIntensity).toBeCloseTo(0.44);
      expect(lighting.environmentMapSpecularIntensity).toBeCloseTo(0.92);
      expect(lighting.proceduralMap?.intensity).toBeCloseTo(0.5);
      expect(lighting.proceduralMap?.specularIntensity).toBeCloseTo(0.86);
    }
  });

  it("renderer default (0.42 + procedural 0.5/0.82) is flag-off only; conjunction binds the neutral room", () => {
    try {
      setRendererQrFlags(FLAGS_OFF);
      const off = collectEnvironmentLighting({} as never);
      expect(off).toEqual(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
      expect(off).not.toBe(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
      expect(off?.intensity).toBe(0.42);

      setRendererQrFlags(CONJUNCTION_ON);
      const on = collectEnvironmentLighting({} as never);
      expect(on?.intensity).toBe(0);
      expect(on?.proceduralMap).toBeUndefined();
      expect(on?.environmentMapTexture).toBeDefined();
      expect(on?.environmentProbe).toBeDefined();
    } finally {
      setRendererQrFlags(FLAGS_OFF);
    }
  });
});

describe("E3 step 5: the 0.18 constructor default never survives a conjunction draw", () => {
  const shader = { reflection: { uniforms: new Set(["u_environmentColor", "u_environmentIntensity"]) } } as never;
  const item = { label: "t" } as never;

  it("public constant and material constructor default are unchanged (bind-layer fix)", () => {
    expect(DEFAULT_PBR_ENVIRONMENT_INTENSITY).toBe(0.18);
    expect(new PBRMaterial({}).getParameter("u_environmentIntensity")).toBe(0.18);
  });

  it("no-environment draw (Scene/iterable/direct-ForwardPass seam): conjunction binds 0, off keeps the packet", () => {
    for (const generated of [false, true]) {
      const on = new Map<string, unknown>([["u_environmentIntensity", DEFAULT_PBR_ENVIRONMENT_INTENSITY]]);
      applyEnvironmentLightingUniforms(undefined, item, shader, on as never, { conjunction: true, generated });
      expect(on.get("u_environmentIntensity")).toBe(0);

      const off = new Map<string, unknown>([["u_environmentIntensity", DEFAULT_PBR_ENVIRONMENT_INTENSITY]]);
      applyEnvironmentLightingUniforms(undefined, item, shader, off as never, { conjunction: false, generated });
      expect(off.get("u_environmentIntensity")).toBe(DEFAULT_PBR_ENVIRONMENT_INTENSITY);
    }
  });

  it("environment present: scene intensity overwrites the default in both modes (production engine path)", () => {
    for (const conjunction of [false, true]) {
      const uniforms = new Map<string, unknown>([["u_environmentIntensity", DEFAULT_PBR_ENVIRONMENT_INTENSITY]]);
      applyEnvironmentLightingUniforms(
        { color: [1, 1, 1], intensity: 0.7 } as never,
        item, shader, uniforms as never, { conjunction, generated: false }
      );
      expect(uniforms.get("u_environmentIntensity")).toBe(0.7);
    }
  });
});
