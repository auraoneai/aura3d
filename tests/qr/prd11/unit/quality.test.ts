/**
 * PRD 11 Phase 4 — tier detection, render-scale controller, quality governor,
 * real AuraQuality controller, and delegated game governor.
 */
import { describe, expect, it } from "vitest";

import type { DeviceProbe } from "../../../../packages/rendering/src/contracts/device";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { classifyRendererString } from "../../../../packages/rendering/src/quality/DeviceClasses";
import {
  TierResolver,
  calibrateTierDecision,
  qualityDecisionCacheKey,
  readCachedTierDecision,
  writeCachedTierDecision
} from "../../../../packages/rendering/src/quality/TierResolver";
import {
  createRenderScaleController,
  effectiveRenderScaleFloor
} from "../../../../packages/rendering/src/quality/RenderScaleController";
import { QualityGovernor } from "../../../../packages/rendering/src/quality/QualityGovernor";
import { AuraQuality } from "../../../../packages/rendering/src/quality/QualityController";
import { createPerformanceGovernor } from "../../../../packages/engine/src/production-runtime/GameRenderPreset";

function probe(over: Partial<DeviceProbe> = {}): DeviceProbe {
  return {
    backend: "webgl2",
    rendererString: "ANGLE (NVIDIA GeForce RTX 4070)",
    unmaskedRenderer: "NVIDIA GeForce RTX 4070",
    unmaskedVendor: "NVIDIA",
    maxTextureSize: 16384,
    maxSamples: 8,
    floatColorBuffer: true,
    halfFloatColorBuffer: true,
    timerQuery: true,
    parallelShaderCompile: true,
    multiDraw: true,
    devicePixelRatio: 2,
    screen: [1920, 1080],
    hardwareConcurrency: 16,
    deviceMemoryGB: 16,
    mobile: false,
    ...over
  };
}

describe("classifyRendererString (§6.4 step 2)", () => {
  it("maps reference hardware classes to tiers", () => {
    expect(classifyRendererString("NVIDIA GeForce RTX 4090").tier).toBe("ultra");
    expect(classifyRendererString("NVIDIA GeForce RTX 4070").tier).toBe("ultra");
    expect(classifyRendererString("NVIDIA GeForce RTX 4070 Laptop GPU").tier).toBe("high");
    expect(classifyRendererString("Apple M3 Pro").tier).toBe("high");
    expect(classifyRendererString("Apple M2 Max").tier).toBe("high");
    expect(classifyRendererString("AMD Radeon RX 6800").tier).toBe("high");
    expect(classifyRendererString("Apple M1").tier).toBe("medium");
    expect(classifyRendererString("Intel(R) Iris(R) Xe Graphics").tier).toBe("medium");
    expect(classifyRendererString("Adreno 740").tier).toBe("medium");
    expect(classifyRendererString("Intel(R) UHD Graphics 620").tier).toBe("low");
    expect(classifyRendererString("Apple Paravirtual device").tier).toBe("low");
    expect(classifyRendererString("Mali-G52").tier).toBe("low");
  });

  it("returns medium/unmatched for unknown strings", () => {
    expect(classifyRendererString("Imaginary GPU 3000")).toEqual({ tier: "medium", matched: null });
    expect(classifyRendererString(null).matched).toBeNull();
  });
});

