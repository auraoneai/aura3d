import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02"; // registers chunks + provides C-09
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  rendererQrFlags,
  setRendererQrFlags
} from "../../../../packages/rendering/src/renderer/FrameGraph";
import { prd02ShadowStrengthDefault } from "../../../../packages/rendering/src/forward/Lighting";
import {
  AURA_LIGHTS_MAX,
  ambientToExitRadiance,
  packAuraLightsStd140,
  type AuraLightData
} from "../../../../packages/rendering/src/LightUniforms";
import {
  packA3DEnvironmentUniforms,
  packEnvSH
} from "../../../../packages/rendering/src/environment/EnvUniforms";
import {
  resolvePrd02EnvironmentBackground
} from "../../../../packages/rendering/src/renderer/Background";
import { createEnvironmentProbeFactory } from "../../../../packages/rendering/src/environment/EnvironmentProbeFactory";
import { EnvironmentCache } from "../../../../packages/rendering/src/environment/EnvironmentCache";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";
import type { EnvironmentProbe } from "../../../../packages/rendering/src/contracts/environment";
import { descriptorToAuraLightData } from "../../../../packages/engine/src/agent-api/compiler/lights";
import { bindPrd02EnvironmentProbe } from "../../../../packages/engine/src/agent-api/compiler/environment";

const LIGHTING_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({});

afterEach(() => setRendererQrFlags(BASE));

describe("forward lighting flag defaults (PRD-02 §6.3)", () => {
  it("shadow-map strength default is 0.65 flag-off, 1.0 flag-on", () => {
    setRendererQrFlags(BASE);
    expect(prd02ShadowStrengthDefault()).toBe(0.65);
    setRendererQrFlags(LIGHTING_ON);
    expect(prd02ShadowStrengthDefault()).toBe(1);
  });
  it("ambient converts with ×1/π", () => {
    const [r, g, b] = ambientToExitRadiance([1, 0.5, 0.25], 2);
    expect(r).toBeCloseTo(2 / Math.PI, 5);
    expect(g).toBeCloseTo(1 / Math.PI, 5);
    expect(b).toBeCloseTo(0.5 / Math.PI, 5);
  });
});

const light = (over: Partial<AuraLightData> = {}): AuraLightData => ({
  kind: "point",
  color: [1, 1, 1],
  intensity: 8,
  position: [1, 2, 3],
  direction: [0, -1, 0],
  range: 12,
  spotAngle: 0,
  penumbra: 0,
  decay: 2,
  ...over
});

describe("AuraLights std140 packer (PRD-02 §6.3/§8)", () => {
  it("packs kind/range/intensity/decay at the frozen offsets", () => {
    const spot = light({ kind: "spot", spotAngle: Math.PI / 3, penumbra: 0.25, decay: 2, shadowIndex: 4 });
    const { data, lightCount } = packAuraLightsStd140([spot]);
    expect(lightCount).toBe(1);
    expect(data[3]).toBe(2); // spot kind
    expect(data[7]).toBe(12); // range
    expect(data[11]).toBe(8); // intensity
    expect(data[12]).toBeCloseTo(Math.cos(Math.PI / 6), 5); // cosOuter
    expect(data[13]).toBeCloseTo(Math.cos((Math.PI / 6) * 0.75), 5); // cosInner = outer·(1-penumbra)
    expect(data[14]).toBe(2); // decay
    expect(data[15]).toBe(4); // shadowIndex
  });
  it("packs rect right/up + width/height into vec4s 4-5 and reports drop counters", () => {
    const rect = light({ kind: "rect-area", right: [0, 0, -1], up: [0, 1, 0], width: 4, height: 2 });
    const { data } = packAuraLightsStd140([rect]);
    expect(data[3]).toBe(3);
    expect([data[16], data[17], data[18]]).toEqual([0, 0, -1]);
    expect(data[19]).toBe(4);
    expect([data[20], data[21], data[22]]).toEqual([0, 1, 0]);
    expect(data[23]).toBe(2);
    const many = Array.from({ length: AURA_LIGHTS_MAX + 5 }, (_, i) => light({ name: `L${i}` }));
    const packed = packAuraLightsStd140(many);
    expect(packed.lightCount).toBe(AURA_LIGHTS_MAX);
    expect(packed.lightsEvaluated).toBe(AURA_LIGHTS_MAX + 5);
    expect(packed.lightsDroppedByCap).toBe(5);
    expect(packed.droppedNames).toEqual(["L32", "L33", "L34", "L35", "L36"]);
  });
});

