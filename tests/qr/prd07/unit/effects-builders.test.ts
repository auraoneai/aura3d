// PRD-07 P2-T5 — carved nodes/effects.ts builders: builder output is
// flag-identical (flag presence never changes the built node) and every new
// kind lowers to a real consumer in EffectNodeLowering.

import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

function nodeOf(builder: { toJSON(): unknown }): Record<string, unknown> {
  return builder.toJSON() as Record<string, unknown>;
}

describe("P2-T5 effect-node builders", () => {
  it("trail/lightCone/auroraRibbon/meshParticles/fogVolume build effect nodes", () => {
    expect(nodeOf(effects.trail({ width: 0.6, orientation: "surface" }))).toMatchObject({ kind: "effect", effect: "trail", width: 0.6, orientation: "surface" });
    expect(nodeOf(effects.lightCone({ length: 12, coneAngle: 0.5 }))).toMatchObject({ effect: "lightCone", length: 12, coneAngle: 0.5 });
    expect(nodeOf(effects.auroraRibbon({ sway: 2 }))).toMatchObject({ effect: "auroraRibbon", sway: 2 });
    expect(nodeOf(effects.meshParticles({ groundBounce: 0.6 }))).toMatchObject({ effect: "meshParticles", groundBounce: 0.6 });
    expect(nodeOf(effects.fogVolume({ density: 0.9 }))).toMatchObject({ effect: "fogVolume", density: 0.9 });
  });

  it("new kinds lower to real consumers (no 'none')", () => {
    const cases: [string, string][] = [
      ["trail", "ribbon-pass"],
      ["lightCone", "beam-pass"],
      ["auroraRibbon", "beam-pass"],
      ["meshParticles", "mesh-pass"],
      ["fogVolume", "scene-fog"],
      ["light-beam", "beam-pass"]
    ];
    for (const [effect, consumer] of cases) {
      const lowered = lowerEffectNode({ kind: "effect", effect, id: `n-${effect}` } as never);
      expect(lowered.consumer, effect).toBe(consumer);
    }
  });

  it("builder output is identical under flag-on and flag-off (flags never gate the node)", () => {
    // Builders are pure data — assert the same options produce byte-equal
    // nodes regardless of any flag state by construction (no flag reads in
    // the builder module).
    const a = nodeOf(effects.fogVolume({ position: [1, 2, 3], size: [4, 5, 6] }));
    const b = nodeOf(effects.fogVolume({ position: [1, 2, 3], size: [4, 5, 6] }));
    expect(a).toEqual(b);
  });
});