describe("TierResolver.detect (§6.4)", () => {
  const resolver = new TierResolver();

  it("hard floors win over the class table", () => {
    expect(resolver.detect(probe({ floatColorBuffer: false, halfFloatColorBuffer: false })).tier).toBe("low");
    expect(resolver.detect(probe({ maxTextureSize: 2048 })).tier).toBe("low");
    const soft = resolver.detect(probe({ unmaskedRenderer: "Google SwiftShader", rendererString: "Google SwiftShader" }));
    expect(soft.tier).toBe("low");
    expect(soft.confidence).toBe("high");
  });

  it("classifies real GPUs and honours mobile signal adjustment", () => {
    expect(resolver.detect(probe()).tier).toBe("ultra");
    const mobile = resolver.detect(probe({
      unmaskedRenderer: "Adreno 740",
      mobile: true,
      hardwareConcurrency: 4,
      deviceMemoryGB: 4,
      screen: [390, 844],
      devicePixelRatio: 3
    }));
    expect(mobile.tier).toBe("low"); // Adreno 740 = medium, cores ≤ 4 lowers one
    expect(mobile.reasons.join()).toContain("signal:");
  });

  it("masked 'Apple GPU' lands medium with low confidence", () => {
    const r = resolver.detect(probe({ unmaskedRenderer: null, rendererString: "Apple GPU", mobile: true }));
    expect(r.tier).toBe("medium");
    expect(r.confidence).toBe("low");
  });

  it("clamps DPR inside the tier when the backing area exceeds 4 MP", () => {
    // Medium cap is 1.5; 2560×1440 at 1.5 ⇒ 8.3 MP > 4 MP → clamps, never below 1.
    const r = resolver.detect(probe({
      unmaskedRenderer: "Apple M1",
      screen: [2560, 1440],
      devicePixelRatio: 2
    }));
    expect(r.tier).toBe("medium");
    expect(r.maxPixelRatio).toBeLessThan(QUALITY_TIERS.medium.maxPixelRatio);
    expect(r.maxPixelRatio).toBeGreaterThanOrEqual(1);
    expect(r.reasons.join()).toContain("dpr-area-clamp");
    // Low tier is already at DPR 1 — the clamp is a no-op there.
    const low = resolver.detect(probe({
      unmaskedRenderer: "Intel(R) UHD Graphics 620",
      screen: [2560, 1440],
      devicePixelRatio: 2
    }));
    expect(low.maxPixelRatio).toBe(1);
    expect(low.reasons.join()).not.toContain("dpr-area-clamp");
  });
});

describe("calibration (§6.4 step 4)", () => {
  const cls = { tier: "high" as const, confidence: "low" as const, reasons: [], maxPixelRatio: 2, matchedClass: "x" };

  it("drops one tier when p50 exceeds 1.25× target", () => {
    const r = calibrateTierDecision(cls, { p50IntervalMs: 24, p50GpuMs: null }, 16.7);
    expect(r).toMatchObject({ tier: "medium", calibrated: true });
  });

  it("raises only on GPU evidence and low confidence", () => {
    const up = calibrateTierDecision(cls, { p50IntervalMs: 2, p50GpuMs: 6 }, 16.7);
    expect(up).toMatchObject({ tier: "ultra", calibrated: true });
    const noGpu = calibrateTierDecision(cls, { p50IntervalMs: 2, p50GpuMs: null }, 16.7);
    expect(noGpu.calibrated).toBe(false);
    const highConf = calibrateTierDecision({ ...cls, confidence: "high" }, { p50IntervalMs: 2, p50GpuMs: 6 }, 16.7);
    expect(highConf.calibrated).toBe(false);
  });
});

describe("decision persistence (§6.4 step 5)", () => {
  const store = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
  };

  it("round-trips and reports source 'cache'", () => {
    const s = store();
    const p = probe();
    const key = qualityDecisionCacheKey(p, "3.0.1");
    writeCachedTierDecision(s, key, { tier: "high", source: "classified", reason: "test" });
    const hit = readCachedTierDecision(s, key);
    expect(hit).toMatchObject({ tier: "high", source: "cache" });
  });

  it("misses on a different key without throwing", () => {
    const s = store();
    expect(readCachedTierDecision(s, "nothing")).toBeNull();
    expect(readCachedTierDecision(null, "x")).toBeNull();
  });
});

