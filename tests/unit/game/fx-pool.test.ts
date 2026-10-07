import { describe, expect, it } from "vitest";
import { FxPrimitivePool, fxPoolSceneNodes, fxKindCapacity } from "../../../packages/game/src/juice/fx";

describe("juice/fx primitive pool (PRD-09 1750)", () => {
  it("24-spark burst integrates deterministically for seed 7", () => {
    const a = new FxPrimitivePool({ tier: "high", seed: 42 });
    const b = new FxPrimitivePool({ tier: "high", seed: 42 });
    a.burst("spark", [0, 0, 0], { count: 24, seed: 7 });
    b.burst("spark", [0, 0, 0], { count: 24, seed: 7 });
    expect(a.liveCount).toBe(24);
    const captureA: { count: number; m: number[] }[] = [];
    const captureB: { count: number; m: number[] }[] = [];
    const pa = new FxPrimitivePool({ tier: "high", seed: 42, sinkFor: () => ({ setInstanceTransforms: (m, c) => captureA.push({ count: c, m: [...m.slice(0, c * 16)] }), setVisible: () => {} }) });
    const pb = new FxPrimitivePool({ tier: "high", seed: 42, sinkFor: () => ({ setInstanceTransforms: (m, c) => captureB.push({ count: c, m: [...m.slice(0, c * 16)] }), setVisible: () => {} }) });
    pa.burst("spark", [0, 0, 0], { count: 24, seed: 7 });
    pb.burst("spark", [0, 0, 0], { count: 24, seed: 7 });
    for (let i = 0; i < 10; i++) { pa.tick(1 / 60); pb.tick(1 / 60); }
    expect(captureA).toEqual(captureB);
    // Particles actually moved (gravity + velocity)
    expect(captureA[9].m).not.toEqual(captureA[0].m);
  });

  it("liveCount returns to 0 after the longest life", () => {
    const pool = new FxPrimitivePool({ tier: "high", seed: 1 });
    pool.burst("debris", [0, 0, 0], { count: 16, seed: 3 });
    const before = pool.liveCount;
    expect(before).toBe(16);
    // longest debris life is 0.8 s — simulate 1 s
    for (let i = 0; i < 60; i++) pool.tick(1 / 60);
    expect(pool.liveCount).toBe(0);
  });

  it("capacity respects tier caps (low=32 global)", () => {
    expect(fxKindCapacity("low")).toBe(8); // 32/10 -> 3 -> clamp 8
    expect(fxKindCapacity("ultra")).toBe(51);
    const pool = new FxPrimitivePool({ tier: "low" });
    pool.burst("spark", [0, 0, 0], { count: 100, seed: 1 });
    expect(pool.liveCount).toBeLessThanOrEqual(8);
  });

  it("sink sees visible:false when a kind empties", () => {
    const vis: boolean[] = [];
    const pool = new FxPrimitivePool({ tier: "high", sinkFor: () => ({ setInstanceTransforms: () => {}, setVisible: (v) => vis.push(v) }) });
    pool.burst("spark", [0, 0, 0], { count: 4, seed: 1 });
    for (let i = 0; i < 60; i++) pool.tick(1 / 60);
    expect(vis.at(-1)).toBe(false);
    expect(vis[0]).toBe(true);
  });

  it("scene decorator: one hidden instanced node per kind at [0,0,0] scale 1, castShadow false", () => {
    const nodes = fxPoolSceneNodes("medium");
    expect(nodes).toHaveLength(10);
    for (const n of nodes) {
      expect(n.visible).toBe(false);
      expect(n.castShadow).toBe(false);
      expect(n.position).toEqual([0, 0, 0]);
      expect(n.scale).toBe(1);
      expect((n as { instances: unknown[] }).instances.length).toBe(fxKindCapacity("medium"));
    }
    expect((nodes[0] as { primitive: string }).primitive).toBe("sphere"); // spark
    expect((nodes[1] as { primitive: string }).primitive).toBe("plane"); // dust
  });
});
