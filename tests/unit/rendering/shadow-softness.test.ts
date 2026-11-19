/**
 * 5.7.0 — directional `shadow.softness` (penumbra width in shadow-map texels, three.js `shadow.radius`-like) and an
 * explicit `shadow.filter` reach the sun's receivers.
 *
 * Every stock receiver (generated / legacy PBR, `material.shadow` catchers, custom `a3d_shadow`, GLSL and WGSL) reads the
 * bridged kernel from `u_shadowPcfSamples`, so softness is a uniform change only: the default (unset) must keep the
 * pre-5.7.0 kernel byte for byte, and no shader source depends on it.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { PerspectiveCamera } from "@aura3d/scene";
import { identityMat4 } from "@aura3d/scene";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { createShadowFilterKernel } from "../../../packages/rendering/src/ShadowMap";
import { applyForwardShadowMapUniforms, packForwardShadowPcfSamples } from "../../../packages/rendering/src/forward/Lighting";
import type { UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { bindShadowFrameUniforms } from "../../../packages/rendering/src/shadows/ShadowFrameBinding";
import { Prd02ShadowSystem } from "../../../packages/rendering/src/shadows/ShadowSystem";
import { SHADOW_RECEIVE_CHUNK_GLSL, SHADOW_RECEIVE_SOFTNESS_CHUNK_GLSL } from "../../../packages/rendering/src/shaders/chunks/shadow_receive.glsl";
import { PRD02_CHUNKS } from "../../../packages/rendering/src/lanes/prd02";
import { SHADOW_LOOKUP_CHUNK } from "../../../packages/rendering/src/contracts/shadows";
import {
  MAX_SHADOW_SOFTNESS_TEXELS,
  executePrd02BridgedShadowMap,
  prd02BridgeShadowFilterKernel,
  prd02ShadowConfig
} from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { resolveShadowSoftness, resolveShadowSystemConfig } from "../../../packages/engine/src/agent-api/compiler/shadows";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
afterEach(() => setRendererQrFlags(resolveQrFlags({ options: ["none"] })));

/** The kernel the bridge built for every receiver before 5.7.0 (Prd02ShadowBridge.bridgeShadowMap). */
const PRE_570_KERNEL = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });

const SNAPSHOT = { nodes: [{ kind: "primitive", primitive: "box", position: [0, 0, 0] }] } as unknown as AuraSceneSnapshot;
const sunWith = (shadowOptions?: Record<string, unknown>) => [{ shadowRequested: true, ...(shadowOptions ? { shadowOptions } : {}) }] as never;

const PRD02_SHADOWS = {
  enabled: true, mapSize: 1024, cascades: 1, maxDistance: 150, splitLambda: 0.75, blend: 0.1,
  filter: "pcf", strength: 1, bias: 0, normalBias: 0.02, sceneRadius: 6
};

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 60 });
  cam.transform.setPosition(0, 3, 8);
  cam.updateCameraMatrices();
  return cam;
}

const sun = {
  kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 4, 3], direction: [-0.5, -0.7, -0.5],
  range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 1, source: { id: "sun", name: "sun", visible: true }
} as unknown as CollectedLight;

const caster = { geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "caster" } as RenderItem;

function bridgedSamples(prd02Shadows: Record<string, unknown>): { samples: Float32Array; count: number } {
  const device = new MockRenderDevice();
  device.beginFrame(256, 256);
  const map = executePrd02BridgedShadowMap({
    device,
    source: { shadow: { enabled: true, prd02Shadows }, collectedLights: [sun] } as never,
    items: [caster],
    camera: camera(),
    flags: FLAGS_ON
  });
  device.endFrame();
  expect(map).toBeDefined();
  const names = ["u_shadowMapTexture", "u_shadowMapEnabled", "u_shadowMapMatrix", "u_shadowMapStrength", "u_shadowMapBias",
    "u_shadowMapSlopeBias", "u_shadowMapTexelSize", "u_shadowPcfSampleCount", "u_shadowPcfSamples", "u_shadowMapNormalBias"];
  const uniforms = new Map<string, UniformValue>();
  applyForwardShadowMapUniforms(map, { label: "floor" } as RenderItem, { reflection: { uniforms: new Set(names) } } as never, uniforms);
  return { samples: uniforms.get("u_shadowPcfSamples") as Float32Array, count: uniforms.get("u_shadowPcfSampleCount") as number };
}

