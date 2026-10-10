// PRD-07 P5-T1 — emitters whose `sim` lowers to "gpu" publish GpuSimRequests
// on `gpuSimFeed()`; "auto" picks gpu past the 4096 CPU cap; the CPU emitter
// feed stays as the draw source until the PARTICLE_SOURCE texture variant
// lands (§8.3 fallback, IC-0).

import { describe, expect, it } from "vitest";
import { lowerEffectNode, type LoweredParticleEffect } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { ProductionEffectSystem } from "../../../../packages/engine/src/production-runtime/effects/ProductionEffectSystem";

const node = (over: Record<string, unknown>) =>
  ({ kind: "effect", effect: "particles", id: "n1", ...over } as never);

const emitterOf = (lowered: ReturnType<typeof lowerEffectNode>): LoweredParticleEffect => {
  if (lowered.type !== "emitter") throw new Error(`expected emitter, got ${lowered.type}`);
  return lowered;
};

function stubApp(nodes: unknown[]) {
  return {
    scene: { nodes: nodes as never[] },
    onFrame: (cb: (f: { dt: number }) => void) => {
      void cb;
      return () => {};
    }
  };
}

describe("P5-T1 gpu sim lowering", () => {
  it("simulation:'gpu' lowers sim to 'gpu'", () => {
    expect(emitterOf(lowerEffectNode(node({ simulation: "gpu", particleCount: 50 }))).sim).toBe("gpu");
  });

  it("'auto'/unset picks gpu past the 4096 CPU cap, cpu under it", () => {
    expect(emitterOf(lowerEffectNode(node({ particleCount: 5000 }))).sim).toBe("gpu");
    expect(emitterOf(lowerEffectNode(node({ simulation: "auto", particleCount: 5000 }))).sim).toBe("gpu");
    expect(emitterOf(lowerEffectNode(node({ particleCount: 100 }))).sim).toBe("cpu");
    expect(emitterOf(lowerEffectNode(node({ particleCount: 4096 }))).sim).toBe("cpu");
  });

  it("simulation:'cpu' stays cpu even past the cap", () => {
    expect(emitterOf(lowerEffectNode(node({ simulation: "cpu", particleCount: 50000 }))).sim).toBe("cpu");
  });
});

describe("P5-T1 gpuSimFeed", () => {
  it("publishes one GpuSimSpec-bearing request per gpu emitter", () => {
    const system = new ProductionEffectSystem(
      stubApp([node({ id: "g1", simulation: "gpu", particleCount: 120, emissionRate: 60 })]),
      { tier: "high" }
    );
    const reqs = system.gpuSimFeed();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].nodeId).toBe("g1");
    expect(reqs[0].spec.capacity).toBe(120);
    expect(reqs[0].spec.lifetimeMax).toBeGreaterThan(0);
    expect(reqs[0].spec.emitter?.origin).toEqual([0, 0, 0]);
    expect(reqs[0].emitCount).toBeCloseTo(1);
  });

  it("cpu emitters publish nothing", () => {
    const system = new ProductionEffectSystem(
      stubApp([node({ id: "c1", simulation: "cpu", particleCount: 120 })]),
      { tier: "high" }
    );
    expect(system.gpuSimFeed()).toHaveLength(0);
  });
});
