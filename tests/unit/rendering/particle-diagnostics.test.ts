import { describe, expect, it } from "vitest";
import {
  createLayeredParticleBudgetPlan,
  createParticleBatchDiagnostics,
  summarizeParticleBatchDiagnostics
} from "../../../packages/rendering/src";

describe("particle diagnostics", () => {
  it("creates reusable layered particle budgets with deterministic remainder assignment", () => {
    const plan = createLayeredParticleBudgetPlan({
      requestedParticles: 12_000,
      minParticles: 4_000,
      maxParticles: 50_000,
      layers: [
        { name: "primary", weight: 0.54 },
        { name: "vortex", weight: 0.23 },
        { name: "network", weight: 0.15 },
        { name: "wave", weight: 0 }
      ],
      densityTiers: [
        { threshold: 50_000, label: "50k stress", mode: "stress" },
        { threshold: 24_000, label: "24k stress", mode: "stress" },
        { threshold: 12_000, label: "12k showcase", mode: "showcase" },
        { threshold: 4_000, label: "4k interactive", mode: "interactive" }
      ],
      nativeGpuComputeDispatches: 0
    });

    expect(plan).toMatchObject({
      requestedParticles: 12_000,
      effectiveParticles: 12_000,
      densityTier: "12k showcase",
      mode: "showcase",
      nativeGpuComputeDispatches: 0
    });
    expect(plan.layers.map((layer) => [layer.name, layer.particleCount])).toEqual([
      ["primary", 6480],
      ["vortex", 2760],
      ["network", 1800],
      ["wave", 960]
    ]);
    expect(plan.layers.reduce((sum, layer) => sum + layer.particleCount, 0)).toBe(12_000);
  });

  it("clamps layered particle budgets and preserves non-compute warnings", () => {
    const plan = createLayeredParticleBudgetPlan({
      requestedParticles: 80_000,
      minParticles: 4_000,
      maxParticles: 50_000,
      layers: [
        { name: "foreground", weight: 0.5 },
        { name: "support", weight: 0.25 },
        { name: "remainder", weight: 0 }
      ],
      densityTiers: [
        { threshold: 50_000, label: "50k stress", mode: "stress" },
        { threshold: 4_000, label: "4k interactive", mode: "interactive" }
      ]
    });
    expect(plan.effectiveParticles).toBe(50_000);
    expect(plan.layers.map((layer) => layer.particleCount)).toEqual([25_000, 12_500, 12_500]);

    const diagnostics = createParticleBatchDiagnostics(plan.layers.map((layer) => ({
      name: layer.name,
      particleCount: layer.particleCount
    })), {
      updateMode: "static-geometry",
      targetFrameMs: 34
    });
    expect(summarizeParticleBatchDiagnostics(diagnostics).join("\n")).toContain("CPU/static particle update path");
    expect(diagnostics.warnings).toContain("50k CPU-generated particles is a dense visualization tier, not a native compute-particle stress proof");
  });

  it("uses an explicit default particle count for invalid requests", () => {
    const plan = createLayeredParticleBudgetPlan({
      requestedParticles: Number.NaN,
      defaultParticles: 12_000,
      minParticles: 4_000,
      maxParticles: 50_000,
      layers: [
        { name: "main", weight: 0.6 },
        { name: "support", weight: 0 }
      ],
      densityTiers: [
        { threshold: 12_000, label: "12k showcase", mode: "showcase" },
        { threshold: 4_000, label: "4k interactive", mode: "interactive" }
      ]
    });

    expect(plan.requestedParticles).toBe(12_000);
    expect(plan.effectiveParticles).toBe(12_000);
    expect(plan.mode).toBe("showcase");
    expect(plan.layers.map((layer) => layer.particleCount)).toEqual([7200, 4800]);
  });

  it("rejects invalid layered budget definitions", () => {
    expect(() => createLayeredParticleBudgetPlan({
      requestedParticles: 100,
      minParticles: 0,
      maxParticles: 100,
      layers: [],
      densityTiers: [{ threshold: 0, label: "default", mode: "default" }]
    })).toThrow(/at least one layer/);

    expect(() => createLayeredParticleBudgetPlan({
      requestedParticles: 100,
      minParticles: 0,
      maxParticles: 100,
      layers: [{ name: "bad", weight: 1.5 }],
      densityTiers: [{ threshold: 0, label: "default", mode: "default" }]
    })).toThrow(/layer weights/);
  });
});