function rms(samples: readonly { readonly x: number; readonly y: number }[]): number {
  return Math.sqrt(samples.reduce((sum, s) => sum + s.x * s.x + s.y * s.y, 0) / samples.length);
}

describe("compiler: shadow.softness and an explicit shadow.filter (resolveShadowSystemConfig)", () => {
  it("leaves softness out of the config when unset, so the default config is unchanged", () => {
    const config = resolveShadowSystemConfig(SNAPSHOT, sunWith(), "high");
    expect("softness" in config).toBe(false);
    expect(config.filter).toBe("vogel");
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ mapSize: 2048 }), "low").filter).toBe("hard");
  });

  it("threads an authored softness through", () => {
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ softness: 4 }), "high").softness).toBe(4);
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ softness: 0 }), "high").softness).toBe(0);
  });

  it("honours an explicit filter over the quality tier", () => {
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ filter: "hard" }), "high").filter).toBe("hard");
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ filter: "pcf" }), "low").filter).toBe("pcf");
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ filter: "pcss" }), "medium").filter).toBe("pcss");
    // Unknown strings from untyped callers keep the tier filter.
    expect(resolveShadowSystemConfig(SNAPSHOT, sunWith({ filter: "soft" }), "medium").filter).toBe("castano");
  });

  it("rejects a negative or non-finite softness", () => {
    expect(resolveShadowSoftness(undefined)).toBeUndefined();
    expect(resolveShadowSoftness(2.5)).toBe(2.5);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
      expect(() => resolveShadowSoftness(bad)).toThrow(/SHADOW_SOFTNESS_INVALID/);
    }
  });
});

describe("renderer: bridge config and kernel", () => {
  it("prd02ShadowConfig carries softness only when the compiler set it", () => {
    expect("softness" in prd02ShadowConfig({ shadow: { prd02Shadows: PRD02_SHADOWS } }, FLAGS_ON, QUALITY_TIERS.high, 60)).toBe(false);
    expect(prd02ShadowConfig({ shadow: { prd02Shadows: { ...PRD02_SHADOWS, softness: 3 } } }, FLAGS_ON, QUALITY_TIERS.high, 60).softness).toBe(3);
  });

  it("unset or 1 returns the pre-5.7.0 kernel exactly", () => {
    expect(prd02BridgeShadowFilterKernel("pcf", undefined)).toEqual(PRE_570_KERNEL);
    expect(prd02BridgeShadowFilterKernel("pcf", 1)).toEqual(PRE_570_KERNEL);
    // Every soft filter name shares the kernel on the bridge (nearest raw-depth taps, no blocker search).
    for (const filter of ["castano", "vogel", "pcss"]) expect(prd02BridgeShadowFilterKernel(filter, undefined)).toEqual(PRE_570_KERNEL);
  });

  it("hard filter and softness 0 are one tap", () => {
    for (const kernel of [prd02BridgeShadowFilterKernel("hard", undefined), prd02BridgeShadowFilterKernel("hard", 4), prd02BridgeShadowFilterKernel("pcf", 0)]) {
      expect(kernel.mode).toBe("none");
      expect(kernel.samples).toEqual([{ x: 0, y: 0, weight: 1 }]);
    }
  });

  it("scales the kernel reach with softness (texels) and clamps at the maximum", () => {
    const half = prd02BridgeShadowFilterKernel("pcf", 0.5);
    expect(half.samples).toHaveLength(9);
    expect(Math.max(...half.samples.map((s) => Math.abs(s.x)))).toBeCloseTo(0.5, 6);
    const two = prd02BridgeShadowFilterKernel("pcf", 2);
    expect(two.samples).toHaveLength(25);
    expect(Math.max(...two.samples.map((s) => Math.abs(s.x)))).toBeCloseTo(2, 6);
    expect(rms(two.samples)).toBeCloseTo(2, 6);
    const four = prd02BridgeShadowFilterKernel("pcss", 4);
    expect(four.samples).toHaveLength(32);
    expect(rms(four.samples)).toBeCloseTo(4, 6);
    expect(four.samples.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1, 6);
    expect(prd02BridgeShadowFilterKernel("pcf", 100)).toBe(prd02BridgeShadowFilterKernel("pcf", MAX_SHADOW_SOFTNESS_TEXELS));
    expect(rms(prd02BridgeShadowFilterKernel("pcf", 100).samples)).toBeCloseTo(MAX_SHADOW_SOFTNESS_TEXELS, 6);
  });
});

