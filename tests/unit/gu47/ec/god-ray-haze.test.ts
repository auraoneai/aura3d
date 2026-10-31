import { afterEach, describe, expect, it } from "vitest";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import type { EffectNodeLike } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { bindPrd07FogRuntime, createProductionRuntimeEnvironmentFog } from "../../../../packages/engine/src/agent-api/compiler/fog";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";
import { createRootPostPipeline, resetRuntimePostOverrides } from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { GODRAYS_GLSL } from "../../../../packages/rendering/src/post/shaders/godrays.glsl";
import { godRayMedium, runV2HdrStages } from "../../../../packages/rendering/src/post/v2Stages";
import type { PostPipelineOptions } from "../../../../packages/rendering/src/contracts/post";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { CAMERA, fakeHost, fakeTarget, recordingGl } from "./recordingGl";

/**
 * GU47 phase 2: the volumetric-fog haze wash. drift-and-deliver-port (density 0.06), aura-hoops-3d
 * athens/manila (0.08/0.12), last-train-port (0.12), heatsink-port and ninja-runner-port (0.08)
 * rendered a flat beige/white wash where `?look=original` was clean. Two engine causes:
 *   1. the volumetric-fog node, tracked as a scene-fog node, supplied the forward scene fog: as the
 *      LAST fog node it replaced the game's own `effects.fog` haze (density ~0.002), and alone it was
 *      the scene fog, an uncapped exp2 fog at the shaft medium density (0.06 to 0.12 per metre: 76 %
 *      to 99 % opaque at 20 m; the receipt's 0.2 buried the whole scene);
 *   2. the S4 march was an unnormalised sum (about 14 x intensity^2 times the emitter radiance at
 *      32 samples) in which every sky pixel emitted, so a bright sky added several HDR units to
 *      every pixel whose ray crossed it.
 */

function fogNode(id: string, spec: Record<string, unknown>, effect = "fog"): EffectNodeLike {
  return { kind: "effect", effect, ...spec, runtime: { id } } as unknown as EffectNodeLike;
}
const visibleAll = (...ids: string[]) => ({ nodes: { get: (id: string) => (ids.includes(id) ? { visible: true } : undefined) } });

afterEach(() => {
  bindPrd07FogRuntime(null);
  resetRuntimePostOverrides();
});

describe("scene fog: a volumetric-fog node never replaces the scene's effects.fog", () => {
  const haze = () => fogNode("haze", { density: 0.0024, color: "#f0dcc0" });
  const rays = () => fogNode("rays", { density: 0.06, color: "#ffb070", intensity: 0.6, godRayDensity: 0.35 }, "volumetric-fog");

  it("fog then volumetric fog (drift-and-deliver-port order): the haze stays the scene fog", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([haze(), rays()]);
    atmosphere.updateFogVisibility(visibleAll("haze", "rays"));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.0024);
    expect(atmosphere.report().fog.activeNodeId).toBe("haze");
  });

  it("volumetric fog first: same answer (order does not matter)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([rays(), haze()]);
    atmosphere.updateFogVisibility(visibleAll("haze", "rays"));
    expect(atmosphere.resolveFog(0)?.density).toBe(0.0024);
  });

  it("a hidden effects.fog clears the scene fog; the shaft medium does not take over", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([haze(), rays()]);
    atmosphere.updateFogVisibility(visibleAll("rays"));
    atmosphere.updateFogVisibility({ nodes: { get: (id: string) => ({ visible: id !== "haze" }) } });
    expect(atmosphere.resolveFog(0)).toBeNull();
  });

  it("a scene whose only fog is volumetric has no scene fog (the receipt scene: 0.2 per metre buried it)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([rays()]);
    atmosphere.updateFogVisibility(visibleAll("rays"));
    expect(atmosphere.resolveFog(0)).toBeNull();
  });

  it("beside only a volumetric node, app.atmosphere.setFog applies as on a node-free scene", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([rays()]);
    atmosphere.updateFogVisibility(visibleAll("rays"));
    atmosphere.setFog({ density: 0.003, color: "#c9d6dc" });
    expect(atmosphere.resolveFog(0)?.density).toBe(0.003);
    atmosphere.setFog({ density: 0.004 }, { overrideSceneFog: true });
    expect(atmosphere.resolveFog(0.1)?.density).toBe(0.004);
  });

  it("app.atmosphere.setFog reaches the effects.fog by default beside a volumetric node (drift, ninja, bunker-zero call it per phase)", () => {
    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogNodes([haze(), rays()]);
    atmosphere.updateFogVisibility(visibleAll("haze", "rays"));
    atmosphere.resolveFog(0);
    atmosphere.setFog({ density: 0.0019, color: "#c9d6dc" });
    const fog = atmosphere.resolveFog(0.1)!;
    expect(fog.density).toBe(0.0019);
    expect(fog.color).toBe("#c9d6dc");
    expect(atmosphere.sceneFogOverridden()).toBe(true);
  });

  it("through compiler/fog.ts (A3D_QR_VFX_FOG, the default): the forward fog density is the haze's, not 0.06", () => {
    const atmosphere = new LiveAtmosphere();
    const nodes = [haze(), rays()];
    atmosphere.trackFogNodes(nodes);
    atmosphere.updateFogVisibility(visibleAll("haze", "rays"));
    bindPrd07FogRuntime({ flags: resolveQrFlags({ options: { A3D_QR_VFX_FOG: true } }), atmosphere });
    const out = createProductionRuntimeEnvironmentFog({ nodes } as unknown as AuraSceneSnapshot, [], 1280, 720) as { mode: string; density: number };
    expect(out.density).toBeCloseTo(0.0024, 9);
  });
});

