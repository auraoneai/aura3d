import { describe, expect, it } from "vitest";
import { planLocalShadowAtlas } from "../../../../packages/rendering/src/shadows/ShadowAtlas";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

const LIGHTS = [
  { lightIndex: 0, kind: "spot" as const, size: 512, position: [0, 6, 0] as const, direction: [0, -1, 0] as const, range: 20 },
  { lightIndex: 1, kind: "spot" as const, size: 512, position: [3, 6, 3] as const, direction: [-0.3, -1, -0.2] as const, range: 20 },
  { lightIndex: 2, kind: "point" as const, size: 256, position: [0, 3, 0] as const, direction: [0, -1, 0] as const, range: 15 }
];

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("PRD-02 §6.4 local shadow atlas", () => {
  it("2 spot + 1 point at High pack without overlap (spot→1 tile, point→6)", () => {
    const atlasSize = QUALITY_TIERS.high.shadow.mapSize;
    const planned = planLocalShadowAtlas(LIGHTS, atlasSize);
    expect(planned.tiles.length).toBe(2 + 6);
    for (let i = 0; i < planned.tiles.length; i += 1) {
      const a = planned.tiles[i]!.allocation;
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(atlasSize);
      expect(a.y + a.height).toBeLessThanOrEqual(atlasSize);
      for (let j = i + 1; j < planned.tiles.length; j += 1) {
        expect(overlap(a, planned.tiles[j]!.allocation)).toBe(false);
      }
    }
  });

  it("re-allocation within 30 frames returns the same rects", () => {
    const atlasSize = QUALITY_TIERS.high.shadow.mapSize;
    const first = planLocalShadowAtlas(LIGHTS, atlasSize);
    for (let frame = 0; frame < 30; frame += 1) {
      const next = planLocalShadowAtlas(LIGHTS, atlasSize);
      expect(next.tiles.length).toBe(first.tiles.length);
      for (let i = 0; i < next.tiles.length; i += 1) {
        const a = first.tiles[i]!.allocation;
        const b = next.tiles[i]!.allocation;
        expect(next.tiles[i]!.lightIndex).toBe(first.tiles[i]!.lightIndex);
        expect(next.tiles[i]!.face).toBe(first.tiles[i]!.face);
        expect([b.x, b.y, b.width, b.height]).toEqual([a.x, a.y, a.width, a.height]);
      }
    }
  });
});