describe("renderer: softness reaches u_shadowPcfSamples (PBR receivers and material.shadow catchers)", () => {
  it("default config binds the pre-5.7.0 samples byte for byte", () => {
    const { samples, count } = bridgedSamples(PRD02_SHADOWS);
    expect(count).toBe(9);
    expect([...samples]).toEqual([...packForwardShadowPcfSamples(PRE_570_KERNEL, "pre-5.7.0")]);
    // softness 1 is the same kernel.
    expect([...bridgedSamples({ ...PRD02_SHADOWS, softness: 1 }).samples]).toEqual([...samples]);
  });

  it("softness 2 widens the bound taps to ±2 texels; softness 0 and filter hard bind one tap", () => {
    const soft = bridgedSamples({ ...PRD02_SHADOWS, softness: 2 });
    expect(soft.count).toBe(25);
    const xs = Array.from({ length: soft.count }, (_, i) => soft.samples[i * 4]!);
    expect(Math.min(...xs)).toBeCloseTo(-2, 6);
    expect(Math.max(...xs)).toBeCloseTo(2, 6);
    expect(bridgedSamples({ ...PRD02_SHADOWS, softness: 0 }).count).toBe(1);
    expect(bridgedSamples({ ...PRD02_SHADOWS, filter: "hard", softness: 4 }).count).toBe(1);
  });

  it("the material.shadow catcher samples the same uniform kernel on GLSL and WGSL", () => {
    const spec = material.shadow() as unknown as { custom: { glsl: { fragment: string }; wgsl: { fragment: string } } };
    // GLSL pulls a3d_shadow (the shared u_shadowPcfSamples loop); WGSL loops over the same uniform.
    expect(spec.custom.glsl.fragment).toContain("#include <a3d_shadow>");
    expect(spec.custom.wgsl.fragment).toContain("aura.u_shadowPcfSamples[");
    expect(spec.custom.wgsl.fragment).toContain("aura.u_shadowPcfSampleCount");
    expect(spec.custom.glsl.fragment).not.toMatch(/softness/i);
    expect(spec.custom.wgsl.fragment).not.toMatch(/softness/i);
  });
});

describe("renderer: lookup chunk (a3d_prd02_shadow_lookup) kernel scale", () => {
  it("scales the Castaño and Vogel footprints and reads an unbound 0 as 1", () => {
    // The renderer registers the softness chunk; the published SHADOW_RECEIVE_CHUNK_GLSL keeps its 5.6.0 text.
    expect(PRD02_CHUNKS.find((chunk) => chunk.name === SHADOW_LOOKUP_CHUNK)?.glsl).toBe(SHADOW_RECEIVE_SOFTNESS_CHUNK_GLSL);
    expect(SHADOW_RECEIVE_SOFTNESS_CHUNK_GLSL).toContain("uniform float u_prd02ShadowSoftness;");
    expect(SHADOW_RECEIVE_SOFTNESS_CHUNK_GLSL).toContain("texel *= u_prd02ShadowSoftness > 0.0 ? u_prd02ShadowSoftness : 1.0;");
    expect(SHADOW_RECEIVE_SOFTNESS_CHUNK_GLSL).toContain("float radius = texel * 1.5 * (u_prd02ShadowSoftness > 0.0 ? u_prd02ShadowSoftness : 1.0);");
    expect(SHADOW_RECEIVE_CHUNK_GLSL).not.toContain("u_prd02ShadowSoftness");
  });

  it("binds 1 when unset, the authored value, and a sub-texel footprint for 0", () => {
    const device = new MockRenderDevice();
    device.beginFrame(256, 256);
    const config = { enabled: true, mapSize: 512, cascades: 1, maxDistance: 40, splitLambda: 0.75, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } as const;
    const system = new Prd02ShadowSystem(device, config);
    const uniforms = system.update({ camera: { viewProjectionMatrix: camera().viewProjectionMatrix, near: 0.1, far: 60 }, sun: { direction: [0, -1, 0] }, casters: [caster], localLights: [], flags: FLAGS_ON, tier: QUALITY_TIERS.high });
    device.endFrame();
    const bound = (softness: number | undefined): unknown => {
      const receiver = new UnlitMaterial({ name: "recv" });
      bindShadowFrameUniforms(receiver, uniforms, { ...config, ...(softness === undefined ? {} : { softness }) });
      return receiver.getParameter("u_prd02ShadowSoftness");
    };
    expect(bound(undefined)).toBe(1);
    expect(bound(3)).toBe(3);
    expect(bound(0)).toBeCloseTo(1e-3, 9);
    system.dispose();
  });
});
