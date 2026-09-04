import { describe, expect, it } from "vitest";
import { createGameAppRuntime } from "../../../packages/engine/src/agent-api/GameAppRuntime";
import type { AuraAppHandle } from "../../../packages/engine/src/agent-api/AuraAppHandle";
import type { GameRuntimeEvidence } from "../../../packages/engine/src/agent-api/GameEvidence";
import {
  createPerformanceGovernor,
  createSideViewGameRenderPreset,
  createTopDownGameRenderPreset,
  estimateGamePerPassCostTotal,
  gamePresetMeasuredPasses,
  type GamePerFramePerfTelemetry
} from "../../../packages/engine/src/production-runtime/GameRenderPreset";

const BUDGET = createSideViewGameRenderPreset().performanceBudget;

const GOOD: GamePerFramePerfTelemetry = {
  fps: 60,
  frameTimeMs: 12,
  draws: 91,
  tris: 120_000,
  particles: 128,
  shadowBytes: 4 * 1024 * 1024
};

const BAD: GamePerFramePerfTelemetry = {
  fps: 32,
  frameTimeMs: 31,
  draws: 220,
  tris: 900_000,
  particles: 512,
  shadowBytes: 16 * 1024 * 1024
};

describe("J1 performance governor", () => {
  it("holds 60fps by degrading resolution, particles, LOD, then shadows in order", () => {
    let governor = createPerformanceGovernor("conservative");
    expect(governor.settings.resolutionScale).toBe(1);

    governor = governor.step(BAD, BUDGET);
    expect(governor.settings.resolutionScale).toBeLessThan(1);
    expect(governor.degraded).toEqual(["resolutionScale"]);

    // Resolution bottoms out at 0.5, then particle scale moves.
    for (let i = 0; i < 3; i += 1) governor = governor.step(BAD, BUDGET);
    expect(governor.settings.resolutionScale).toBe(0.5);
    expect(governor.settings.particleScale).toBeLessThan(1);

    // Keep pushing: LOD bias rises, then shadow size falls.
    for (let i = 0; i < 8; i += 1) governor = governor.step(BAD, BUDGET);
    expect(governor.settings.lodBias).toBeGreaterThan(1);
    expect(governor.settings.shadowSize).toBeLessThanOrEqual(1024);
    expect(governor.degraded).toContain("lodBias");
  });

  it("never touches settings in off mode", () => {
    const governor = createPerformanceGovernor("off").step(BAD, BUDGET);
    expect(governor.settings).toEqual({
      resolutionScale: 1,
      lodBias: 1,
      particleScale: 1,
      shadowSize: 1024
    });
    expect(governor.degraded).toEqual([]);
  });

  it("aggressive degrades faster and recovers sooner than conservative", () => {
    const aggressive = createPerformanceGovernor("aggressive").step(BAD, BUDGET);
    const conservative = createPerformanceGovernor("conservative").step(BAD, BUDGET);
    expect(aggressive.degraded.length).toBeGreaterThan(conservative.degraded.length);

    // Aggressive recovers after 2 sustained headroom frames; conservative needs 4.
    let fast = createPerformanceGovernor("aggressive", {
      resolutionScale: 0.85,
      lodBias: 1,
      particleScale: 1,
      shadowSize: 1024
    });
    fast = fast.step(GOOD, BUDGET).step(GOOD, BUDGET);
    expect(fast.settings.resolutionScale).toBe(1);

    let slow = createPerformanceGovernor("conservative", {
      resolutionScale: 0.85,
      lodBias: 1,
      particleScale: 1,
      shadowSize: 1024
    });
    slow = slow.step(GOOD, BUDGET).step(GOOD, BUDGET);
    expect(slow.settings.resolutionScale).toBe(0.85);
    slow = slow.step(GOOD, BUDGET).step(GOOD, BUDGET);
    expect(slow.settings.resolutionScale).toBe(1);
  });

  it("publishes a per-pass cost model total instead of hiding pass costs", () => {
    expect(estimateGamePerPassCostTotal()).toBeGreaterThan(0);
    expect(estimateGamePerPassCostTotal({
      shadowMapMs: 1,
      bloomMs: 1,
      colorGradeMs: 1,
      ambientParticlesMs: 1,
      environmentFogMs: 1
    })).toBe(5);
  });

  it("every game preset declares its measured passes", () => {
    const sideView = gamePresetMeasuredPasses(createSideViewGameRenderPreset());
    for (const feature of ["shadow-map", "bloom", "color-grade", "environment-fog", "ambient-particles"] as const) {
      expect(sideView, `${feature} must be measured`).toContain(feature);
    }
    const topDown = gamePresetMeasuredPasses(createTopDownGameRenderPreset());
    expect(topDown.length).toBeGreaterThan(0);
    expect(topDown).toContain("shadow-map");
  });
});

function fakeApp(): AuraAppHandle {
  const callbacks = new Set<(frame: { dt: number }) => void>();
  const evidence = {
    kind: "aura-game-runtime-evidence",
    frame: 0,
    time: 0
  } as unknown as GameRuntimeEvidence;
  return {
    scene: {},
    backend: "headless",
    nodes: {},
    runtime: { frame: 0, time: 0, paused: false },
    setScene: () => {},
    onFrame: (callback: (frame: { dt: number }) => void) => {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
    offFrame: () => {},
    input: () => ({
      update: () => {},
      dispose: () => {}
    }),
    pause: () => {},
    resume: () => {},
    step: () => {},
    diagnostics: () => ({}),
    evidence: () => evidence,
    screenshot: () => ({ bytes: new Uint8Array(), width: 1, height: 1 }),
    dispose: () => {}
  } as unknown as AuraAppHandle;
}

describe("J1 GameAppRuntime performance-budget wiring", () => {
  it("publishes full per-frame perf telemetry and applies governor settings", () => {
    const applied: number[] = [];
    const runtime = createGameAppRuntime(fakeApp(), {
      autoStart: false,
      performanceBudget: {
        mode: "conservative",
        budget: BUDGET,
        apply: (settings) => {
          applied.push(settings.resolutionScale);
        }
      }
    });
    expect(runtime.perf).toBeUndefined();
    expect(runtime.evidence.perf).toBeUndefined();

    const snapshot = runtime.pollPerformance(BAD);
    expect(snapshot?.telemetry).toMatchObject({
      fps: 32,
      draws: 220,
      tris: 900_000,
      particles: 512,
      shadowBytes: 16 * 1024 * 1024
    });
    expect(snapshot?.settings.resolutionScale).toBeLessThan(1);
    expect(applied).toEqual([snapshot?.settings.resolutionScale]);
    expect(runtime.perf?.polls).toBe(1);
    expect(runtime.evidence.perf?.settings.resolutionScale).toBeLessThan(1);
    runtime.dispose();
  });

  it("survives a 50-cycle mount/step/dispose soak with flat governor state", () => {
    for (let cycle = 0; cycle < 50; cycle += 1) {
      const runtime = createGameAppRuntime(fakeApp(), {
        autoStart: false,
        performanceBudget: { mode: "conservative", budget: BUDGET }
      });
      runtime.start();
      runtime.pollPerformance(GOOD);
      expect(runtime.perf?.polls).toBe(1);
      expect(runtime.perf?.degraded).toEqual([]);
      const evidence = runtime.dispose();
      expect(evidence.disposed).toBe(true);
    }
  });
});