describe("A3DEnvironment uniforms (PRD-02 §6.10/§8.1)", () => {
  const device = new MockRenderDevice();
  const factory = createEnvironmentProbeFactory(device);
  const probe = factory.neutral("medium");
  it("u_envSH packs 27 folded coefficients into 28 slots", () => {
    const folded = packEnvSH(probe.sh9);
    expect(folded.length).toBe(28);
    // band-0 coefficient folded by π (SH9_IRRADIANCE_BASIS_SCALE[0])
    expect(folded[0]).toBeCloseTo(probe.sh9[0]! * Math.PI, 4);
    // band-1 coefficient (index 3) folded by 2π/3
    expect(folded[9]).toBeCloseTo(probe.sh9[9]! * (2 * Math.PI) / 3, 4);
  });
  it("reports shBound and binds ambient/hemisphere terms", () => {
    const { uniforms, shBound } = packA3DEnvironmentUniforms({
      probe,
      ambient: { color: [1, 1, 1], intensity: 1 },
      hemisphere: { sky: [0.5, 0.6, 0.7], ground: [0.1, 0.1, 0.1], intensity: 2 }
    });
    expect(shBound).toBe(1);
    expect(uniforms.get("u_envMipCount")).toBe(probe.mipCount);
    const ambient = uniforms.get("u_ambientIrradiance") as readonly number[];
    expect(ambient[0]).toBeCloseTo(1 / Math.PI, 5);
    const sky = uniforms.get("u_hemiSky") as readonly number[];
    expect(sky[0]).toBeCloseTo(1.0, 5); // intensity 2 pre-multiplied (no /π)
    expect(uniforms.get("u_envSH")).toBeInstanceOf(Float32Array);
  });
  it("null probe zeroes SH and reports shBound 0", () => {
    const { uniforms, shBound } = packA3DEnvironmentUniforms({ probe: null });
    expect(shBound).toBe(0);
    expect((uniforms.get("u_envSH") as Float32Array)[0]).toBe(0);
  });
});

describe("prd02.background contributor (PRD-02 §9)", () => {
  const device = new MockRenderDevice();
  const factory = createEnvironmentProbeFactory(device);
  const probe = factory.neutral("medium");
  const src = (extra: Record<string, unknown>) => ({ environmentProbe: probe, ...extra }) as never;
  it("equirect when probe.background exists and blurriness is 0", () => {
    const bg = resolvePrd02EnvironmentBackground(src({}));
    expect(bg?.projection).toBe("cubemap"); // neutral probe has no equirect bg
    const withBg: EnvironmentProbe = {
      ...probe,
      background: new Texture({ width: 4, height: 2, format: "rgba32f", mipLevels: [{ width: 4, height: 2, data: new Float32Array(4 * 2 * 4) }] }),
      dispose() {}
    };
    const bg2 = resolvePrd02EnvironmentBackground({ environmentProbe: withBg } as never);
    expect(bg2?.projection).toBe("equirect");
  });
  it("cubemap + lod when blurriness > 0", () => {
    const bg = resolvePrd02EnvironmentBackground(src({ backgroundBlurriness: 1 }));
    expect(bg?.projection).toBe("cubemap");
    expect(bg?.blurriness).toBe(1);
    expect(bg?.mipCount).toBe(probe.mipCount);
  });
  it("environmentBackground:false keeps the solid colour (no resolution)", () => {
    const source = { environmentProbe: probe, environmentBackground: false } as never;
    // collect-level gate: false → undefined before probe resolution
    expect(resolvePrd02EnvironmentBackground(source as never)).toBeDefined();
    // the collector itself returns undefined for `false`
    return import("../../../../packages/rendering/src/renderer/Background").then(({ collectEnvironmentBackground }) => {
      setRendererQrFlags(LIGHTING_ON);
      expect(collectEnvironmentBackground(source)).toBeUndefined();
    });
  });
});

