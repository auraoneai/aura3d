import { describe, expect, it } from "vitest";
import { LightUniforms, MAX_DIRECT_LIGHTS } from "../../../packages/rendering/src/LightUniforms";
import type { CollectedLight } from "../../../packages/rendering/src/LightCollector";

class CountingVec extends Array<number> {
  static serialized = 0;
  override toString(): string { CountingVec.serialized += 1; return super.toString(); }
}
const vec = (x: number, y: number, z: number) => CountingVec.from([x, y, z]) as unknown as readonly [number, number, number];

const light = (index: number, overrides: Partial<CollectedLight> = {}): CollectedLight => ({
  kind: "point",
  color: vec(1, 1, 1),
  intensity: 1,
  position: vec(index, 1, 0),
  direction: vec(0, -1, 0),
  range: 6,
  spotAngle: 0,
  penumbra: 0,
  castsShadow: false,
  layerMask: 1,
  source: { id: "same", name: "same" },
  ...overrides
});

// The tie-break key the ranking used before it was made lazy.
const referenceKey = (l: CollectedLight): string => [
  l.kind, l.color, l.intensity, l.position, l.direction, l.right, l.up, l.range, l.width, l.height,
  l.spotAngle, l.penumbra, l.castsShadow ? 1 : 0, l.layerMask, l.twoSided === true ? 1 : 0
].join("|");

describe("direct-light packing tie-break key", () => {
  it("does not serialize light state when every light fits", () => {
    CountingVec.serialized = 0;
    const lights = [0, 1, 2].map((i) => light(i, { intensity: 1 + i, source: { id: `l${i}`, name: `l${i}` } }));
    const packed = LightUniforms.pack(lights);
    expect(packed.lightCount).toBe(3);
    expect(CountingVec.serialized).toBe(0);
  });

  it("still orders exact contribution, name and id ties by the full light state", () => {
    // Positions chosen so numeric and lexicographic order differ (10 < 9 as text).
    const lights = Array.from({ length: MAX_DIRECT_LIGHTS + 4 }, (_, i) => light(MAX_DIRECT_LIGHTS + 3 - i));
    const packed = LightUniforms.pack(lights);
    const expected = [...lights].sort((a, b) => (referenceKey(a) < referenceKey(b) ? -1 : referenceKey(a) > referenceKey(b) ? 1 : 0))
      .slice(0, MAX_DIRECT_LIGHTS);
    const floats = LightUniforms.floatsPerLight;
    expect(packed.lightCount).toBe(MAX_DIRECT_LIGHTS);
    expected.forEach((entry, slot) => expect(packed.data[slot * floats + 4]).toBe(entry.position[0]));
  });
});
