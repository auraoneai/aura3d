// PRD-07 §11 — legacy `emitter: "fountain"` + `radius`/`height` map to a
// plume preset (promote run 38196483050: the 2,000-sprite fountain collapsed
// into a 0.3 m mound at the base because speed 1 m/s met -1.2 m/s² gravity).
// Hex colours decode sRGB → linear (three.js Color parity).

import { describe, expect, it } from "vitest";
import { fountainLaunchSpeed, lowerEffectNode, srgbChannelToLinear } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { createEmitter } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";

const fountain = {
  kind: "effect",
  effect: "particles",
  name: "fountain particles",
  emitter: "fountain",
  materialMode: "additive-glow",
  radius: 1.2,
  height: 2.4,
  speed: 1,
  maxParticles: 2000,
  seed: 1414,
  color: "#ff9a3c",
  prewarm: 3.5
} as const;

describe("§11 fountain plume preset", () => {
  it("launch speed reaches the authored apex under gravity and drag", () => {
    const v0 = fountainLaunchSpeed(2.4, -1.2, 0.12, 2.4);
    expect(v0).toBeGreaterThan(Math.sqrt(2 * 1.2 * 2.4));
    expect(v0).toBeLessThan(Math.sqrt(2 * 1.2 * 2.4) * 1.3);
    expect(fountainLaunchSpeed(2, 0, 0, 2)).toBeCloseTo(1, 5);
  });

  it("prewarmed fountain fills [0, height] over the radius disc", () => {
    const lowered = lowerEffectNode(fountain);
    expect(lowered?.type).toBe("emitter");
    if (lowered?.type !== "emitter") return;
    const state = createEmitter(lowered.emitter);
    expect(state.live).toBeGreaterThan(1000);
    const ys = Array.from(state.py.subarray(0, state.live)).sort((a, b) => a - b);
    const median = ys[Math.floor(ys.length / 2)]!;
    expect(ys[0]!).toBeGreaterThan(-0.05);
    expect(ys[ys.length - 1]!).toBeLessThan(2.4 * 1.05);
    expect(ys[ys.length - 1]!).toBeGreaterThan(2.4 * 0.8);
    expect(median).toBeGreaterThan(0.8);
    let maxR = 0;
    for (let i = 0; i < state.live; i++) maxR = Math.max(maxR, Math.hypot(state.px[i]!, state.pz[i]!));
    expect(maxR).toBeGreaterThan(0.9);
    expect(maxR).toBeLessThan(1.2 + 0.6);
  });

  it("explicit speed ranges and non-fountain emitters keep their mapping", () => {
    const ranged = lowerEffectNode({ ...fountain, speed: [2, 3] });
    expect(ranged?.type === "emitter" && ranged.emitter.speed).toEqual([2, 3]);
    const swirl = lowerEffectNode({ ...fountain, emitter: "swirl" });
    expect(swirl?.type === "emitter" && swirl.emitter.spawnRadius).toBeUndefined();
  });

  it("hex colours are linearized", () => {
    const lowered = lowerEffectNode(fountain);
    if (lowered?.type !== "emitter") throw new Error("expected emitter");
    expect(lowered.emitter.color[0]).toBeCloseTo(1, 5);
    expect(lowered.emitter.color[1]).toBeCloseTo(srgbChannelToLinear(0x9a / 255), 5);
    expect(lowered.emitter.color[2]).toBeCloseTo(srgbChannelToLinear(0x3c / 255), 5);
    expect(srgbChannelToLinear(0.5)).toBeCloseTo(0.214, 3);
  });
});