/**
 * CPU mirror of GODRAYS_GLSL on a 1-D street: a sun at uv 0.5, open sky (HDR radiance `sky`)
 * above uv 0.4, buildings (depth `buildingZ` m) below. `normalised: false` is the old
 * shader (sum with weight = intensity, every sky pixel emits).
 */
function shaft(uvY: number, options: { normalised: boolean; sky?: number; intensity?: number; medium?: number; buildingZ?: number; samples?: number; decay?: number }): number {
  const samples = options.samples ?? 32, decay = options.decay ?? 0.94, intensity = options.intensity ?? 0.6, sky = options.sky ?? 2;
  const far = 1000, light = 0.5, buildingZ = options.buildingZ ?? 15;
  const isSky = (y: number) => y >= 0.4;
  const step = (light - uvY) / samples;
  let weight = options.normalised ? 1 : intensity, sum = 0, accum = 0, y = uvY;
  for (let i = 0; i < samples; i += 1) {
    y += step;
    const r = Math.abs(y - light);
    const nearLight = options.normalised ? 1 - smoothstep(0, 0.6, r) : 1;
    let src = isSky(y) ? sky * nearLight : 0;
    if (isSky(y)) src += smoothstep(0.08, 0.02, r);
    accum += weight * src;
    sum += weight;
    weight *= decay;
  }
  const viewZ = isSky(uvY) ? far : buildingZ;
  const medium = options.normalised && (options.medium ?? 0) > 0 ? 1 - Math.exp(-(options.medium ?? 0) * viewZ) : 1;
  return (options.normalised ? accum / sum : accum) * intensity * medium;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

describe("S4 god rays add shafts, not a wash (CPU mirror)", () => {
  it("old march: open sky gains ~10x its own radiance (the white wash)", () => {
    expect(shaft(0.9, { normalised: false })).toBeGreaterThan(10 * 2 * 0.5);
  });

  it("new march: the shaft never exceeds intensity x (sky + disk); intensity scales it linearly", () => {
    const at = shaft(0.9, { normalised: true });
    expect(at).toBeLessThanOrEqual(0.6 * (2 + 1));
    expect(shaft(0.9, { normalised: true, intensity: 0.3 })).toBeCloseTo(at / 2, 9);
  });

  it("new march: shafts fall off away from the light (old: near-uniform over the sky)", () => {
    const nearRatio = shaft(0.6, { normalised: true }) / shaft(0.98, { normalised: true });
    expect(nearRatio).toBeGreaterThan(1.5);
  });

  it("medium: near geometry gets little shaft, distance builds it (density 0.06 per metre)", () => {
    const near = shaft(0.3, { normalised: true, medium: 0.06, buildingZ: 3 });
    const far = shaft(0.3, { normalised: true, medium: 0.06, buildingZ: 40 });
    expect(near / far).toBeLessThan(0.25);
    expect(shaft(0.3, { normalised: true, medium: 0, buildingZ: 3 })).toBeCloseTo(shaft(0.3, { normalised: true, buildingZ: 40 }), 9);
  });

  it("the shader carries the normalisation, the emitter falloff and the medium term", () => {
    expect(GODRAYS_GLSL).toContain("vec3 shaft = accum / max(weightSum, 1e-4);");
    expect(GODRAYS_GLSL).toContain("AURA_GODRAY_EMIT_RADIUS");
    expect(GODRAYS_GLSL).toContain("1.0 - exp(-u_medium * viewZ)");
    expect(GODRAYS_GLSL).not.toContain("float marchWeight = u_weight;");
  });
});

describe("bridge and stage: the fog density is the shaft medium", () => {
  const BASE: PostPipelineOptions = { antiAliasing: "off", depthRange: { near: 0.1, far: 100, projection: "perspective" }, exposure: 1, toneMapping: "aces", dither: true };
  const derive = (...nodes: unknown[]): Record<string, any> =>
    createRootPostPipeline({ nodes } as never, { near: 0.1, far: 100 }, undefined, QUALITY_TIERS.high).options;

  it("pipeline.godRays.medium = volumetricFog density (default 0.18); godRayDensity stays the march density", () => {
    const bag = derive({ ...effects.volumetricFog({ density: 0.06, godRayDensity: 0.35 }).toJSON() }).godRays;
    expect(bag.medium).toBe(0.06);
    expect(bag.density).toBe(0.35);
    expect(derive(effects.volumetricFog({}).toJSON()).godRays.medium).toBe(0.18);
  });

  it("godRayMedium clamps to [0, 1]; omitted = 0 (no depth scaling)", () => {
    expect(godRayMedium(undefined)).toBe(0);
    expect(godRayMedium(0.08)).toBe(0.08);
    expect(godRayMedium(-1)).toBe(0);
    expect(godRayMedium(4)).toBe(1);
  });

  it("writes u_medium into the S4 draw", () => {
    const godRays = { samples: 32, decay: 0.94, weight: 0.7, intensity: 0.7, color: [1, 0.9, 0.8], medium: 0.12 };
    const rec = recordingGl();
    runV2HdrStages(fakeHost(rec.gl), fakeTarget(), { ...BASE, godRays } as never, CAMERA);
    expect(rec.draws.find((d) => d.fragment.includes("u_medium"))!.uniforms.u_medium).toEqual([0.12]);
  });
});