describe("RenderScaleController (§6.5)", () => {
  it("steps down 0.1 after 30 over-budget frames and clamps at floor", () => {
    const c = createRenderScaleController({ targetFrameMs: 16.7, minScale: 0.5 });
    for (let i = 0; i < 30; i += 1) c.sample(20);
    expect(c.scale).toBeCloseTo(0.9);
    for (let i = 0; i < 300; i += 1) c.sample(40);
    expect(c.scale).toBeCloseTo(0.5);
  });

  it("steps back up after 120 under-budget frames and uses gpuMs when given", () => {
    const c = createRenderScaleController({ targetFrameMs: 16.7, minScale: 0.5, initialScale: 0.9 });
    for (let i = 0; i < 120; i += 1) c.sample(20, 5); // gpuMs=5 < 13.36 → under
    expect(c.scale).toBeCloseTo(1);
    // gpuMs dominates intervalMs
    const c2 = createRenderScaleController({ targetFrameMs: 16.7, minScale: 0.5 });
    for (let i = 0; i < 30; i += 1) c2.sample(5, 30);
    expect(c2.scale).toBeCloseTo(0.9);
  });

  it("effectiveRenderScaleFloor honours the CSS floor", () => {
    expect(effectiveRenderScaleFloor(0.5, 2, false)).toBeCloseTo(0.5);
    expect(effectiveRenderScaleFloor(0.4, 2, false)).toBeCloseTo(0.5);
    expect(effectiveRenderScaleFloor(0.4, 2, true)).toBeCloseTo(0.4);
  });
});

describe("QualityGovernor (§6.5)", () => {
  function makeGovernor(opts: Partial<ConstructorParameters<typeof QualityGovernor>[0]> = {}) {
    const scale = createRenderScaleController({ targetFrameMs: 16.7, minScale: 0.5 });
    return new QualityGovernor({
      tier: "high",
      mobile: false,
      targetFrameMs: 16.7,
      devicePixelRatio: 1,
      scaleSource: scale,
      ...opts
    });
  }

  it("steps SSR to the next-lower tier's value after 300 floor-pinned over-budget frames", () => {
    const gov = makeGovernor();
    const steps: string[] = [];
    gov.onStep((s) => steps.push(`${s.direction}:${s.feature}`));
    for (let i = 0; i < 300; i += 1) {
      for (let j = 0; j < 30; j += 1) gov.tick(30, null); // push scale down
    }
    expect(gov.scale).toBeCloseTo(0.5); // at floor
    for (let i = 0; i < 400; i += 1) gov.tick(30, null);
    expect(steps[0]).toBe("down:ssr");
    expect(gov.effectiveSettings().ssr).toBe(QUALITY_TIERS.medium.ssr);
  });

  it("skips a feature already at the next-lower tier's value", () => {
    const gov = makeGovernor({ overrides: { ssr: "off" } });
    const steps: string[] = [];
    gov.onStep((s) => steps.push(s.feature));
    for (let i = 0; i < 12000; i += 1) gov.tick(30, null);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).not.toBe("ssr"); // ssr already equals medium's "off" → skipped to ambientOcclusion
    expect(steps[0]).toBe("ambientOcclusion");
  });

  it("never steps while locked and steps back up on sustained headroom", () => {
    const gov = makeGovernor();
    const steps: { direction: string; feature: string }[] = [];
    gov.onStep((s) => steps.push({ direction: s.direction, feature: s.feature }));
    gov.setLocked(true);
    for (let i = 0; i < 12000; i += 1) gov.tick(30, null);
    expect(steps).toHaveLength(0);
    gov.setLocked(false);
    for (let i = 0; i < 12000; i += 1) gov.tick(30, null);
    expect(steps.filter((s) => s.direction === "down").length).toBeGreaterThan(0);
    for (let i = 0; i < 13000; i += 1) gov.tick(8, null);
    expect(steps.some((s) => s.direction === "up")).toBe(true);
  });
});