describe("compiler light → AuraLightData (rect/softbox)", () => {
  it("rect descriptor maps kind/width/height into the packed layout", async () => {
    const { physicalLightDescriptor } = await import("../../../../packages/engine/src/agent-api/compiler/lights");
    const d = physicalLightDescriptor({ kind: "light", light: "rect", intensity: 2, width: 5, height: 3, position: [0, 4, 0] } as never, "r1");
    expect(d?.kind).toBe("rect-area");
    const data = descriptorToAuraLightData(d!);
    expect(data.kind).toBe("rect-area");
    expect(data.width).toBe(5);
    expect(data.height).toBe(3);
    const packed = packAuraLightsStd140([data]);
    expect(packed.data[3]).toBe(3);
    expect(packed.data[19]).toBe(5);
    expect(packed.data[23]).toBe(3);
    // orthonormal basis ⊥ direction
    const dir = data.direction;
    const dot = data.right![0] * dir[0] + data.right![1] * dir[1] + data.right![2] * dir[2];
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });
});

describe("bindPrd02EnvironmentProbe (neutral floor + async upgrade)", () => {
  const device = new MockRenderDevice();
  const factory = createEnvironmentProbeFactory(device);
  const neutralResolution = {
    kind: "neutral-room" as const, probe: "neutral" as const,
    intensity: 1, diffuseIntensity: 1, specularIntensity: 1, rotation: 0,
    background: false as const, ambient: null
  };
  it("neutral resolves synchronously through the cache and upgrades via the baked preset", async () => {
    const fake: EnvironmentProbe = { ...factory.neutral("low"), source: "preset" };
    const cache = new EnvironmentCache(device, factory, async () => fake); // deterministic loader
    const upgraded: EnvironmentProbe[] = [];
    const binding = bindPrd02EnvironmentProbe(neutralResolution, {
      device, tier: "medium", flags: LIGHTING_ON, cache,
      onUpgrade: (p) => upgraded.push(p)
    });
    expect(binding.probe.source).toBe("neutral");
    expect(binding.probe.faceSize).toBe(256);
    expect(binding.probe.mipCount).toBe(1); // analytic floor (T0-25)
    expect(binding.pending).not.toBeNull(); // baked `neutral` preset upgrade
    expect(await binding.pending!).toBe(fake);
    expect(upgraded).toEqual([fake]);
  });
  it("hdri binds the neutral floor and upgrades via acquire", async () => {
    const fake: EnvironmentProbe = { ...factory.neutral("low"), source: "hdri" };
    const cache = new EnvironmentCache(device, factory, async () => fake); // deterministic loader
    const upgraded: EnvironmentProbe[] = [];
    const binding = bindPrd02EnvironmentProbe(
      { ...neutralResolution, probe: { hdri: "studio.hdr" } },
      {
        device, tier: "medium", flags: LIGHTING_ON, cache,
        onUpgrade: (p) => upgraded.push(p)
      }
    );
    expect(binding.probe.source).toBe("neutral");
    expect(binding.pending).not.toBeNull();
    const resolved = await binding.pending!;
    expect(resolved).toBe(fake);
    expect(upgraded).toEqual([fake]);
  });
});

