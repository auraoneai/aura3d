// PRD-07 P1-T8 — writeEmitterInstances is deterministic: the same seed with
// the same stepping produces byte-identical instance buffers across runs.

import { describe, expect, it } from "vitest";
import { createEmitter, stepEmitter, writeEmitterInstances } from "../../../../packages/engine/src/production-runtime/effects/CpuEmitter";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

const FOUNTAIN_NODE = {
  kind: "effect",
  effect: "particles",
  name: "fountain",
  emitter: "fountain",
  particleCount: 2000,
  emissionRate: 800,
  materialMode: "additive-glow",
  seed: 1414
} as const;

describe("P1-T8 instance write determinism", () => {
  it("seed 1414 × 2,000 particles produces identical buffers across two runs", () => {
    const lowered = lowerEffectNode(FOUNTAIN_NODE);
    expect(lowered?.type).toBe("emitter");
    if (lowered?.type !== "emitter") return;

    const run = () => {
      const state = createEmitter({ ...lowered.emitter, capacity: 2000 });
      for (let i = 0; i < 120; i++) stepEmitter(state, 1 / 60);
      const out = new Float32Array(2000 * 16);
      const live = writeEmitterInstances(state, out);
      return { live, out };
    };
    const a = run();
    const b = run();
    expect(a.live).toBeGreaterThan(0);
    expect(a.live).toBe(b.live);
    expect(Buffer.from(a.out.buffer.slice(0, a.live * 64)).equals(Buffer.from(b.out.buffer.slice(0, b.live * 64)))).toBe(true);
  });
});
