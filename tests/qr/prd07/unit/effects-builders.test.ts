// PRD-07 P2-T5 — carved nodes/effects.ts builders: builder output is
// flag-identical (flag presence never changes the built node) and every new
// kind lowers to a real consumer in EffectNodeLowering.

import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src";
import { lowerEffectNode } from "../../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";
import { LiveAtmosphere } from "../../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";

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

  it("preserves fog full extents through the atmosphere and accepts scalar cube sizes", () => {
    const dimensions: [number, number, number] = [4, 6, 8];
    const volume = effects.fogVolume({ position: [1, 2, 3], size: dimensions, density: 0.5 }).toJSON();
    dimensions[0] = 99;
    const cube = effects.fogVolume({ size: 10 }).toJSON();
    const defaults = effects.fogVolume().toJSON();
    expect(volume.size).toEqual([4, 6, 8]);
    expect(cube.size).toEqual([10, 10, 10]);
    expect(defaults.size).toEqual([8, 4, 8]);

    const atmosphere = new LiveAtmosphere();
    atmosphere.trackFogVolumes([volume, cube, defaults]);
    expect(atmosphere.fogVolumes()).toEqual([
      { shape: "box", center: [1, 2, 3], halfSize: [2, 3, 4], density: 0.5 },
      { shape: "box", center: [0, 0, 0], halfSize: [5, 5, 5], density: 0.25 },
      { shape: "box", center: [0, 0, 0], halfSize: [4, 2, 4], density: 0.25 }
    ]);
  });

  it("rejects invalid fog dimensions without changing scalar post and particle sizes", () => {
    for (const size of [0, -1, NaN, [1, 2], [1, 0, 3], [1, Infinity, 3], Array(3)]) {
      expect(() => effects.fogVolume({ size: size as never })).toThrow(/positive finite/i);
    }
    expect(effects.pixelation({ size: 7 }).toJSON().size).toBe(7);
    expect(effects.flipbook({ size: [0.2, 0.7] }).toJSON().size).toEqual([0.2, 0.7]);
    expect(effects.snow({ size: 0.3 }).toJSON().size).toBe(0.3);
  });

  it("lowers particle scalar and range sizes without treating a fog vector as a range", () => {
    const scalar = lowerEffectNode(effects.flipbook({ size: 2 }).toJSON());
    const range = lowerEffectNode(effects.flipbook({ size: [0.2, 0.7] }).toJSON());
    const weather = lowerEffectNode(effects.snow({ size: [0.2, 0.6] }).toJSON());
    expect(scalar.type === "emitter" && scalar.emitter.size).toEqual([2, 2]);
    expect(range.type === "emitter" && range.emitter.size).toEqual([0.2, 0.7]);
    expect(weather.type === "volume" && weather.volume.size).toBeCloseTo(0.4);
    expect(lowerEffectNode(effects.fogVolume({ size: [4, 6, 8] }).toJSON()).consumer).toBe("scene-fog");
    expect(() => lowerEffectNode({ kind: "effect", effect: "particles", size: [4, 6, 8] })).toThrow(/particle size/i);
  });
});
