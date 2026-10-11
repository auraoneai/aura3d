import { describe, expect, it, vi } from "vitest";

import { createPerformanceGovernor } from "../../../../packages/engine/src/production-runtime/GameRenderPreset";
import { AuraQuality } from "../../../../packages/rendering/src/quality/QualityController";
import type { DeviceProbe } from "../../../../packages/rendering/src/contracts/device";

/**
 * PRD-11 Wave B GameRenderPreset row: with both the game governor and the
 * C-27 AuraQuality governor active, every over-budget window moves exactly one
 * knob (conservative) — the game governor delegates non-resolution knobs
 * through one `quality.set`, never double-stepping (§6.5 single authority).
 */

const budget = { maxFrameTimeMs: 16.7, minFps: 55, maxDrawCalls: 600, enabledFeatures: [] as const };
const over = { fps: 30, frameTimeMs: 30, draws: 10, tris: 10, particles: 10, shadowBytes: 0 };

function desktopProbe(): DeviceProbe {
  return {
    backend: "webgl2", rendererString: "x", unmaskedRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)",
    unmaskedVendor: null, maxTextureSize: 16384, maxSamples: 4, floatColorBuffer: true, halfFloatColorBuffer: true,
    timerQuery: false, parallelShaderCompile: true, multiDraw: true, devicePixelRatio: 1, screen: [1920, 1080],
    hardwareConcurrency: null, deviceMemoryGB: null, mobile: false
  };
}

function activeQuality(): AuraQuality {
  const quality = new AuraQuality("high", undefined, { adaptive: true });
  quality.attachProbe(desktopProbe()); // explicit tier: builds the C-27 governor, no detection
  return quality;
}

describe("GameRenderPreset governor with AuraQuality active", () => {
  it("conservative: exactly one knob per over-budget window, one quality.set per delegated step", () => {
    const quality = activeQuality();
    const set = vi.spyOn(quality, "set");
    let gov = createPerformanceGovernor("conservative", undefined, quality);
    expect(gov.delegated).toBe(true);
    const perStep: string[][] = [];
    for (let window = 0; window < 7; window += 1) {
      const before = gov.degraded.length;
      const setsBefore = set.mock.calls.length;
      gov = gov.step(over, budget);
      const added = gov.degraded.slice(before);
      perStep.push(added);
      const delegated = added.filter((entry) => entry.startsWith("delegated:")).length;
      expect(added.length).toBeLessThanOrEqual(1);
      expect(set.mock.calls.length - setsBefore).toBe(delegated);
    }
    // Resolution first (3 rungs), then delegated knobs; local non-resolution knobs never move.
    expect(perStep.slice(0, 3)).toEqual([["resolutionScale"], ["resolutionScale"], ["resolutionScale"]]);
    expect(perStep[3]).toEqual(["delegated:particleScale"]);
    expect(gov.settings).toMatchObject({ particleScale: 1, lodBias: 1, shadowSize: 1024 });
  });

  it("aggressive: at most two knobs per window", () => {
    const quality = activeQuality();
    let gov = createPerformanceGovernor("aggressive", undefined, quality);
    for (let window = 0; window < 5; window += 1) {
      const before = gov.degraded.length;
      gov = gov.step(over, budget);
      expect(gov.degraded.length - before).toBeLessThanOrEqual(2);
    }
  });
});
