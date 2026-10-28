/**
 * PRD-2 WP-3: PCF tap-count tiers (32 / 16 / 8). Unit coverage for tier resolution (per quality tier and scene density),
 * kernel reduction, the forward uniform upload, and the engine's shadow config plumbing. Production kernels (no tier, or a
 * tier at or above the kernel's tap count) must be returned untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  DENSE_SHADOW_CASTER_INSTANCES,
  QUALITY_TIER_SHADOW_PCF_TAPS,
  SHADOW_PCF_TAP_TIERS,
  applyShadowPcfTapTier,
  isShadowPcfTapTier,
  resolveShadowPcfTapTier
} from "../../../packages/rendering/src/shadows/ShadowFilterTier";
import { createShadowFilterKernel } from "../../../packages/rendering/src/ShadowMap";
import { applyForwardPointShadowMapUniforms, applyForwardShadowMapUniforms, applyForwardSpotShadowMapUniforms, packForwardShadowPcfSamples } from "../../../packages/rendering/src/forward/Lighting";
import { MAX_FORWARD_SHADOW_PCF_SAMPLES, type ForwardShadowMapOptions } from "../../../packages/rendering/src/ForwardPass";
import { DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES, denseShadowTapTierEnabled, resolveShadowSystemConfig, shadowQualityTapTierEnabled, shadowTapTierOverride } from "../../../packages/engine/src/agent-api/compiler/shadows";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const grid9 = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });
const grid16 = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1.5, pcfSamples: 16 });
const poisson32 = createShadowFilterKernel({ filter: "pcf", pcfRadius: 2, pcfSamples: 32, pcfDistribution: "poisson" });
const rms = (k: { samples: readonly { x: number; y: number }[] }) => Math.sqrt(k.samples.reduce((a, s) => a + s.x * s.x + s.y * s.y, 0) / k.samples.length);

describe("tier resolution", () => {
  it("declares 32 / 16 / 8 and the dense threshold used by the auto-cascade cap", () => {
    expect(SHADOW_PCF_TAP_TIERS).toEqual([32, 16, 8]);
    expect(MAX_FORWARD_SHADOW_PCF_SAMPLES).toBe(32);
    expect(DENSE_SHADOW_CASTER_INSTANCES).toBe(8192);
    expect(DENSE_SHADOW_CASTER_INSTANCES).toBe(DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES);
    expect([32, 16, 8, 9, 0, "8", undefined].map(isShadowPcfTapTier)).toEqual([true, true, true, false, false, false, false]);
  });

  it("keeps the authored kernel for every quality tier unless the quality default is opted in", () => {
    for (const quality of ["low", "medium", "high", "ultra", undefined]) {
      expect(resolveShadowPcfTapTier({ quality, casterInstances: 100 })).toEqual({ tier: 32, reason: "default", casterInstances: 100 });
      expect(resolveShadowPcfTapTier({ quality, casterInstances: 18000 })).toEqual({ tier: 32, reason: "default", casterInstances: 18000 });
    }
  });

  it("maps each quality tier to a tap tier when the quality default is opted in", () => {
    expect(QUALITY_TIER_SHADOW_PCF_TAPS).toEqual({ low: 8, medium: 16, high: 32, ultra: 32 });
    for (const [quality, tier] of Object.entries(QUALITY_TIER_SHADOW_PCF_TAPS)) {
      expect(resolveShadowPcfTapTier({ quality, casterInstances: 100, qualityDefault: true })).toEqual({ tier, reason: "quality-tier", casterInstances: 100 });
    }
    expect(resolveShadowPcfTapTier({ quality: "unknown", qualityDefault: true }).tier).toBe(32);
  });

  it("sends dense instanced casters (>= 8,192) to the lowest tier when the dense default is opted in", () => {
    const dense = { denseDefault: true } as const;
    expect(resolveShadowPcfTapTier({ quality: "high", casterInstances: 8191, ...dense }).tier).toBe(32);
    expect(resolveShadowPcfTapTier({ quality: "high", casterInstances: 8192, ...dense })).toEqual({ tier: 8, reason: "dense-instanced-casters", casterInstances: 8192 });
    expect(resolveShadowPcfTapTier({ quality: "ultra", casterInstances: 18000, ...dense }).tier).toBe(8);
    expect(resolveShadowPcfTapTier({ casterInstances: 18000, ...dense }).tier).toBe(8);
    expect(resolveShadowPcfTapTier({ quality: "low", casterInstances: 18000, qualityDefault: true, ...dense }).tier).toBe(8);
  });

  it("ignores density unless the caller opted in to the dense default", () => {
    expect(resolveShadowPcfTapTier({ quality: "high", casterInstances: 18000 })).toEqual({ tier: 32, reason: "default", casterInstances: 18000 });
    expect(resolveShadowPcfTapTier({ quality: "high", casterInstances: 18000, qualityDefault: true, denseDefault: false })).toEqual({ tier: 32, reason: "quality-tier", casterInstances: 18000 });
  });

  it("never raises a tier through density, and lets an explicit request win", () => {
    expect(resolveShadowPcfTapTier({ quality: "low", casterInstances: 0, qualityDefault: true }).tier).toBe(8);
    expect(resolveShadowPcfTapTier({ quality: "high", casterInstances: 18000, requested: 32, denseDefault: true })).toEqual({ tier: 32, reason: "explicit", casterInstances: 18000 });
    expect(resolveShadowPcfTapTier({ quality: "low", requested: 16 }).tier).toBe(16);
    expect(() => resolveShadowPcfTapTier({ requested: 12 })).toThrow(RangeError);
    expect(resolveShadowPcfTapTier()).toEqual({ tier: 32, reason: "default", casterInstances: 0 });
  });
});

describe("kernel reduction", () => {
  it("returns the same kernel object when it is within the cap or no tier is set (production kernels unchanged)", () => {
    expect(applyShadowPcfTapTier(grid9, undefined)).toBe(grid9);
    expect(applyShadowPcfTapTier(grid9, 32)).toBe(grid9);
    expect(applyShadowPcfTapTier(grid9, 16)).toBe(grid9);
    expect(applyShadowPcfTapTier(grid16, 16)).toBe(grid16);
    expect(applyShadowPcfTapTier(poisson32, 32)).toBe(poisson32);
    const none = createShadowFilterKernel({ filter: "none" });
    expect(applyShadowPcfTapTier(none, 8)).toBe(none);
  });

  it("reduces a larger kernel to exactly tier taps with normalised weights and the same RMS reach", () => {
    for (const [kernel, tier] of [[grid9, 8], [grid16, 8], [poisson32, 16], [poisson32, 8]] as const) {
      const reduced = applyShadowPcfTapTier(kernel, tier);
      expect(reduced).not.toBe(kernel);
      expect(reduced.samples).toHaveLength(tier);
      expect(reduced.mode).toBe("pcf");
      expect(reduced.samples.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 5);
      expect(reduced.samples.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && s.weight > 0)).toBe(true);
      expect(rms(reduced) / rms(kernel)).toBeCloseTo(1, 3);
    }
  });

  it("caches the reduced kernel per source kernel and tier", () => {
    expect(applyShadowPcfTapTier(grid16, 8)).toBe(applyShadowPcfTapTier(grid16, 8));
    expect(applyShadowPcfTapTier(poisson32, 16)).not.toBe(applyShadowPcfTapTier(poisson32, 8));
  });

  it("produces kernels the forward validator accepts at every tier", () => {
    for (const tier of SHADOW_PCF_TAP_TIERS) {
      const packed = packForwardShadowPcfSamples(applyShadowPcfTapTier(poisson32, tier), "tier-test");
      expect(packed).toHaveLength(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
    }
  });
});

describe("forward uniform upload", () => {
  const shader = {
    reflection: {
      uniforms: new Set([
        "u_shadowMapTexture", "u_shadowMapEnabled", "u_shadowMapMatrix", "u_shadowMapStrength", "u_shadowMapBias",
        "u_shadowMapSlopeBias", "u_shadowMapTexelSize", "u_shadowPcfSampleCount", "u_shadowPcfSamples"
      ])
    }
  } as never;
  const item = { label: "tier-item" } as never;
  const texture = { validate: () => ({ ok: true, diagnostics: [] }), texture: { width: 2048, height: 2048 } } as never;
  const upload = (extra: Partial<ForwardShadowMapOptions>) => {
    const uniforms = new Map<string, unknown>();
    applyForwardShadowMapUniforms({ texture, lightMatrix: new Float32Array(16), texelSize: [1 / 2048, 1 / 2048], ...extra } as ForwardShadowMapOptions, item, shader, uniforms as never);
    return { count: uniforms.get("u_shadowPcfSampleCount") as number, samples: uniforms.get("u_shadowPcfSamples") as Float32Array };
  };

  it("uploads the authored tap count without a tier, and the capped count with one", () => {
    const base = upload({ filterKernel: grid16 });
    expect(base.count).toBe(16);
    expect(upload({ filterKernel: grid16, pcfTapTier: 32 })).toEqual(base);
    expect(upload({ filterKernel: grid16, pcfTapTier: 16 })).toEqual(base);
    const eight = upload({ filterKernel: grid16, pcfTapTier: 8 });
    expect(eight.count).toBe(8);
    expect(eight.samples).toHaveLength(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
  });

  it("falls back to the 9-tap default kernel and caps it at 8", () => {
    expect(upload({}).count).toBe(9);
    expect(upload({ pcfTapTier: 8 }).count).toBe(8);
  });

  it("caps the point-light and spot-light kernels with the same tier and leaves them alone without one", () => {
    const names = (prefix: string) => ({ reflection: { uniforms: new Set(["MapTexture", "MapEnabled", "LightPosition", "LightDirection", "Range", "FaceMatrices", "FaceRects", "Matrix", "Cone", "Strength", "Bias", "SlopeBias", "TexelSize", "PcfSampleCount", "PcfSamples"].map((n) => `u_${prefix}Shadow${n}`)) } }) as never;
    const identity = new Float32Array(16);
    const point = (kernel: typeof grid16, tier?: 32 | 16 | 8) => {
      const uniforms = new Map<string, unknown>();
      applyForwardPointShadowMapUniforms({ texture, lightPosition: [0, 5, 0], range: 20, faceMatrices: new Float32Array(96), faceRects: new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1, 1]).flat()), texelSize: [1 / 512, 1 / 512], filterKernel: kernel } as never, item, names("point"), uniforms as never, tier);
      return uniforms.get("u_pointShadowPcfSampleCount") as number;
    };
    const spot = (kernel: typeof grid16, tier?: 32 | 16 | 8) => {
      const uniforms = new Map<string, unknown>();
      applyForwardSpotShadowMapUniforms({ texture, lightPosition: [0, 5, 0], lightDirection: [0, -1, 0], shadowMatrix: identity, angle: 0.6, range: 20, texelSize: [1 / 512, 1 / 512], filterKernel: kernel } as never, item, names("spot"), uniforms as never, tier);
      return uniforms.get("u_spotShadowPcfSampleCount") as number;
    };
    expect([point(grid16), point(grid16, 32), point(grid16, 16), point(grid16, 8)]).toEqual([16, 16, 16, 8]);
    expect([spot(poisson32), spot(poisson32, 32), spot(poisson32, 16), spot(poisson32, 8)]).toEqual([32, 32, 16, 8]);
  });
});

describe("engine shadow config", () => {
  afterEach(() => {
    delete (globalThis as { __A3D_SHADOW_TAPS__?: unknown }).__A3D_SHADOW_TAPS__;
    delete (globalThis as { __A3D_DENSE_SHADOWS__?: unknown }).__A3D_DENSE_SHADOWS__;
    delete (globalThis as { __A3D_DENSE_SHADOW_TAPS__?: unknown }).__A3D_DENSE_SHADOW_TAPS__;
    delete (globalThis as { __A3D_QUALITY_SHADOW_TAPS__?: unknown }).__A3D_QUALITY_SHADOW_TAPS__;
  });
  const transforms = (n: number) => Array.from({ length: n }, (_, i) => ({ position: [(i % 100) - 50, 0, Math.floor(i / 100) - 50] as [number, number, number] }));
  const snapshotWith = (count: number): AuraSceneSnapshot =>
    scene()
      .add(lights.directional({ position: [30, 50, 20], shadow: true }))
      .add(instances.cylinder({ name: "trunks", transforms: transforms(count), castShadow: true }))
      .toJSON() as AuraSceneSnapshot;
  const descriptors = [{ shadowRequested: true }];

  it("leaves every quality tier on the authored kernel by default (low included), and records why", () => {
    for (const quality of ["low", "medium", "high", "ultra"] as const) {
      const config = resolveShadowSystemConfig(snapshotWith(500), descriptors, quality);
      expect([quality, config.pcfTapTier, config.pcfTapReason]).toEqual([quality, 32, "default"]);
      // End to end: what the forward shader receives is the 9-tap kernel itself, not a Poisson replacement.
      expect(applyShadowPcfTapTier(grid9, config.pcfTapTier)).toBe(grid9);
    }
    const dense = resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "low");
    expect([dense.pcfTapTier, dense.pcfTapReason]).toEqual([32, "default"]);
    expect(shadowQualityTapTierEnabled()).toBe(false);
    expect(denseShadowTapTierEnabled()).toBe(false);
  });

  it("records the tier and why per quality tier and density once opted in", () => {
    (globalThis as { __A3D_QUALITY_SHADOW_TAPS__?: string }).__A3D_QUALITY_SHADOW_TAPS__ = "on";
    expect(shadowQualityTapTierEnabled()).toBe(true);
    const small = resolveShadowSystemConfig(snapshotWith(500), descriptors, "high");
    expect([small.pcfTapTier, small.pcfTapReason]).toEqual([32, "quality-tier"]);
    expect(resolveShadowSystemConfig(snapshotWith(500), descriptors, "medium").pcfTapTier).toBe(16);
    const low = resolveShadowSystemConfig(snapshotWith(500), descriptors, "low");
    expect([low.pcfTapTier, low.pcfTapReason]).toEqual([8, "quality-tier"]);
    expect(applyShadowPcfTapTier(grid9, low.pcfTapTier)).not.toBe(grid9);
    // The dense default is a separate opt-in: without it a dense scene keeps its quality tier.
    const denseOff = resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "high");
    expect([denseOff.pcfTapTier, denseOff.pcfTapReason]).toEqual([32, "quality-tier"]);
    (globalThis as { __A3D_DENSE_SHADOW_TAPS__?: string }).__A3D_DENSE_SHADOW_TAPS__ = "on";
    expect(denseShadowTapTierEnabled()).toBe(true);
    const dense = resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "high");
    expect([dense.pcfTapTier, dense.pcfTapReason]).toEqual([8, "dense-instanced-casters"]);
    expect((globalThis as { __A3D_SHADOW_TAP_TIER__?: { tier: number; reason: string; casterInstances: number } }).__A3D_SHADOW_TAP_TIER__)
      .toMatchObject({ tier: 8, reason: "dense-instanced-casters", casterInstances: DENSE_SHADOW_CASTER_INSTANCES });
  });

  it("counts dense casters even when cascades are explicit, and the cascade kill switch does not hide them from the tap tier", () => {
    (globalThis as { __A3D_DENSE_SHADOW_TAPS__?: string }).__A3D_DENSE_SHADOW_TAPS__ = "on";
    const explicit = [{ shadowRequested: true, shadowOptions: { cascades: 3 as const } }];
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), explicit, "high").pcfTapTier).toBe(8);
    (globalThis as { __A3D_DENSE_SHADOWS__?: string }).__A3D_DENSE_SHADOWS__ = "off";
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "high").pcfTapTier).toBe(8);
    expect((globalThis as { __A3D_SHADOW_TAP_TIER__?: { casterInstances: number } }).__A3D_SHADOW_TAP_TIER__?.casterInstances).toBe(DENSE_SHADOW_CASTER_INSTANCES);
    // Turning the dense tap opt-in off restores the authored kernel, whatever the cascade switch says.
    (globalThis as { __A3D_DENSE_SHADOW_TAPS__?: string }).__A3D_DENSE_SHADOW_TAPS__ = "off";
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "high").pcfTapTier).toBe(32);
    (globalThis as { __A3D_SHADOW_TAPS__?: unknown }).__A3D_SHADOW_TAPS__ = 16;
    expect(shadowTapTierOverride()).toBe(16);
    expect(resolveShadowSystemConfig(snapshotWith(DENSE_SHADOW_CASTER_INSTANCES), descriptors, "high")).toMatchObject({ pcfTapTier: 16, pcfTapReason: "explicit" });
    (globalThis as { __A3D_SHADOW_TAPS__?: unknown }).__A3D_SHADOW_TAPS__ = 12;
    expect(shadowTapTierOverride()).toBeUndefined();
  });
});