describe("legacy equirect bridge (PRD-02 Phase 3, E5 fix)", () => {
  const device = new MockRenderDevice();
  const factory = createEnvironmentProbeFactory(device);
  const probe = factory.neutral("medium");

  it("probeToEquirectTexture builds a mipped linear rgba16f equirect", async () => {
    const { probeToEquirectTexture } = await import("../../../../packages/rendering/src/environment/probeBuild");
    const tex = probeToEquirectTexture(probe);
    expect(tex.format).toBe("rgba16f");
    expect(tex.width).toBe(probe.faceSize * 2);
    expect(tex.height).toBe(probe.faceSize);
    expect(tex.mipLevels.length).toBeGreaterThan(1);
    expect(tex.mipLevels[0]?.data).toBeInstanceOf(Uint16Array);
    // mip chain halves each dimension to 1x1
    const last = tex.mipLevels[tex.mipLevels.length - 1]!;
    expect([last.width, last.height]).toEqual([1, 1]);
  });

  it("flag on: collectEnvironmentLighting resolves probe → linear mipped equirect, legacy fill off", async () => {
    setRendererQrFlags(LIGHTING_ON);
    const { collectEnvironmentLighting } = await import("../../../../packages/rendering/src/renderer/Background");
    const lighting = collectEnvironmentLighting({
      environmentProbe: probe,
      environmentProbeSpecularIntensity: 0.7
    } as never);
    expect(lighting).toBeDefined();
    expect(lighting?.intensity).toBe(0);
    expect(lighting?.proceduralMap).toBeUndefined();
    expect(lighting?.environmentMapEncoding).toBe("linear");
    expect(lighting?.environmentMapSpecularIntensity).toBe(0.7);
    const tex = lighting?.environmentMapTexture?.texture;
    expect(tex?.format).toBe("rgba16f");
    expect(lighting?.environmentMapMipCount).toBeGreaterThan(1);
    expect(lighting?.environmentCubeMapTexture?.texture).toBe(probe.specularCube);
  });

  it("flag off: probe presence does not change the default lighting", async () => {
    setRendererQrFlags(BASE);
    const { collectEnvironmentLighting } = await import("../../../../packages/rendering/src/renderer/Background");
    const lighting = collectEnvironmentLighting({ environmentProbe: probe } as never);
    expect(lighting?.environmentMapEncoding).not.toBe("linear");
  });

  it("flag on: environmentLighting:false still wins over the probe", async () => {
    setRendererQrFlags(LIGHTING_ON);
    const { collectEnvironmentLighting } = await import("../../../../packages/rendering/src/renderer/Background");
    const lighting = collectEnvironmentLighting({ environmentProbe: probe, environmentLighting: false } as never);
    expect(lighting).toBeDefined();
    expect(lighting?.environmentMapTexture).toBeUndefined();
  });
});

describe("AuraLights uniform block + C-31 counters + >16 clustering (PRD-02 §6.3, T0-27)", () => {
  const mkLight = (kind: AuraLightData["kind"] = "point"): AuraLightData => ({
    kind, position: [0, 1, 0], direction: [0, -1, 0], color: [1, 1, 1],
    intensity: 1, range: 10, spotAngle: 0.5, penumbra: 0.2, decay: 2
  });

  it("auraLightsUniformBlock emits u_lightData/u_prd02LightCount and records counters", async () => {
    const { auraLightsUniformBlock, auraLightsCounters, AURA_LIGHTS_MAX } =
      await import("../../../../packages/rendering/src/LightUniforms");
    const lights = Array.from({ length: AURA_LIGHTS_MAX + 4 }, () => mkLight());
    const { uniforms, lightCount } = auraLightsUniformBlock(lights);
    expect(lightCount).toBe(AURA_LIGHTS_MAX);
    expect((uniforms.u_lightData as Float32Array).length).toBe(AURA_LIGHTS_MAX * 6 * 4);
    expect(uniforms.u_prd02LightCount).toBe(AURA_LIGHTS_MAX);
    const counters = auraLightsCounters();
    expect(counters?.lightsEvaluated).toBe(AURA_LIGHTS_MAX + 4);
    expect(counters?.lightsDroppedByCap).toBe(4);
  });

  // T0-27: the forward uniform path holds 16 lights (LightUniforms.pack /
  // u_lightData[96]), so clustering engages above 16 with the flag on too.
  it("clustering engages above 16 with and without the flag (T0-27)", async () => {
    const { resolveForwardClusteredLighting } =
      await import("../../../../packages/rendering/src/forward/Lighting");
    const vp = new Float32Array(16); vp[0] = vp[5] = vp[10] = vp[15] = 1;
    const at = (n: number) => Array.from({ length: n }, () =>
      ({ kind: "point", position: [0, 0, 0], direction: [0, -1, 0], color: [1, 1, 1], intensity: 1, range: 10 } as never));
    setRendererQrFlags(BASE);
    expect(resolveForwardClusteredLighting(at(17), 64, 64, vp)).not.toBeNull();
    expect(resolveForwardClusteredLighting(at(16), 64, 64, vp)).toBeNull();
    setRendererQrFlags(LIGHTING_ON);
    expect(resolveForwardClusteredLighting(at(16), 64, 64, vp)).toBeNull();
    expect(resolveForwardClusteredLighting(at(17), 64, 64, vp)).not.toBeNull();
    expect(resolveForwardClusteredLighting(at(33), 64, 64, vp)).not.toBeNull();
  });
});
