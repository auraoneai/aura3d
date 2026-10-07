// PRD-07 §6.2 emitter surface — the new options reach lowering and the CPU
// emitter: seed pins determinism, blend overrides materialMode mapping,
// size/maxParticles/prewarm honoured end to end.

import { describe, expect, it } from "vitest";
import { effects, scene } from "../../../../packages/engine/src";
import { lowerEffectNode, type EffectNodeLike, type LoweredParticleEffect } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { createEmitter } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";

function nodeOf(builder: unknown): EffectNodeLike {
  // AuraNodeBuilder stores the spec as the private `value`; the compiler
  // consumes the same raw object.
  return (builder as { value: EffectNodeLike }).value;
}

function lowerParticles(options: Parameters<typeof effects.particles>[0]): LoweredParticleEffect {
  const lowered = lowerEffectNode(nodeOf(effects.particles(options)));
  if (lowered.type !== "emitter") throw new Error("expected emitter lowering");
  return lowered;
}

describe("§6.2 emitter options", () => {
  it("seed is carried through the builder into the descriptor", () => {
    const a = lowerParticles({ seed: 1414 });
    const b = lowerParticles({ seed: 1414 });
    const c = lowerParticles({ seed: 1415 });
    expect(a.emitter.seed).toBe(1414);
    expect(b.emitter.seed).toBe(1414);
    expect(c.emitter.seed).not.toBe(1414);
  });

  it("explicit blend overrides the materialMode mapping", () => {
    const additive = lowerParticles({ materialMode: "soft-alpha", blend: "additive" });
    expect(additive.batch.blend).toBe("additive");
    expect(additive.emitter.key).toContain("eff.additive.");
    const premult = lowerParticles({ materialMode: "additive-glow", blend: "premultiplied" });
    expect(premult.batch.blend).toBe("premultiplied");
    expect(premult.emitter.key).toContain("eff.premultiplied.");
  });

  it("invalid blend falls back to the materialMode mapping", () => {
    const lowered = lowerParticles({ materialMode: "additive-glow", blend: "banana" as never });
    expect(lowered.batch.blend).toBe("additive");
  });

  it("size scalar and range map to the emitter size range", () => {
    expect(lowerParticles({ size: 0.06 }).emitter.size).toEqual([0.06, 0.06]);
    expect(lowerParticles({ size: [0.04, 0.12] }).emitter.size).toEqual([0.04, 0.12]);
  });

  it("maxParticles sets capacity; particleCount stays the legacy fallback", () => {
    expect(lowerParticles({ maxParticles: 2000 }).emitter.capacity).toBe(2000);
    expect(lowerParticles({ particleCount: 500, maxParticles: 2000 }).emitter.capacity).toBe(2000);
    expect(lowerParticles({ particleCount: 500 }).emitter.capacity).toBe(500);
  });

  it("rate overrides emissionRate; lifetime maps to the life range", () => {
    const lowered = lowerParticles({ rate: 400, lifetime: [0.5, 1.5] });
    expect(lowered.emitter.emissionRate).toBe(400);
    expect(lowered.emitter.life).toEqual([0.5, 1.5]);
  });

  it("prewarm reaches the descriptor and populates the emitter at creation", () => {
    const lowered = lowerParticles({ maxParticles: 2000, seed: 1414, prewarm: 2.5 });
    expect(lowered.emitter.prewarm).toBe(2.5);
    const warm = createEmitter(lowered.emitter);
    expect(warm.live).toBeGreaterThan(0);
    // Steady state: ~ rate * life fraction live at t=0, well above a cold start.
    const cold = createEmitter({ ...lowered.emitter, prewarm: undefined });
    expect(warm.live).toBeGreaterThan(cold.live);
  });

  it("prewarm is deterministic", () => {
    const lowered = lowerParticles({ maxParticles: 64, seed: 42, prewarm: 1 });
    const a = createEmitter(lowered.emitter);
    const b = createEmitter(lowered.emitter);
    expect(a.live).toBe(b.live);
    expect(Array.from(a.px.slice(0, 8))).toEqual(Array.from(b.px.slice(0, 8)));
  });
});

describe("builder option passthrough", () => {
  it("new fields ride the node value to the compiler", () => {
    const node = nodeOf(effects.particles({ seed: 1414, blend: "additive", size: 0.06, maxParticles: 2000, prewarm: 1.25 }));
    expect(node.seed).toBe(1414);
    expect(node.blend).toBe("additive");
    expect(node.size).toBe(0.06);
    expect(node.maxParticles).toBe(2000);
    expect(node.prewarm).toBe(1.25);
  });

  it("scene() accepts emitter-option particles nodes", () => {
    const s = scene().add(effects.particles({ name: "fountain", seed: 1414, maxParticles: 2000, blend: "additive", size: 0.06 }));
    expect(s).toBeDefined();
  });
});
