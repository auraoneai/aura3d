// PRD-07 P1-T13 — legacy effect-node fields map into lowered emitter options
// (§11 mapping), and non-particle kinds lower to their consumer class.

import { describe, expect, it } from "vitest";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

const base = { kind: "effect", name: "fx", effect: "particles" } as const;

describe("P1-T13 effect-node lowering", () => {
  it("particles/flipbook-sprite lower to cpu emitters, rain/snow to §8.2 volumes; fog/post/beam do not", () => {
    expect(lowerEffectNode({ ...base, effect: "particles" })?.type).toBe("emitter");
    const rain = lowerEffectNode({ ...base, effect: "rain" });
    expect(rain?.type).toBe("volume");
    expect(rain?.consumer).toBe("particle-pass");
    if (rain?.type === "volume") {
      expect(rain.count).toBeGreaterThanOrEqual(200);
      expect(rain.volume.fallVelocity[1]).toBeLessThan(0);
      expect(rain.batch.stretch).toBe(true);
    }
    const snow = lowerEffectNode({ ...base, effect: "snow" });
    expect(snow?.type).toBe("volume");
    if (snow?.type === "volume") expect(snow.batch.stretch).toBe(false);
    expect(lowerEffectNode({ ...base, effect: "flipbook-sprite" })?.type).toBe("emitter");
    expect(lowerEffectNode({ ...base, effect: "fog" })?.consumer).toBe("scene-fog");
    expect(lowerEffectNode({ ...base, effect: "bloom" })?.consumer).toBe("post");
    expect(lowerEffectNode({ ...base, effect: "light-beam" })?.type).toBe("beam");
    expect(lowerEffectNode({ ...base, effect: "unknown-kind" })?.type).toBe("other");
  });

  it("legacy fields change the lowered emitter", () => {
    const slow = lowerEffectNode({ ...base, speed: 1 });
    const fast = lowerEffectNode({ ...base, speed: 10 });
    expect(slow?.type === "emitter" && fast?.type === "emitter").toBe(true);
    if (slow?.type === "emitter" && fast?.type === "emitter") {
      expect(fast.emitter.speed[1]).toBeGreaterThan(slow.emitter.speed[1]);
    }
    const gravity = lowerEffectNode({ ...base, gravity: -20 });
    expect(gravity?.type === "emitter" && gravity.emitter.gravity).toBe(-20);
    const count = lowerEffectNode({ ...base, particleCount: 500 });
    expect(count?.type === "emitter" && count.emitter.capacity).toBeGreaterThanOrEqual(500);
    const tinted = lowerEffectNode({ ...base, color: "#ff0000" });
    expect(tinted?.type === "emitter" && tinted.emitter.color[0]).toBeCloseTo(1, 4);
  });

  it("additive material modes map to additive blend; stretch for spark", () => {
    const glow = lowerEffectNode({ ...base, materialMode: "additive-glow" });
    expect(glow?.type === "emitter" && glow.batch.blend).toBe("additive");
    const spark = lowerEffectNode({ ...base, materialMode: "spark" });
    expect(spark?.type === "emitter" && spark.batch.stretch).toBe(true);
    const smoke = lowerEffectNode({ ...base, materialMode: "smoke" });
    expect(smoke?.type === "emitter" && smoke.batch.blend).not.toBe("additive");
  });
});
