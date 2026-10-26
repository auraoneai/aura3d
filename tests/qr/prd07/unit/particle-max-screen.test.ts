// Impact-preset particles carry an on-screen size cap so a glow disc can never read as a bubble.

import { describe, expect, it } from "vitest";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { particleVertexSource } from "../../../../packages/rendering/src/vfx/shaders/particle.glsl";

describe("particle max on-screen size", () => {
  it("maxScreen reaches the lowered batch and splits the batch key", () => {
    const capped = lowerEffectNode({ kind: "effect", effect: "particles", id: "a", maxScreen: 0.05 } as never);
    const free = lowerEffectNode({ kind: "effect", effect: "particles", id: "b" } as never);
    if (capped.type !== "emitter" || free.type !== "emitter") throw new Error("expected emitters");
    expect(capped.batch.maxScreen).toBe(0.05);
    expect(free.batch.maxScreen).toBeUndefined();
    expect(capped.emitter.key).not.toBe(free.emitter.key);
  });

  it("the particle vertex shader clamps the billboard to u_maxScreen of the viewport height", () => {
    const src = particleVertexSource({ stretch: false, frameBlend: false, softParticles: false, blendAdditive: true, blendAdditiveFallback: false, unpremultiplyOutput: false, proceduralSoftDot: true, fogAnalytic: false });
    expect(src).toContain("uniform float u_maxScreen;");
    expect(src).toMatch(/if \(u_maxScreen > 0\.0\)/);
    expect(src).toMatch(/off \*= u_maxScreen \/ halfNdc/);
  });
});
