/**
 * GU47 phase 2: `world.water` draws a square grid over the shape's bounding square. Nothing clipped it to the shape,
 * so aura-diamond-3d's 220 x 80 m harbor polygon drew 220 x 220 m. The 70 m past the bay refracted the far plane
 * (Beer-Lambert over ~1000 m) and showed as a black-to-orange panel above the right-field stands, where 4.6.2 had a blue
 * plane. A circle lake drew its whole square too: the outside of a circle read shore distance 0.
 * Fix: `a_shore` is a signed distance to the shape edge, and both water programs discard where it is negative.
 */
import { describe, expect, it } from "vitest";
import { waterShoreDistance } from "../../../../packages/engine/src/production-runtime/world/WaterRuntime";
import { underwaterShaderSources, waterShaderSources } from "../../../../packages/rendering/src/world/water/WaterMaterial";

type Shape =
  | { kind: "polygon"; points: (readonly [number, number])[] }
  | { kind: "circle"; center: readonly [number, number]; radius: number }
  | { kind: "infinite"; radius: number };

const record = (shape: Shape) => ({ options: { shape } }) as unknown as Parameters<typeof waterShoreDistance>[0];

/** aura-diamond-3d HARBOR_WATER: x 150, z -160, w 220, d 80. */
const harbor = record({ kind: "polygon", points: [[40, -200], [260, -200], [260, -120], [40, -120]] });

describe("world.water clips its square grid to the shape", () => {
  it("polygon: positive inside, zero on the edge, negative outside (the part of the square past the bay)", () => {
    expect(waterShoreDistance(harbor, 150, -160)).toBe(8);
    expect(waterShoreDistance(harbor, 150, -197)).toBeCloseTo(3, 6);
    expect(waterShoreDistance(harbor, 150, -200)).toBe(0);
    expect(waterShoreDistance(harbor, 150, -203)).toBeCloseTo(-3, 6);
    expect(waterShoreDistance(harbor, 150, -260)).toBe(-8);
    expect(waterShoreDistance(harbor, 150, -60)).toBe(-8);
  });

  it("polygon: the 220 x 220 grid keeps exactly the 220 x 80 bay (signed distance is linear across each edge)", () => {
    const res = 64, extent = 220, cx = 150, cz = -160;
    let kept = 0;
    for (let r = 0; r < res; r += 1) {
      const z = cz - extent / 2 + (r / (res - 1)) * extent;
      if (waterShoreDistance(harbor, cx, z) >= 0) kept += 1;
    }
    // Row z = -270 + r * 220 / 63 lies in [-200, -120] for r = 21..42: 22 of 64 rows.
    expect(kept).toBe(22);
  });

  it("circle: negative outside the radius, so the square corners are clipped", () => {
    const lake = record({ kind: "circle", center: [0, -8], radius: 7 });
    expect(waterShoreDistance(lake, 0, -8)).toBe(7);
    expect(waterShoreDistance(lake, 7, -1)).toBeLessThan(0);
    expect(waterShoreDistance(lake, 40, -8)).toBe(-8);
  });

  it("open water never clips", () => {
    expect(waterShoreDistance(record({ kind: "infinite", radius: 500 }), 1e4, 1e4)).toBe(8);
  });

  it("both water programs discard where the interpolated shore distance is negative", () => {
    for (const src of [waterShaderSources({ hasScene: true, planar: false }), waterShaderSources({ hasScene: false, planar: true }), underwaterShaderSources()]) {
      expect(src.fragment).toMatch(/if \(v_shore < 0\.0\) discard;/);
    }
  });
});