describe("AuraQuality controller (C-27)", () => {
  it("auto + probe → classified decision; explicit tier skips detection", () => {
    const auto = new AuraQuality("auto", undefined, { coarsePointer: false });
    auto.attachProbe(probe());
    expect(auto.tier).toBe("ultra");
    expect(auto.decision.source).toBe("classified");

    const explicit = new AuraQuality("low");
    explicit.attachProbe(probe());
    expect(explicit.tier).toBe("low");
    expect(explicit.decision.source).toBe("explicit");
  });

  it("cache hit short-circuits detection", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const p = probe({ unmaskedRenderer: "NVIDIA GeForce RTX 4070" });
    const key = qualityDecisionCacheKey(p, "v-test");
    writeCachedTierDecision(storage, key, { tier: "low", source: "calibrated", reason: "seeded" });
    const c = new AuraQuality("auto", undefined, { storage, engineVersion: "v-test" });
    c.attachProbe(p);
    expect(c.tier).toBe("low");
    expect(c.decision.source).toBe("cache");
  });

  it("calibrates down after 30 slow frames and persists", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const c = new AuraQuality("auto", undefined, { storage, engineVersion: "v-cal" });
    c.attachProbe(probe({ unmaskedRenderer: "Imaginary GPU 3000" })); // → medium, confidence low
    expect(c.tier).toBe("medium");
    for (let i = 0; i < 30; i += 1) c.tickFrame(30, 25);
    expect(c.tier).toBe("low");
    expect(c.decision.source).toBe("calibrated");
    expect(readCachedTierDecision(storage, qualityDecisionCacheKey(probe({ unmaskedRenderer: "Imaginary GPU 3000" }), "v-cal"))?.tier).toBe("low");
  });

  it("lock blocks set(); unlock + set emits onChange", async () => {
    const c = new AuraQuality("high");
    const seen: string[] = [];
    c.onChange((e) => seen.push(`${e.from}->${e.to}:${e.reason}`));
    c.lock();
    await c.set("low");
    expect(c.tier).toBe("high");
    c.unlock();
    await c.set("medium");
    expect(c.tier).toBe("medium");
    expect(seen).toEqual(["high->medium:set"]);
  });

  it("adaptive:false disables the governor but detection still runs", () => {
    const c = new AuraQuality("auto", undefined, { adaptive: false });
    c.attachProbe(probe());
    expect(c.tier).toBe("ultra");
    for (let i = 0; i < 20000; i += 1) c.tickFrame(50, null);
    expect(c.governorSteps).toHaveLength(0);
  });
});

describe("createPerformanceGovernor delegated mode (§6.5)", () => {
  const budget = { maxFrameTimeMs: 16.7, minFps: 55, maxDrawCalls: 600, enabledFeatures: [] as const };
  const over = { fps: 30, frameTimeMs: 30, draws: 10, tris: 10, particles: 10, shadowBytes: 0 };

  it("one delegated step per over-budget window, not two", () => {
    const quality = new AuraQuality("high");
    let gov = createPerformanceGovernor("conservative", undefined, quality);
    expect(gov.delegated).toBe(true);
    gov = gov.step(over, budget);
    // resolution floor 1→0.85 first; second call at floor… conservative does 1 step
    gov = gov.step(over, budget);
    gov = gov.step(over, budget);
    gov = gov.step(over, budget);
    const settings = quality.settings;
    // four over-budget steps: resolutionScale 0.85, 0.7, 0.5 then one delegated knob
    expect(settings.particleBudget).not.toBe(QUALITY_TIERS.high.particleBudget);
    expect(gov.settings.particleScale).toBe(1); // untouched locally
    expect(gov.degraded.some((d) => d.startsWith("delegated:"))).toBe(true);
  });

  it("non-delegated governor unchanged", () => {
    let gov = createPerformanceGovernor();
    expect(gov.delegated).toBe(false);
    for (let i = 0; i < 4; i += 1) gov = gov.step(over, budget);
    expect(gov.settings.particleScale).toBe(0.7);
  });
});
